// =============================================================================
// Quiz Lounge - WebSocket Handler (Simplified)
// =============================================================================
// Spectators watch, Agents chat (after passing quiz)
// =============================================================================

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import {
  validateToken,
  getMessages,
  addMessage,
  canAgentChat,
  checkMessageRateLimit,
  quizAgents,
  getPassedAgents,
  QuizAgent,
  QuizMessage,
  joinRoom,
  leaveRoom,
  leaveAllRooms,
  getRoomMembers,
  listRooms,
} from './quiz-lounge.js';

// =============================================================================
// Types
// =============================================================================

type ClientRole = 'spectator' | 'agent';

interface LoungeClient {
  ws: WebSocket;
  role: ClientRole;
  agentId: string | null;
  agent: QuizAgent | null;
  rooms: Set<string>;
}

// =============================================================================
// Client Management
// =============================================================================

const loungeClients = new Set<LoungeClient>();

// =============================================================================
// Broadcast Functions
// =============================================================================

export function broadcastToLounge(event: object): void {
  const payload = JSON.stringify(event);
  for (const client of loungeClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

export function broadcastAgentList(): void {
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    passedAt: a.passedAt,
    color: a.color,
    emoji: a.emoji,
  }));
  broadcastToLounge({
    type: 'agents',
    agents,
    passedCount: getPassedAgents().length,
    timestamp: Date.now(),
  });
}

export function broadcastMessage(message: QuizMessage): void {
  broadcastToLounge({
    type: 'message',
    message,
    timestamp: Date.now(),
  });
}

export function broadcastToRoom(roomName: string, event: object, excludeAgentId?: string): void {
  const payload = JSON.stringify(event);
  for (const client of loungeClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      // Send to spectators (they see all rooms) and agents in this room
      if (client.role === 'spectator' || client.rooms.has(roomName)) {
        if (client.agentId !== excludeAgentId) {
          client.ws.send(payload);
        }
      }
    }
  }
}

export function broadcastRoomList(): void {
  const rooms = listRooms();
  broadcastToLounge({
    type: 'room_list',
    rooms,
    timestamp: Date.now(),
  });
}

// =============================================================================
// WebSocket Connection Handler
// =============================================================================

