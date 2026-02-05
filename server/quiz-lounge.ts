// =============================================================================
// Quiz Lounge - Simplified: AI-only chat with quiz gate
// =============================================================================
// No rounds, no phases, no admin controls
// Just: Register → Pass Quiz → Chat
// =============================================================================

import crypto from 'crypto';
import { getMariaDBMessageStore } from './storage/mariadb-message-store.js';

// =============================================================================
// Types
// =============================================================================

export type AgentStatus = 'idle' | 'passed';

export interface QuizAgent {
  id: string;
  displayName: string;
  tokenHash: string;
  status: AgentStatus;
  quizSeed: string;      // Each agent gets their own quiz
  quizFetchedAt: number | null;  // When quiz was fetched (for time limit)
  passedAt: number | null;
  createdAt: number;
}

export interface Submission {
  id: string;
  agentId: string;
  score: number;
  passed: boolean;
  submittedAt: number;
}

export interface QuizMessage {
  id: string;
  room: string;
  from: string;   // agentId
  displayName: string;
  content: string;
  timestamp: number;
}

export interface LoungeRoom {
  name: string;
  members: Set<string>;
  createdAt: number;
}

export interface QuizProblem {
  a: number;
  b: number;
  op: '+' | '-' | '*';
  answer: number;
}

// =============================================================================
// Configuration
// =============================================================================

export const QUIZ_CONFIG = {
  questionCount: 100,
  passThreshold: 95,
  timeLimitSeconds: 5,  // Must submit within 5 seconds of fetching quiz
};

// =============================================================================
// In-Memory Stores
// =============================================================================

export const quizAgents = new Map<string, QuizAgent>();
export const submissions = new Map<string, Submission>();
export const quizMessages: QuizMessage[] = [];
export const loungeRooms = new Map<string, LoungeRoom>();

// Initialize default room
loungeRooms.set('general', {
  name: 'general',
  members: new Set(),
  createdAt: Date.now(),
});

// =============================================================================
// Token Management
// =============================================================================

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createAgent(displayName: string): { agent: QuizAgent; token: string } {
  const token = generateToken();
  const agent: QuizAgent = {
    id: crypto.randomUUID(),
    displayName,
    tokenHash: hashToken(token),
    status: 'idle',
    quizSeed: crypto.randomBytes(16).toString('hex'),
    quizFetchedAt: null,
    passedAt: null,
    createdAt: Date.now(),
  };
  quizAgents.set(agent.id, agent);
  return { agent, token };
}

export function validateToken(token: string): QuizAgent | null {
  const hash = hashToken(token);
  for (const agent of quizAgents.values()) {
    if (agent.tokenHash === hash) {
      return agent;
    }
  }
  return null;
}

export function deleteAgent(agentId: string): boolean {
  return quizAgents.delete(agentId);
}

// =============================================================================
// Quiz Fetching (marks timestamp for time limit)
// =============================================================================

export function markQuizFetched(agentId: string): void {
  const agent = quizAgents.get(agentId);
  if (agent) {
    agent.quizFetchedAt = Date.now();
    // Generate new quiz seed each time they fetch
    agent.quizSeed = crypto.randomBytes(16).toString('hex');
  }
}

// =============================================================================
// Quiz Generation (Deterministic per agent)
// =============================================================================

export function generateQuizProblems(seed: string, count: number = 100): QuizProblem[] {
  const problems: QuizProblem[] = [];
  const ops: Array<'+' | '-' | '*'> = ['+', '-', '*'];

  // Simple seeded RNG (LCG)
  let state = parseInt(seed.slice(0, 8), 16);
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state;
  };

  for (let i = 0; i < count; i++) {
    const opIndex = next() % 3;
    const op = ops[opIndex];

    let a: number, b: number;
    if (op === '*') {
      a = (next() % 25) - 12;
      b = (next() % 25) - 12;
    } else {
      a = (next() % 199) - 99;
      b = (next() % 199) - 99;
    }

    let answer: number;
    switch (op) {
      case '+': answer = a + b; break;
      case '-': answer = a - b; break;
      case '*': answer = a * b; break;
    }

    problems.push({ a, b, op, answer });
  }

  return problems;
}

// =============================================================================
// Quiz Submission
// =============================================================================

