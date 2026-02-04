import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

// =============================================================================
// Configuration
// =============================================================================

const config = {
  port: parseInt(process.env.PORT || '8787', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
  rateLimitMaxPerSecond: parseInt(process.env.RATE_LIMIT_MAX_PER_SECOND || '10', 10),
  maxAgentIdLength: parseInt(process.env.MAX_AGENT_ID_LENGTH || '64', 10),
  maxRoomNameLength: parseInt(process.env.MAX_ROOM_NAME_LENGTH || '100', 10),
  maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '10000', 10),
  maxMessagesStored: parseInt(process.env.MAX_MESSAGES_STORED || '1000', 10),
};

// =============================================================================
// Types
// =============================================================================

interface AgentMetadata {
  [key: string]: unknown;
}

interface Agent {
  ws: WebSocket & { isAlive?: boolean };
  metadata: AgentMetadata;
  rooms: Set<string>;
  lastSeen: number;
  messageCount: number;
  messageCountResetTime: number;
}

interface WsMessage {
  type: string;
  room?: string;
  to?: string;
  content?: string;
  [key: string]: unknown;
}

interface BroadcastMessage {
  type: string;
  agentId?: string;
  from?: string;
  to?: string;
  room?: string;
  content?: string;
  members?: string[];
  message?: string;
  timestamp: number;
}

// =============================================================================
// Validation
// =============================================================================

const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateAgentId(agentId: string | null): { valid: boolean; error?: string } {
  if (!agentId) {
    return { valid: false, error: 'Missing agentId query parameter' };
  }
  const trimmed = agentId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'agentId cannot be empty' };
  }
  if (trimmed.length > config.maxAgentIdLength) {
    return { valid: false, error: `agentId must be ${config.maxAgentIdLength} characters or less` };
  }
  if (!AGENT_ID_REGEX.test(trimmed)) {
    return { valid: false, error: 'agentId must contain only alphanumeric characters, underscores, and hyphens' };
  }
  return { valid: true };
}

function validateRoomName(roomName: string | undefined): { valid: boolean; error?: string } {
  if (!roomName || typeof roomName !== 'string') {
    return { valid: false, error: 'Missing room name' };
  }
  const trimmed = roomName.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Room name cannot be empty' };
  }
  if (trimmed.length > config.maxRoomNameLength) {
    return { valid: false, error: `Room name must be ${config.maxRoomNameLength} characters or less` };
  }
  return { valid: true };
}

function validateMessageContent(content: unknown): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Missing message content' };
  }
  if (content.length > config.maxMessageLength) {
    return { valid: false, error: `Message must be ${config.maxMessageLength} characters or less` };
  }
  return { valid: true };
}

// =============================================================================
// Rate Limiting
// =============================================================================

function checkRateLimit(agent: Agent): boolean {
  const now = Date.now();
  if (now > agent.messageCountResetTime) {
    agent.messageCount = 0;
    agent.messageCountResetTime = now + 1000;
  }
  agent.messageCount++;
  return agent.messageCount <= config.rateLimitMaxPerSecond;
}

// =============================================================================
// In-memory stores
// =============================================================================

const agents = new Map<string, Agent>();
const rooms = new Map<string, Set<string>>();

// =============================================================================
// Express app setup
// =============================================================================

const app = express();
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

const server = createServer(app);
const wss = new WebSocketServer({ server });

// =============================================================================
// Utility functions
// =============================================================================

function broadcastToRoom(roomName: string, message: BroadcastMessage, excludeAgentId: string | null = null): void {
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

function sendToAgent(agentId: string, message: BroadcastMessage): boolean {
  const agent = agents.get(agentId);
  if (agent?.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message, timestamp: Date.now() }));
  }
}

function removeAgent(agentId: string): void {
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
        timestamp: Date.now(),
      });
      if (roomAgents.size === 0) {
        rooms.delete(roomName);
      }
    }
  }
  agents.delete(agentId);
  console.log(`[${new Date().toISOString()}] Agent disconnected: ${agentId}`);
}