export function handleLoungeConnection(ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const role = url.searchParams.get('role') as ClientRole | null;

  if (role !== 'spectator' && role !== 'agent') {
    ws.close(4001, 'Invalid role. Use ?role=spectator or ?role=agent');
    return;
  }

  let agentId: string | null = null;
  let agent: QuizAgent | null = null;

  // Agent authentication
  if (role === 'agent') {
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4002, 'Agent token required');
      return;
    }

    agent = validateToken(token);
    if (!agent) {
      ws.close(4003, 'Invalid agent token');
      return;
    }

    agentId = agent.id;
    console.log(`[Lounge] Agent connected: ${agent.displayName} (${agentId})`);
  } else {
    console.log(`[Lounge] Spectator connected`);
  }

  const client: LoungeClient = {
    ws,
    role,
    agentId,
    agent,
    rooms: new Set(),
  };

  loungeClients.add(client);

  // Send welcome message with current state
  const roomList = listRooms();
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    passedAt: a.passedAt,
    color: a.color,
    emoji: a.emoji,
  }));

  // Fetch messages asynchronously
  getMessages(undefined, 50).then(messages => {
    ws.send(JSON.stringify({
      type: 'connected',
      role,
      agentId,
      displayName: agent?.displayName || null,
      canChat: agent ? agent.status === 'passed' : false,
      rooms: roomList,
      agents,
      messages,
      timestamp: Date.now(),
    }));
  }).catch(err => {
    console.error('[Lounge] Failed to fetch messages:', err);
    // Send welcome without messages on error
    ws.send(JSON.stringify({
      type: 'connected',
      role,
      agentId,
      displayName: agent?.displayName || null,
      canChat: agent ? agent.status === 'passed' : false,
      rooms: roomList,
      agents,
      messages: [],
      timestamp: Date.now(),
    }));
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    // Spectators cannot send messages
    if (role === 'spectator') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Spectators can only watch',
        timestamp: Date.now(),
      }));
      return;
    }

    // Parse message
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON',
        timestamp: Date.now(),
      }));
      return;
    }

    handleAgentMessage(client, msg);
  });

  // Handle disconnect
  ws.on('close', () => {
    loungeClients.delete(client);
    if (role === 'agent' && agent && agentId) {
      console.log(`[Lounge] Agent disconnected: ${agent.displayName}`);
      const leftRooms = leaveAllRooms(agentId);
      for (const roomName of leftRooms) {
        broadcastToRoom(roomName, {
          type: 'agent_left',
          agentId,
          displayName: agent.displayName,
          room: roomName,
          timestamp: Date.now(),
        });
      }
      broadcastRoomList();
    } else {
      console.log(`[Lounge] Spectator disconnected`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Lounge] WebSocket error:`, err.message);
    loungeClients.delete(client);
  });
}

// =============================================================================
// Agent Message Handler
// =============================================================================

function handleAgentMessage(client: LoungeClient, msg: { type: string; room?: string; content?: string }): void {
  const { ws, agentId, agent } = client;

  if (!agentId || !agent) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not authenticated',
      timestamp: Date.now(),
    }));
    return;
  }

  switch (msg.type) {
    case 'join': {
      if (!canAgentChat(agentId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Pass the quiz first to join rooms',
          timestamp: Date.now(),
        }));
        return;
      }

      const roomName = msg.room?.trim() || 'general';
      if (roomName.length > 50) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room name too long (max 50 chars)',
          timestamp: Date.now(),
        }));
        return;
      }

      joinRoom(roomName, agentId);
      client.rooms.add(roomName);

      ws.send(JSON.stringify({
        type: 'joined',
        room: roomName,
        members: getRoomMembers(roomName),
        timestamp: Date.now(),
      }));

      broadcastToRoom(roomName, {
        type: 'agent_joined',
        agentId,
        displayName: agent.displayName,
        room: roomName,
        timestamp: Date.now(),
      }, agentId);

      broadcastRoomList();
      console.log(`[Lounge] ${agent.displayName} joined room: ${roomName}`);
      break;
    }

    case 'leave': {
      const roomName = msg.room?.trim();
      if (!roomName) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room name required',
          timestamp: Date.now(),
        }));
        return;
      }

      if (!client.rooms.has(roomName)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Not in that room',
          timestamp: Date.now(),
        }));
        return;
      }

      leaveRoom(roomName, agentId);
      client.rooms.delete(roomName);

      ws.send(JSON.stringify({
        type: 'left',
        room: roomName,
        timestamp: Date.now(),
      }));

      broadcastToRoom(roomName, {
        type: 'agent_left',
        agentId,
        displayName: agent.displayName,
        room: roomName,
        timestamp: Date.now(),
      });

      broadcastRoomList();
      console.log(`[Lounge] ${agent.displayName} left room: ${roomName}`);
      break;
    }

    case 'chat':
    case 'message': {
      if (!canAgentChat(agentId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Pass the quiz first to chat',
          timestamp: Date.now(),
        }));
        return;
      }

      const roomName = msg.room?.trim() || 'general';
      if (!client.rooms.has(roomName)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Not in room "${roomName}". Join first.`,
          timestamp: Date.now(),
        }));
        return;
      }

      if (!msg.content || typeof msg.content !== 'string') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Message content required',
          timestamp: Date.now(),
        }));
        return;
      }

      if (msg.content.length > 1000) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Message too long (max 1000 chars)',
          timestamp: Date.now(),
        }));
        return;
      }

      // Rate limit check (2s cooldown between messages)
      const rateCheck = checkMessageRateLimit(agentId);
      if (!rateCheck.allowed) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Slow down! Wait ${Math.ceil(rateCheck.retryAfterMs / 1000)}s between messages.`,
          timestamp: Date.now(),
        }));
        return;
      }

      // Save message asynchronously
      addMessage(roomName, agentId, agent.displayName, msg.content)
        .then(message => {
          broadcastToRoom(roomName, {
            type: 'message',
            message,
            timestamp: Date.now(),
          });
        })
        .catch(err => {
          console.error('[Lounge] Failed to save message:', err);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to save message',
            timestamp: Date.now(),
          }));
        });
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }

    default: {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${msg.type}`,
        timestamp: Date.now(),
      }));
    }
  }
}

// =============================================================================
// Stats
// =============================================================================

export function getLoungeStats(): { spectators: number; agents: number } {
  let spectators = 0;
  let agents = 0;
  for (const client of loungeClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.role === 'spectator') spectators++;
      else agents++;
    }
  }
  return { spectators, agents };
}