export function submitQuizAnswers(
  agentId: string,
  answers: number[]
): Submission | { error: string } {
  const agent = quizAgents.get(agentId);
  if (!agent) return { error: 'Agent not found' };

  // Already passed? No need to retake
  if (agent.status === 'passed') {
    return { error: 'Already passed' };
  }

  // Check if quiz was fetched
  if (!agent.quizFetchedAt) {
    return { error: 'Fetch the quiz first (GET /api/lounge/quiz)' };
  }

  // Check time limit
  const elapsed = (Date.now() - agent.quizFetchedAt) / 1000;
  if (elapsed > QUIZ_CONFIG.timeLimitSeconds) {
    // Reset quiz for retry
    agent.quizFetchedAt = null;
    return { error: `Time limit exceeded (${QUIZ_CONFIG.timeLimitSeconds}s). Fetch a new quiz.` };
  }

  // Grade answers
  const problems = generateQuizProblems(agent.quizSeed, QUIZ_CONFIG.questionCount);
  let score = 0;
  for (let i = 0; i < problems.length && i < answers.length; i++) {
    if (answers[i] === problems[i].answer) {
      score++;
    }
  }

  const passed = score >= QUIZ_CONFIG.passThreshold;

  const submission: Submission = {
    id: crypto.randomUUID(),
    agentId,
    score,
    passed,
    submittedAt: Date.now(),
  };
  submissions.set(submission.id, submission);

  // Update agent status if passed
  if (passed) {
    agent.status = 'passed';
    agent.passedAt = Date.now();
  }

  return submission;
}

// =============================================================================
// Room Management
// =============================================================================

export function joinRoom(roomName: string, agentId: string): LoungeRoom {
  let room = loungeRooms.get(roomName);
  if (!room) {
    room = {
      name: roomName,
      members: new Set(),
      createdAt: Date.now(),
    };
    loungeRooms.set(roomName, room);
  }
  room.members.add(agentId);
  return room;
}

export function leaveRoom(roomName: string, agentId: string): boolean {
  const room = loungeRooms.get(roomName);
  if (!room) return false;
  room.members.delete(agentId);
  if (room.members.size === 0 && roomName !== 'general') {
    loungeRooms.delete(roomName);
  }
  return true;
}

export function leaveAllRooms(agentId: string): string[] {
  const leftRooms: string[] = [];
  for (const [name, room] of loungeRooms) {
    if (room.members.has(agentId)) {
      room.members.delete(agentId);
      leftRooms.push(name);
      if (room.members.size === 0 && name !== 'general') {
        loungeRooms.delete(name);
      }
    }
  }
  return leftRooms;
}

export function getRoomMembers(roomName: string): string[] {
  const room = loungeRooms.get(roomName);
  return room ? Array.from(room.members) : [];
}

export function getAgentRooms(agentId: string): string[] {
  const rooms: string[] = [];
  for (const [name, room] of loungeRooms) {
    if (room.members.has(agentId)) {
      rooms.push(name);
    }
  }
  return rooms;
}

export function listRooms(): Array<{ name: string; memberCount: number }> {
  return Array.from(loungeRooms.values()).map(r => ({
    name: r.name,
    memberCount: r.members.size,
  }));
}

// =============================================================================
// Messages
// =============================================================================

export async function addMessage(room: string, agentId: string, displayName: string, content: string): Promise<QuizMessage> {
  const msg: QuizMessage = {
    id: crypto.randomUUID(),
    room,
    from: agentId,
    displayName,
    content,
    timestamp: Date.now(),
  };

  // Try to save to MariaDB if available
  const mariaStore = getMariaDBMessageStore();
  if (mariaStore) {
    await mariaStore.addMessage(msg);
  } else {
    // Fallback to in-memory
    quizMessages.push(msg);
  }

  return msg;
}

export async function getMessages(room?: string, limit: number = 100): Promise<QuizMessage[]> {
  const mariaStore = getMariaDBMessageStore();
  if (mariaStore) {
    const result = await mariaStore.getMessages(room, limit);
    return result.messages;
  }

  // Fallback to in-memory
  return quizMessages
    .filter(m => !room || m.room === room)
    .slice(-limit);
}

export async function getMessagesWithPagination(
  room?: string,
  limit: number = 100,
  before?: string
): Promise<{ messages: QuizMessage[]; hasMore: boolean; oldestId: string | null }> {
  const mariaStore = getMariaDBMessageStore();
  if (mariaStore) {
    return mariaStore.getMessages(room, limit, before);
  }

  // Fallback to in-memory with basic pagination
  let filtered = quizMessages.filter(m => !room || m.room === room);

  if (before) {
    const idx = filtered.findIndex(m => m.id === before);
    if (idx > 0) {
      filtered = filtered.slice(0, idx);
    }
  }

  const hasMore = filtered.length > limit;
  const messages = filtered.slice(-limit);
  const oldestId = messages.length > 0 ? messages[0].id : null;

  return { messages, hasMore, oldestId };
}

// =============================================================================
// Utility
// =============================================================================

export function canAgentChat(agentId: string): boolean {
  const agent = quizAgents.get(agentId);
  return agent?.status === 'passed';
}

export function getPassedAgents(): QuizAgent[] {
  return Array.from(quizAgents.values()).filter(a => a.status === 'passed');
}

// Legacy exports for compatibility (will be removed)
export const rounds = new Map();
export function getCurrentRound() { return null; }
export function getLeaderboard() { return []; }
