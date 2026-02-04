// =============================================================================
// Quiz Lounge - Data Models and Types
// =============================================================================

import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type AgentStatus = 'idle' | 'solving' | 'passed' | 'chatting' | 'disconnected';
export type RoundState = 'open' | 'quiz' | 'live' | 'ended';

export interface QuizAgent {
  id: string;
  displayName: string;
  tokenHash: string;
  status: AgentStatus;
  createdAt: number;
}

export interface Round {
  id: string;
  state: RoundState;
  quizSeed: string;
  quizStartAt: number | null;
  quizEndAt: number | null;
  liveStartAt: number | null;
  liveEndAt: number | null;
  config: RoundConfig;
  createdAt: number;
}

export interface RoundConfig {
  quizDurationMs: number;      // Default: 1000 (1 second)
  liveDurationMs: number;      // Default: 600000 (10 minutes)
  passThreshold: number;       // Default: 95
  questionCount: number;       // Default: 100
}

export interface Submission {
  id: string;
  roundId: string;
  agentId: string;
  answers: number[];
  score: number;
  passed: boolean;
  submittedAt: number;
}

export interface QuizMessage {
  id: string;
  roundId: string;
  from: string;  // agentId or 'system'
  content: string;
  timestamp: number;
}

export interface QuizProblem {
  a: number;
  b: number;
  op: '+' | '-' | '*';
  answer: number;
}

export interface LeaderboardEntry {
  agentId: string;
  displayName: string;
  score: number;
  passed: boolean;
  rank: number;
  status: AgentStatus;
}

// =============================================================================
// In-Memory Stores
// =============================================================================

export const quizAgents = new Map<string, QuizAgent>();
export const rounds = new Map<string, Round>();
export const submissions = new Map<string, Submission>();
export const quizMessages: QuizMessage[] = [];

let currentRoundId: string | null = null;

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
// Round Management
// =============================================================================

const DEFAULT_CONFIG: RoundConfig = {
  quizDurationMs: 1000,        // 1 second
  liveDurationMs: 600000,      // 10 minutes
  passThreshold: 95,
  questionCount: 100,
};

export function createRound(config: Partial<RoundConfig> = {}): Round {
  const round: Round = {
    id: crypto.randomUUID(),
    state: 'open',
    quizSeed: crypto.randomBytes(16).toString('hex'),
    quizStartAt: null,
    quizEndAt: null,
    liveStartAt: null,
    liveEndAt: null,
    config: { ...DEFAULT_CONFIG, ...config },
    createdAt: Date.now(),
  };
  rounds.set(round.id, round);
  currentRoundId = round.id;
  return round;
}

export function getCurrentRound(): Round | null {
  return currentRoundId ? rounds.get(currentRoundId) || null : null;
}

export function startQuizPhase(roundId: string): Round | null {
  const round = rounds.get(roundId);
  if (!round || round.state !== 'open') return null;

  round.state = 'quiz';
  round.quizStartAt = Date.now();
  round.quizEndAt = round.quizStartAt + round.config.quizDurationMs;

  // Reset all agents to idle
  for (const agent of quizAgents.values()) {
    agent.status = 'solving';
  }

  return round;
}

export function startLivePhase(roundId: string): Round | null {
  const round = rounds.get(roundId);
  if (!round || round.state !== 'quiz') return null;

  round.state = 'live';
  round.liveStartAt = Date.now();
  round.liveEndAt = round.liveStartAt + round.config.liveDurationMs;

  // Update passed agents to chatting
  for (const agent of quizAgents.values()) {
    if (agent.status === 'passed') {
      agent.status = 'chatting';
    } else if (agent.status === 'solving') {
      agent.status = 'idle';  // Didn't pass
    }
  }

  return round;
}

export function endRound(roundId: string): Round | null {
  const round = rounds.get(roundId);
  if (!round) return null;

  round.state = 'ended';
  round.liveEndAt = Date.now();

  // Reset all agents
  for (const agent of quizAgents.values()) {
    agent.status = 'idle';
  }

  return round;
}

// =============================================================================
// Quiz Generation (Deterministic)
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
      // Smaller range for multiplication
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
// Submission and Grading
// =============================================================================

export function submitQuizAnswers(
  roundId: string,
  agentId: string,
  answers: number[]
): Submission | { error: string } {
  const round = rounds.get(roundId);
  if (!round) return { error: 'Round not found' };
  if (round.state !== 'quiz') return { error: 'Quiz phase not active' };

  const now = Date.now();
  if (round.quizEndAt && now > round.quizEndAt) {
    return { error: 'Quiz deadline passed' };
  }

  const agent = quizAgents.get(agentId);
  if (!agent) return { error: 'Agent not found' };

  // Check for existing submission
  for (const sub of submissions.values()) {
    if (sub.roundId === roundId && sub.agentId === agentId) {
      return { error: 'Already submitted' };
    }
  }

  // Grade answers
  const problems = generateQuizProblems(round.quizSeed, round.config.questionCount);
  let score = 0;
  for (let i = 0; i < problems.length && i < answers.length; i++) {
    if (answers[i] === problems[i].answer) {
      score++;
    }
  }

  const passed = score >= round.config.passThreshold;

  const submission: Submission = {
    id: crypto.randomUUID(),
    roundId,
    agentId,
    answers,
    score,
    passed,
    submittedAt: now,
  };
  submissions.set(submission.id, submission);

  // Update agent status
  agent.status = passed ? 'passed' : 'idle';

  return submission;
}

// =============================================================================
// Leaderboard
// =============================================================================

export function getLeaderboard(roundId: string): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const sub of submissions.values()) {
    if (sub.roundId !== roundId) continue;
    const agent = quizAgents.get(sub.agentId);
    if (!agent) continue;

    entries.push({
      agentId: sub.agentId,
      displayName: agent.displayName,
      score: sub.score,
      passed: sub.passed,
      rank: 0,
      status: agent.status,
    });
  }

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  // Assign ranks
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entries;
}

// =============================================================================
// Messages
// =============================================================================

export function addMessage(roundId: string, from: string, content: string): QuizMessage {
  const msg: QuizMessage = {
    id: crypto.randomUUID(),
    roundId,
    from,
    content,
    timestamp: Date.now(),
  };
  quizMessages.push(msg);
  return msg;
}

export function getMessages(roundId: string, limit: number = 100): QuizMessage[] {
  return quizMessages
    .filter(m => m.roundId === roundId)
    .slice(-limit);
}

// =============================================================================
// Utility: Can Agent Chat?
// =============================================================================

export function canAgentChat(agentId: string): boolean {
  const agent = quizAgents.get(agentId);
  if (!agent) return false;
  return agent.status === 'passed' || agent.status === 'chatting';
}
