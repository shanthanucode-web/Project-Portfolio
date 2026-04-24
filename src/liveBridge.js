const LOCAL_BRIDGE_PORT = 8765;

function defaultBridgeUrls() {
  const urls = [];
  const hostname = window.location.hostname;

  if (hostname && hostname !== '127.0.0.1' && hostname !== 'localhost') {
    urls.push(`ws://${hostname}:${LOCAL_BRIDGE_PORT}`);
  }

  urls.push(`ws://127.0.0.1:${LOCAL_BRIDGE_PORT}`);
  urls.push(`ws://localhost:${LOCAL_BRIDGE_PORT}`);

  return [...new Set(urls)];
}

export function createLiveBridgeClient({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
} = {}) {
  let socket = null;
  let activeUrl = null;

  const isConnected = () => socket && socket.readyState === WebSocket.OPEN;

  const disconnect = () => {
    if (socket) {
      socket.close();
      socket = null;
    }
  };

  const connectToUrl = (targetUrl, timeoutMs = 1500) =>
    new Promise((resolve, reject) => {
      if (isConnected()) {
        resolve(true);
        return;
      }

      let settled = false;
      const ws = new WebSocket(targetUrl);
      socket = ws;
      activeUrl = targetUrl;

      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {}
        reject(new Error('Bridge connection timed out'));
      }, timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        onOpen?.();
        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          onError?.(error);
        }
      };

      ws.onclose = () => {
        window.clearTimeout(timeout);
        if (socket === ws) socket = null;
        onClose?.();
        if (!settled) {
          settled = true;
          reject(new Error('Bridge connection closed'));
        }
      };

      ws.onerror = (event) => {
        onError?.(event);
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error('Bridge connection error'));
        }
      };
    });

  const connect = async (timeoutMs = 1500) => {
    const urls = Array.isArray(url) ? url : (url ? [url] : defaultBridgeUrls());
    let lastError = null;
    for (const targetUrl of urls) {
      try {
        await connectToUrl(targetUrl, timeoutMs);
        return true;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Bridge connection failed');
  };

  const send = (type, payload = {}) => {
    if (!isConnected()) return false;
    socket.send(JSON.stringify({ type, payload }));
    return true;
  };

  return {
    connect,
    disconnect,
    send,
    isConnected,
    getActiveUrl: () => activeUrl,
  };
}
