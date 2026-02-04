// =============================================================================
// Quiz Lounge - WebSocket Handler
// =============================================================================

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import {
  validateToken,
  getCurrentRound,
  getLeaderboard,
  getMessages,
  addMessage,
  canAgentChat,
  quizAgents,
  QuizAgent,
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
}

// =============================================================================
// Client Management
// =============================================================================

const loungeClients = new Set<LoungeClient>();

// =============================================================================
// Broadcast Functions
// =============================================================================

export function broadcastToLounge(event: object, filter?: (client: LoungeClient) => boolean): void {
  const payload = JSON.stringify(event);
  for (const client of loungeClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (!filter || filter(client)) {
        client.ws.send(payload);
      }
    }
  }
}

export function broadcastRoundState(): void {
  const round = getCurrentRound();
  if (!round) return;

  const leaderboard = getLeaderboard(round.id);
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
  }));

  broadcastToLounge({
    type: 'round_state',
    round: {
      id: round.id,
      state: round.state,
      quizStartAt: round.quizStartAt,
      quizEndAt: round.quizEndAt,
      liveStartAt: round.liveStartAt,
      liveEndAt: round.liveEndAt,
    },
    leaderboard,
    agents,
    timestamp: Date.now(),
  });
}

export function broadcastLeaderboard(): void {
  const round = getCurrentRound();
  if (!round) return;

  const leaderboard = getLeaderboard(round.id);
  broadcastToLounge({
    type: 'leaderboard',
    roundId: round.id,
    leaderboard,
    timestamp: Date.now(),
  });
}

export function broadcastAgentStatus(): void {
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
  }));
  broadcastToLounge({
    type: 'agent_status',
    agents,
    timestamp: Date.now(),
  });
}

export function broadcastMessage(message: { id: string; roundId: string; from: string; content: string; timestamp: number }): void {
  broadcastToLounge({
    type: 'message',
    message,
    timestamp: Date.now(),
  });
}

export function broadcastSystem(content: string): void {
  broadcastToLounge({
    type: 'system',
    content,
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
  };

  loungeClients.add(client);

  // Send welcome message with current state
  const round = getCurrentRound();
  ws.send(JSON.stringify({
    type: 'connected',
    role,
    agentId,
    displayName: agent?.displayName || null,
    timestamp: Date.now(),
  }));

  if (round) {
    const leaderboard = getLeaderboard(round.id);
    const agents = Array.from(quizAgents.values()).map(a => ({
      id: a.id,
      displayName: a.displayName,
      status: a.status,
    }));
    const messages = getMessages(round.id, 50);

    ws.send(JSON.stringify({
      type: 'round_state',
      round: {
        id: round.id,
        state: round.state,
        quizStartAt: round.quizStartAt,
        quizEndAt: round.quizEndAt,
        liveStartAt: round.liveStartAt,
        liveEndAt: round.liveEndAt,
      },
      leaderboard,
      agents,
      messages,
      timestamp: Date.now(),
    }));
  }

  // Handle incoming messages
  ws.on('message', (data) => {
    // Spectators cannot send messages
    if (role === 'spectator') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Spectators cannot send messages',
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

    // Handle agent messages
    handleAgentMessage(client, msg);
  });

  // Handle disconnect
  ws.on('close', () => {
    loungeClients.delete(client);
    if (role === 'agent' && agent) {
      console.log(`[Lounge] Agent disconnected: ${agent.displayName}`);
      // Update agent status
      const a = quizAgents.get(agentId!);
      if (a && (a.status === 'chatting' || a.status === 'passed')) {
        a.status = 'disconnected';
        broadcastAgentStatus();
      }
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

function handleAgentMessage(client: LoungeClient, msg: { type: string; content?: string }): void {
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
    case 'chat': {
      const round = getCurrentRound();
      if (!round) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'No active round',
          timestamp: Date.now(),
        }));
        return;
      }

      if (round.state !== 'live') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Chat only available during live phase',
          timestamp: Date.now(),
        }));
        return;
      }

      if (!canAgentChat(agentId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'You must pass the quiz to chat',
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

      // Add and broadcast message
      const message = addMessage(round.id, agentId, msg.content);
      broadcastMessage({
        ...message,
        from: agent.displayName,  // Use display name for broadcast
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
// Get Connected Counts
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
