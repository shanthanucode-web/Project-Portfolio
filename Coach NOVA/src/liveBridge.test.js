import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveBridgeClient } from './liveBridge';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  send(message) {
    this.lastMessage = message;
  }
}

describe('createLiveBridgeClient', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      WebSocket: FakeWebSocket,
    });
  });

  afterEach(() => {
    vi.stubGlobal('window', originalWindow);
    if (originalWebSocket) {
      vi.stubGlobal('WebSocket', originalWebSocket);
    } else {
      vi.unstubAllGlobals();
    }
  });

  it('tries bridge URLs in order and resolves when one opens', async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const client = createLiveBridgeClient({
      url: ['ws://first.local', 'ws://second.local'],
      onOpen,
      onClose,
    });

    const connectPromise = client.connect(25);
    expect(FakeWebSocket.instances[0].url).toBe('ws://first.local');
    FakeWebSocket.instances[0].close();

    await Promise.resolve();
    expect(FakeWebSocket.instances[1].url).toBe('ws://second.local');
    FakeWebSocket.instances[1].readyState = FakeWebSocket.OPEN;
    FakeWebSocket.instances[1].onopen();

    await expect(connectPromise).resolves.toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(client.isConnected()).toBe(true);
  });
});
