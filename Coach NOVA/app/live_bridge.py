from __future__ import annotations

import asyncio
import json
import threading
from queue import Queue
from typing import Any, Callable, Optional

try:
    from websockets.asyncio.server import serve
except ImportError:  # pragma: no cover - import path varies by installed version
    try:
        from websockets.server import serve  # type: ignore
    except ImportError:  # pragma: no cover - dependency may not be installed yet
        serve = None  # type: ignore

try:  # pragma: no cover - only exercised in environments without websockets
    from PySide6.QtNetwork import QHostAddress
    from PySide6.QtWebSockets import QWebSocketServer
except ImportError:  # pragma: no cover - desktop runtime may not be available in tests
    QHostAddress = None  # type: ignore
    QWebSocketServer = None  # type: ignore


class LiveBridgeServer:
    def __init__(
        self,
        command_queue: Queue,
        status_provider: Callable[[], dict[str, Any]],
        host: str = "127.0.0.1",
        port: int = 8765,
    ) -> None:
        self.command_queue = command_queue
        self.status_provider = status_provider
        self.host = host
        self.port = port
        self.backend = "asyncio" if serve is not None else "qt" if QWebSocketServer is not None else "unavailable"
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.thread: Optional[threading.Thread] = None
        self.clients: set[Any] = set()
        self.server = None
        self.available = self.backend != "unavailable"
        self.startup_error: Optional[str] = None
        self._started_event = threading.Event()

    def start(self) -> bool:
        if not self.available:
            self.startup_error = "No WebSocket backend is available. Install 'websockets' or ensure PySide6 QtWebSockets is installed."
            return False
        if self.thread is not None:
            return self.server is not None and self.startup_error is None
        if self.backend == "qt":
            return self._start_qt_server()

        self.startup_error = None
        self._started_event.clear()
        self.thread = threading.Thread(target=self._run_loop, name="live-bridge", daemon=True)
        self.thread.start()
        self._started_event.wait(timeout=1.5)
        return self.server is not None and self.startup_error is None

    def stop(self) -> None:
        if self.backend == "qt":
            self._stop_qt_server()
            return
        if self.loop is None:
            return

        async def _shutdown() -> None:
            if self.server is not None:
                self.server.close()
                await self.server.wait_closed()
            for client in list(self.clients):
                try:
                    await client.close()
                except Exception:
                    pass
            self.clients.clear()

        future = asyncio.run_coroutine_threadsafe(_shutdown(), self.loop)
        try:
            future.result(timeout=2)
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self.loop.stop)
        if self.thread is not None:
            self.thread.join(timeout=2)
        self.thread = None
        self.loop = None
        self.server = None
        self.startup_error = None
        self._started_event.clear()

    def broadcast(self, message_type: str, payload: dict[str, Any]) -> None:
        if not self.clients:
            return
        message = json.dumps({"type": message_type, "payload": payload})
        if self.backend == "qt":
            self._broadcast_qt_message(message)
            return
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast_message(message), self.loop)

    async def _broadcast_message(self, message: str) -> None:
        stale_clients: list[Any] = []
        for client in list(self.clients):
            try:
                await client.send(message)
            except Exception:
                stale_clients.append(client)
        for client in stale_clients:
            self.clients.discard(client)

    def _run_loop(self) -> None:
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        try:
            self.loop.run_until_complete(self._start_server())
        except Exception as exc:
            self.startup_error = str(exc)
            self._started_event.set()
            return
        self.loop.run_forever()

    async def _start_server(self) -> None:
        if serve is None:
            self.startup_error = "Python package 'websockets' is not installed."
            self._started_event.set()
            return
        self.server = await serve(self._handle_connection, self.host, self.port)
        self._started_event.set()

    async def _handle_connection(self, websocket: Any) -> None:
        self.clients.add(websocket)
        await websocket.send(
            json.dumps(
                {
                    "type": "bridge_status",
                    "payload": self.status_provider(),
                }
            )
        )
        try:
            async for raw_message in websocket:
                await self._handle_message(raw_message)
        finally:
            self.clients.discard(websocket)

    async def _handle_message(self, raw_message: str) -> None:
        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            return
        if not isinstance(message, dict):
            return
        message_type = message.get("type")
        payload = message.get("payload", {})
        if not isinstance(payload, dict) or not isinstance(message_type, str):
            return
        self.command_queue.put({"type": message_type, "payload": payload})

    def _start_qt_server(self) -> bool:
        if QWebSocketServer is None or QHostAddress is None:
            self.startup_error = "PySide6 QtWebSockets is not installed."
            return False
        try:
            server = QWebSocketServer("BarbellBuddy Live Bridge", QWebSocketServer.SslMode.NonSecureMode)
            address = QHostAddress(self.host)
            if not server.listen(address, self.port):
                self.startup_error = server.errorString()
                return False
            server.newConnection.connect(self._handle_qt_connection)
            self.server = server
            self.startup_error = None
            return True
        except Exception as exc:  # pragma: no cover - depends on local Qt runtime
            self.startup_error = str(exc)
            self.server = None
            return False

    def _stop_qt_server(self) -> None:
        for client in list(self.clients):
            try:
                client.close()
            except Exception:
                pass
        self.clients.clear()
        if self.server is not None:
            try:
                self.server.close()
            except Exception:
                pass
        self.server = None
        self.startup_error = None

    def _handle_qt_connection(self) -> None:
        if self.server is None:
            return
        while self.server.hasPendingConnections():
            websocket = self.server.nextPendingConnection()
            self.clients.add(websocket)
            websocket.textMessageReceived.connect(
                lambda raw_message, ws=websocket: self._handle_qt_message(ws, raw_message)
            )
            websocket.disconnected.connect(lambda ws=websocket: self.clients.discard(ws))
            try:
                websocket.sendTextMessage(
                    json.dumps(
                        {
                            "type": "bridge_status",
                            "payload": self.status_provider(),
                        }
                    )
                )
            except Exception:
                self.clients.discard(websocket)

    def _handle_qt_message(self, websocket: Any, raw_message: str) -> None:
        if websocket not in self.clients:
            return
        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            return
        if not isinstance(message, dict):
            return
        message_type = message.get("type")
        payload = message.get("payload", {})
        if not isinstance(payload, dict) or not isinstance(message_type, str):
            return
        self.command_queue.put({"type": message_type, "payload": payload})

    def _broadcast_qt_message(self, message: str) -> None:
        stale_clients: list[Any] = []
        for client in list(self.clients):
            try:
                client.sendTextMessage(message)
            except Exception:
                stale_clients.append(client)
        for client in stale_clients:
            self.clients.discard(client)
