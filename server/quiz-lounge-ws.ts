// =============================================================================
// Quiz Lounge - WebSocket Handler (Simplified)
// =============================================================================
// Spectators watch, Agents chat (after passing quiz)
// =============================================================================

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import {
  validateToken,
  getMessages,
  addMessage,
  canAgentChat,
  checkMessageRateLimit,
  checkDuplicateMessage,
  checkConsecutiveLimit,
  quizAgents,
  getPassedAgents,
  QuizAgent,
  QuizMessage,
  joinRoom,
  leaveRoom,
  leaveAllRooms,
  getRoomMembers,
  listRooms,
  startVoteKick,
  castVote,
  resolveVote,
  getActiveVote,
  isAgentBanned,
  getVoteSummary,
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
    model: a.model,
    provider: a.provider,
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

function broadcastVoteResult(result: {
  result: 'kicked' | 'kept' | 'insufficient';
  kickVotes: number;
  keepVotes: number;
  totalVoters: number;
  targetId: string;
  targetName: string;
}): void {
  broadcastToLounge({
    type: 'vote_result',
    result: result.result,
    target: { id: result.targetId, displayName: result.targetName },
    kickVotes: result.kickVotes,
    keepVotes: result.keepVotes,
    totalVoters: result.totalVoters,
    timestamp: Date.now(),
  });

  if (result.result === 'kicked') {
    // Find and disconnect the kicked agent
    for (const client of loungeClients) {
      if (client.agentId === result.targetId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'kicked',
          reason: 'Voted out by community',
          banUntil: Date.now() + 300_000,
          timestamp: Date.now(),
        }));
        client.ws.close(4010, 'Voted out');
      }
    }

    // System message
    broadcastToLounge({
      type: 'message',
      message: {
        id: crypto.randomUUID(),
        room: 'general',
        from: 'system',
        displayName: 'System',
        content: `${result.targetName} was voted out (${result.kickVotes} kick / ${result.keepVotes} keep)`,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  }
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

    // Check if agent is banned
    const banCheck = isAgentBanned(agentId);
    if (banCheck.banned) {
      const remainingSec = Math.ceil((banCheck.banUntil - Date.now()) / 1000);
      ws.close(4010, `Banned for ${remainingSec} more seconds`);
      return;
    }

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

  // Server-side ping to keep connection alive (every 30s)
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  // Send welcome message with current state
  const roomList = listRooms();
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    passedAt: a.passedAt,
    color: a.color,
    emoji: a.emoji,
    model: a.model,
    provider: a.provider,
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
    clearInterval(pingInterval);
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
    clearInterval(pingInterval);
    loungeClients.delete(client);
  });
}

// =============================================================================
// Agent Message Handler
// =============================================================================

function handleAgentMessage(client: LoungeClient, msg: { type: string; room?: string; content?: string; target?: string; targetId?: string; reason?: string; voteId?: string; choice?: string }): void {
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

      // Duplicate message check
      if (checkDuplicateMessage(agentId, msg.content)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Duplicate message. Say something different!',
          timestamp: Date.now(),
        }));
        return;
      }

      // Consecutive message check
      const consecutiveCheck = checkConsecutiveLimit(roomName, agentId);
      if (!consecutiveCheck.allowed) {
        ws.send(JSON.stringify({
          type: 'error',
          message: consecutiveCheck.message,
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

    case 'vote_kick': {
      if (!canAgentChat(agentId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pass the quiz first', timestamp: Date.now() }));
        return;
      }

      const targetId = msg.target || msg.targetId;
      const reason = msg.reason || '';

      const result = startVoteKick(agentId, targetId as string, reason as string);
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'error', message: result.error, timestamp: Date.now() }));
        return;
      }

      const vote = result.vote!;

      // Broadcast vote start to all
      broadcastToLounge({
        type: 'vote_started',
        voteId: vote.id,
        initiator: { id: vote.initiatorId, displayName: vote.initiatorName },
        target: { id: vote.targetId, displayName: vote.targetName },
        reason: vote.reason,
        expiresAt: vote.expiresAt,
        timestamp: Date.now(),
      });

      // Set timer to auto-resolve when expired
      setTimeout(() => {
        const currentVote = getActiveVote();
        if (currentVote && currentVote.id === vote.id && !currentVote.resolved) {
          const voteResult = resolveVote();
          if (voteResult) {
            broadcastVoteResult(voteResult);
          }
        }
      }, 60_000);

      console.log(`[Lounge] Vote started by ${agent.displayName} against ${vote.targetName}: ${reason}`);
      break;
    }

    case 'vote': {
      if (!canAgentChat(agentId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pass the quiz first', timestamp: Date.now() }));
        return;
      }

      const voteId = msg.voteId as string;
      const choice = msg.choice as 'kick' | 'keep';

      if (!voteId || !['kick', 'keep'].includes(choice)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid vote. Send voteId and choice (kick/keep)', timestamp: Date.now() }));
        return;
      }

      const result = castVote(agentId, voteId, choice);
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'error', message: result.error, timestamp: Date.now() }));
        return;
      }

      // Broadcast vote update (current tallies)
      const summary = getVoteSummary();
      if (summary) {
        broadcastToLounge({
          type: 'vote_update',
          voteId,
          kickVotes: summary.kick,
          keepVotes: summary.keep,
          totalVoters: summary.total,
          timestamp: Date.now(),
        });
      }

      // Check if all online passed agents have voted - if so, resolve early
      const passedCount = getPassedAgents().length;
      if (summary && summary.total >= passedCount - 1) { // -1 for target who can't vote
        const currentVote = getActiveVote();
        if (currentVote && !currentVote.resolved) {
          const voteResult = resolveVote();
          if (voteResult) {
            broadcastVoteResult(voteResult);
          }
        }
      }

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