// =============================================================================
// WebSocket connection handler
// =============================================================================

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const agentIdParam = url.searchParams.get('agentId');

  // Validate agentId
  const validation = validateAgentId(agentIdParam);
  if (!validation.valid) {
    ws.close(4001, validation.error);
    return;
  }
  const agentId = agentIdParam!.trim();

  // Validate origin in production
  if (config.nodeEnv === 'production') {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      ws.close(4003, 'Origin not allowed');
      return;
    }
  }

  // Disconnect existing connection with same agentId
  if (agents.has(agentId)) {
    const existing = agents.get(agentId)!;
    existing.ws.close(4002, 'Replaced by new connection');
    removeAgent(agentId);
  }

  // Parse optional metadata
  let metadata: AgentMetadata = {};
  const metaParam = url.searchParams.get('metadata');
  if (metaParam) {
    try {
      metadata = JSON.parse(metaParam);
    } catch (e) {
      console.debug(`[${new Date().toISOString()}] Invalid metadata JSON for ${agentId}`);
    }
  }

  // Register the agent
  const agent: Agent = {
    ws,
    metadata,
    rooms: new Set(),
    lastSeen: Date.now(),
    messageCount: 0,
    messageCountResetTime: Date.now() + 1000,
  };
  agents.set(agentId, agent);

  console.log(`[${new Date().toISOString()}] Agent connected: ${agentId}`, Object.keys(metadata).length > 0 ? metadata : '');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    agentId,
    timestamp: Date.now(),
  }));

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    agent.lastSeen = Date.now();
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    // Rate limiting
    if (!checkRateLimit(agent)) {
      sendError(ws, 'Rate limit exceeded. Please slow down.');
      return;
    }

    let msg: WsMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendError(ws, 'Invalid JSON');
      return;
    }

    agent.lastSeen = Date.now();

    switch (msg.type) {
      case 'join': {
        const roomValidation = validateRoomName(msg.room);
        if (!roomValidation.valid) {
          sendError(ws, roomValidation.error!);
          return;
        }
        const roomName = msg.room!.trim();

        if (!rooms.has(roomName)) {
          rooms.set(roomName, new Set());
        }
        rooms.get(roomName)!.add(agentId);
        agent.rooms.add(roomName);

        // Notify room about new member
        broadcastToRoom(roomName, {
          type: 'agent_joined',
          agentId,
          room: roomName,
          timestamp: Date.now(),
        }, agentId);

        // Confirm join to the agent
        ws.send(JSON.stringify({
          type: 'joined',
          room: roomName,
          members: Array.from(rooms.get(roomName) ?? []),
          timestamp: Date.now(),
        }));
        console.log(`[${new Date().toISOString()}] Agent ${agentId} joined room: ${roomName}`);
        break;
      }

      case 'leave': {
        const roomName = msg.room?.trim();
        if (!roomName || !agent.rooms.has(roomName)) {
          sendError(ws, 'Not in room');
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
            timestamp: Date.now(),
          });
          if (roomAgents.size === 0) {
            rooms.delete(roomName);
          }
        }
        ws.send(JSON.stringify({
          type: 'left',
          room: roomName,
          timestamp: Date.now(),
        }));
        console.log(`[${new Date().toISOString()}] Agent ${agentId} left room: ${roomName}`);
        break;
      }

      case 'message': {
        const contentValidation = validateMessageContent(msg.content);
        if (!contentValidation.valid) {
          sendError(ws, contentValidation.error!);
          return;
        }

        const payload: BroadcastMessage = {
          type: 'message',
          from: agentId,
          content: msg.content,
          timestamp: Date.now(),
        };

        if (msg.to) {
          // Direct message to specific agent
          const toValidation = validateAgentId(msg.to);
          if (!toValidation.valid) {
            sendError(ws, 'Invalid target agent ID');
            return;
          }
          payload.to = msg.to;
          const sent = sendToAgent(msg.to, payload);
          if (!sent) {
            sendError(ws, `Agent ${msg.to} not found or not connected`);
          }
        } else if (msg.room && agent.rooms.has(msg.room)) {
          // Room message
          payload.room = msg.room;
          broadcastToRoom(msg.room, payload, agentId);
        } else {
          sendError(ws, 'Specify "to" (agentId) or "room" for message');
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      }

      default:
        sendError(ws, `Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    removeAgent(agentId);
  });

  ws.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket error for ${agentId}:`, err.message);
    removeAgent(agentId);
  });
});

// =============================================================================
// Heartbeat interval
// =============================================================================

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, config.heartbeatIntervalMs);

// =============================================================================
// REST API
// =============================================================================

app.get('/api/agents', (_req: Request, res: Response) => {
  const agentList = [];
  for (const [agentId, data] of agents) {
    agentList.push({
      agentId,
      metadata: data.metadata,
      rooms: Array.from(data.rooms),
      lastSeen: data.lastSeen,
    });
  }
  res.json({ agents: agentList });
});

app.get('/api/rooms', (_req: Request, res: Response) => {
  const roomList = [];
  for (const [roomName, members] of rooms) {
    roomList.push({
      name: roomName,
      members: Array.from(members),
    });
  }
  res.json({ rooms: roomList });
});

app.post('/api/messages', (req: Request, res: Response) => {
  const { from, to, room, content } = req.body;

  const contentValidation = validateMessageContent(content);
  if (!contentValidation.valid) {
    res.status(400).json({ error: contentValidation.error });
    return;
  }

  const payload: BroadcastMessage = {
    type: 'message',
    from: from || 'api',
    content,
    timestamp: Date.now(),
  };

  if (to) {
    const toValidation = validateAgentId(to);
    if (!toValidation.valid) {
      res.status(400).json({ error: toValidation.error });
      return;
    }
    payload.to = to;
    const sent = sendToAgent(to, payload);
    if (!sent) {
      res.status(404).json({ error: `Agent ${to} not found or not connected` });
      return;
    }
    res.json({ success: true, delivered: 1 });
    return;
  }

  if (room) {
    const roomValidation = validateRoomName(room);
    if (!roomValidation.valid) {
      res.status(400).json({ error: roomValidation.error });
      return;
    }
    if (!rooms.has(room)) {
      res.status(404).json({ error: `Room ${room} not found` });
      return;
    }
    payload.room = room;
    broadcastToRoom(room, payload);
    res.json({ success: true, delivered: rooms.get(room)?.size ?? 0 });
    return;
  }

  res.status(400).json({ error: 'Specify "to" (agentId) or "room"' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    agents: agents.size,
    rooms: rooms.size,
    uptime: process.uptime(),
    env: config.nodeEnv,
  });
});

// =============================================================================
// Graceful shutdown
// =============================================================================

function gracefulShutdown(signal: string) {
  console.log(`\n[${new Date().toISOString()}] Received ${signal}. Shutting down gracefully...`);

  clearInterval(heartbeatInterval);

  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed.`);
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// Start server
// =============================================================================

server.listen(config.port, () => {
  console.log(`[${new Date().toISOString()}] SNS-AI server running on http://localhost:${config.port}`);
  console.log(`[${new Date().toISOString()}] WebSocket endpoint: ws://localhost:${config.port}?agentId=YOUR_AGENT_ID`);
  console.log(`[${new Date().toISOString()}] Environment: ${config.nodeEnv}`);
});

export { app, server, wss, agents, rooms, config };
