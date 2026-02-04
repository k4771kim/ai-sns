import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';

const BASE_URL = 'http://localhost:8787';
const WS_URL = 'ws://localhost:8787';

// These tests require the server to be running
// Run: npm run server (in another terminal)

describe('REST API', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(typeof data.agents).toBe('number');
      expect(typeof data.rooms).toBe('number');
      expect(typeof data.uptime).toBe('number');
    });
  });

  describe('GET /api/agents', () => {
    it('should return agents list', async () => {
      const res = await fetch(`${BASE_URL}/api/agents`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.agents)).toBe(true);
    });
  });

  describe('GET /api/rooms', () => {
    it('should return rooms list', async () => {
      const res = await fetch(`${BASE_URL}/api/rooms`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.rooms)).toBe(true);
    });
  });

  describe('POST /api/messages', () => {
    it('should reject missing content', async () => {
      const res = await fetch(`${BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'some-agent' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('content');
    });

    it('should reject missing target', async () => {
      const res = await fetch(`${BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Specify');
    });

    it('should reject invalid agentId', async () => {
      const res = await fetch(`${BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello', to: 'invalid agent!' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await fetch(`${BASE_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello', to: 'nonexistent-agent' }),
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });
});

describe('WebSocket', () => {
  let ws: WebSocket;

  afterAll(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should reject connection without agentId', async () => {
    return new Promise<void>((resolve) => {
      const testWs = new WebSocket(WS_URL);

      testWs.on('close', (code) => {
        expect(code).toBe(4001);
        resolve();
      });

      testWs.on('error', () => {
        // Expected for rejected connection
        resolve();
      });
    });
  });

  it('should reject invalid agentId', async () => {
    return new Promise<void>((resolve) => {
      const testWs = new WebSocket(`${WS_URL}?agentId=invalid%20agent!`);

      testWs.on('close', (code) => {
        expect(code).toBe(4001);
        resolve();
      });

      testWs.on('error', () => {
        resolve();
      });
    });
  });

  it('should connect with valid agentId', async () => {
    return new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`${WS_URL}?agentId=test-agent-${Date.now()}`);

      ws.on('open', () => {
        // Connection successful
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'connected') {
          expect(msg.agentId).toBeDefined();
          expect(msg.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should join and leave rooms', async () => {
    return new Promise<void>((resolve, reject) => {
      const testWs = new WebSocket(`${WS_URL}?agentId=room-test-${Date.now()}`);
      let joinedReceived = false;

      testWs.on('open', () => {
        // Wait for connected message first
      });

      testWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'connected') {
          // Now join a room
          testWs.send(JSON.stringify({ type: 'join', room: 'test-room' }));
        } else if (msg.type === 'joined') {
          expect(msg.room).toBe('test-room');
          expect(Array.isArray(msg.members)).toBe(true);
          joinedReceived = true;
          // Now leave
          testWs.send(JSON.stringify({ type: 'leave', room: 'test-room' }));
        } else if (msg.type === 'left' && joinedReceived) {
          expect(msg.room).toBe('test-room');
          testWs.close();
          resolve();
        }
      });

      testWs.on('error', reject);

      setTimeout(() => {
        testWs.close();
        reject(new Error('Test timeout'));
      }, 5000);
    });
  });

  it('should handle ping/pong', async () => {
    return new Promise<void>((resolve, reject) => {
      const testWs = new WebSocket(`${WS_URL}?agentId=ping-test-${Date.now()}`);

      testWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'connected') {
          testWs.send(JSON.stringify({ type: 'ping' }));
        } else if (msg.type === 'pong') {
          expect(msg.timestamp).toBeDefined();
          testWs.close();
          resolve();
        }
      });

      testWs.on('error', reject);

      setTimeout(() => {
        testWs.close();
        reject(new Error('Ping timeout'));
      }, 5000);
    });
  });
});
