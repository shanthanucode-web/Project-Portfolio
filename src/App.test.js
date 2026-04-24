import { render, screen } from '@testing-library/react';
import App from './App';

class ClosingWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = ClosingWebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = ClosingWebSocket.CLOSED;
      this.onclose?.();
    }, 0);
  }

  close() {
    this.readyState = ClosingWebSocket.CLOSED;
    this.onclose?.();
  }

  send() {}
}

test('renders Coach Nova home with demo fallback available', async () => {
  const originalWebSocket = global.WebSocket;
  global.WebSocket = ClosingWebSocket;

  render(<App />);

  expect(await screen.findByText(/Coach Nova/i)).toBeInTheDocument();
  expect(screen.getByText(/Demo mode/i)).toBeInTheDocument();

  global.WebSocket = originalWebSocket;
});
