import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

const PORT = process.env.PORT || 8787;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
const CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';

// In-memory stores
const agents = new Map(); // agentId -> { ws, metadata, rooms: Set, lastSeen }
const rooms = new Map();  // roomName -> Set<agentId>

const app = express();

// Parse CORS origins (comma-separated or wildcard)
const corsOptions = {
  origin: CORS_ORIGINS === '*' ? true : CORS_ORIGINS.split(',').map(o => o.trim())
};
app.use(cors(corsOptions));
app.use(express.json());

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Utility: broadcast to all agents in a room
function broadcastToRoom(roomName, message, excludeAgentId = null) {
  const roomAgents = rooms.get(roomName);
  if (!roomAgents) return;

  const payload = JSON.stringify(message);
  for (const agentId of roomAgents) {
    if (agentId === excludeAgentId) continue;
    const agent = agents.get(agentId);
    if (agent?.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(payload);
    }
  }
}

// Utility: broadcast to a specific agent
function sendToAgent(agentId, message) {
  const agent = agents.get(agentId);
  if (agent?.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Utility: remove agent from all rooms and notify
function removeAgent(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return;

  for (const roomName of agent.rooms) {
    const roomAgents = rooms.get(roomName);
    if (roomAgents) {
      roomAgents.delete(agentId);
      broadcastToRoom(roomName, {
        type: 'agent_left',
        agentId,
        room: roomName,
        timestamp: Date.now()
      });
      if (roomAgents.size === 0) {
        rooms.delete(roomName);
      }
    }
  }
  agents.delete(agentId);
  console.log(`Agent disconnected: ${agentId}`);
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const agentId = url.searchParams.get('agentId');

  if (!agentId) {
    ws.close(4001, 'Missing agentId query parameter');
    return;
  }

  // Disconnect existing connection with same agentId
  if (agents.has(agentId)) {
    const existing = agents.get(agentId);
    existing.ws.close(4002, 'Replaced by new connection');
    removeAgent(agentId);
  }

  // Parse optional metadata from query
  let metadata = {};
  const metaParam = url.searchParams.get('metadata');
  if (metaParam) {
    try {
      metadata = JSON.parse(metaParam);
    } catch (e) {
      // Ignore invalid JSON
    }
  }

  // Register the agent
  agents.set(agentId, {
    ws,
    metadata,
    rooms: new Set(),
    lastSeen: Date.now()
  });

  console.log(`Agent connected: ${agentId}`, metadata);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    agentId,
    timestamp: Date.now()
  }));

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    const agent = agents.get(agentId);
    if (agent) agent.lastSeen = Date.now();
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const agent = agents.get(agentId);
    if (!agent) return;
    agent.lastSeen = Date.now();

    switch (msg.type) {
      case 'join': {
        const roomName = msg.room;
        if (!roomName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing room name' }));
          return;
        }
        if (!rooms.has(roomName)) {
          rooms.set(roomName, new Set());
        }
        rooms.get(roomName).add(agentId);
        agent.rooms.add(roomName);

        // Notify room about new member
        broadcastToRoom(roomName, {
          type: 'agent_joined',
          agentId,
          room: roomName,
          timestamp: Date.now()
        }, agentId);

        // Confirm join to the agent
        ws.send(JSON.stringify({
          type: 'joined',
          room: roomName,
          members: Array.from(rooms.get(roomName)),
          timestamp: Date.now()
        }));
        console.log(`Agent ${agentId} joined room: ${roomName}`);
        break;
      }

      case 'leave': {
        const roomName = msg.room;
        if (!roomName || !agent.rooms.has(roomName)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not in room' }));
          return;
        }
        agent.rooms.delete(roomName);
        const roomAgents = rooms.get(roomName);
        if (roomAgents) {
          roomAgents.delete(agentId);
          broadcastToRoom(roomName, {
            type: 'agent_left',
            agentId,
            room: roomName,
            timestamp: Date.now()
          });
          if (roomAgents.size === 0) {
            rooms.delete(roomName);
          }
        }
        ws.send(JSON.stringify({
          type: 'left',
          room: roomName,
          timestamp: Date.now()
        }));
        console.log(`Agent ${agentId} left room: ${roomName}`);
        break;
      }

      case 'message': {
        // Direct message or room message via WebSocket
        const payload = {
          type: 'message',
          from: agentId,
          content: msg.content,
          timestamp: Date.now()
        };

        if (msg.to) {
          // Direct message to specific agent
          payload.to = msg.to;
          const sent = sendToAgent(msg.to, payload);
          if (!sent) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Agent ${msg.to} not found or not connected`
            }));
          }
        } else if (msg.room && agent.rooms.has(msg.room)) {
          // Room message
          payload.room = msg.room;
          broadcastToRoom(msg.room, payload, agentId);
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Specify "to" (agentId) or "room" for message'
          }));
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      }

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${msg.type}`
        }));
    }
  });

  ws.on('close', () => {
    removeAgent(agentId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${agentId}:`, err.message);
    removeAgent(agentId);
  });
});

// Heartbeat interval - ping all clients
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// REST API: Get all connected agents
app.get('/api/agents', (req, res) => {
  const agentList = [];
  for (const [agentId, data] of agents) {
    agentList.push({
      agentId,
      metadata: data.metadata,
      rooms: Array.from(data.rooms),
      lastSeen: data.lastSeen
    });
  }
  res.json({ agents: agentList });
});

// REST API: Get all rooms
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [roomName, members] of rooms) {
    roomList.push({
      name: roomName,
      members: Array.from(members)
    });
  }
  res.json({ rooms: roomList });
});

// REST API: Send message
app.post('/api/messages', (req, res) => {
  const { from, to, room, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Missing content' });
  }

  const payload = {
    type: 'message',
    from: from || 'api',
    content,
    timestamp: Date.now()
  };

  if (to) {
    // Direct message to agent
    payload.to = to;
    const sent = sendToAgent(to, payload);
    if (!sent) {
      return res.status(404).json({ error: `Agent ${to} not found or not connected` });
    }
    return res.json({ success: true, delivered: 1 });
  }

  if (room) {
    // Room broadcast
    if (!rooms.has(room)) {
      return res.status(404).json({ error: `Room ${room} not found` });
    }
    payload.room = room;
    broadcastToRoom(room, payload);
    return res.json({ success: true, delivered: rooms.get(room).size });
  }

  return res.status(400).json({ error: 'Specify "to" (agentId) or "room"' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agents: agents.size,
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

server.listen(PORT, () => {
  console.log(`SNS-AI server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}?agentId=YOUR_AGENT_ID`);
});
