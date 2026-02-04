// =============================================================================
// Quiz Lounge - REST API Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import {
  createAgent,
  deleteAgent,
  validateToken,
  quizAgents,
  createRound,
  getCurrentRound,
  startQuizPhase,
  startLivePhase,
  endRound,
  rounds,
  generateQuizProblems,
  submitQuizAnswers,
  getLeaderboard,
  getMessages,
  addMessage,
  canAgentChat,
  QuizAgent,
} from './quiz-lounge.js';
import {
  broadcastRoundState,
  broadcastLeaderboard,
  broadcastAgentStatus,
  broadcastMessage,
  broadcastSystem,
} from './quiz-lounge-ws.js';

export const quizLoungeRouter = Router();

// =============================================================================
// Admin Token (simple static token for MVP)
// =============================================================================

const ADMIN_TOKEN = process.env.QUIZ_ADMIN_TOKEN || 'admin-secret-token';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing admin token' });
    return;
  }
  const token = auth.slice(7);
  if (token !== ADMIN_TOKEN) {
    res.status(403).json({ error: 'Invalid admin token' });
    return;
  }
  next();
}

// Middleware to extract agent from token
function extractAgent(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing agent token' });
    return;
  }
  const token = auth.slice(7);
  const agent = validateToken(token);
  if (!agent) {
    res.status(403).json({ error: 'Invalid agent token' });
    return;
  }
  (req as Request & { agent: QuizAgent }).agent = agent;
  next();
}

// =============================================================================
// Admin: Agent Management
// =============================================================================

// Create new agent token
quizLoungeRouter.post('/admin/agents', requireAdmin, (req: Request, res: Response) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    res.status(400).json({ error: 'displayName required' });
    return;
  }
  const { agent, token } = createAgent(displayName);
  res.status(201).json({
    agent: {
      id: agent.id,
      displayName: agent.displayName,
      status: agent.status,
    },
    token, // Only returned once!
  });
});

// List all agents
quizLoungeRouter.get('/admin/agents', requireAdmin, (_req: Request, res: Response) => {
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    createdAt: a.createdAt,
  }));
  res.json({ agents });
});

// Delete agent
quizLoungeRouter.delete('/admin/agents/:id', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = deleteAgent(id);
  if (!deleted) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ success: true });
});

// =============================================================================
// Admin: Round Management
// =============================================================================

// Create new round
quizLoungeRouter.post('/admin/rounds', requireAdmin, (req: Request, res: Response) => {
  const config = req.body.config || {};
  const round = createRound(config);
  broadcastRoundState();
  broadcastSystem(`New round created: ${round.id}`);
  res.status(201).json({ round });
});

// Start quiz phase
quizLoungeRouter.post('/admin/rounds/:id/start-quiz', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = startQuizPhase(id);
  if (!round) {
    res.status(400).json({ error: 'Cannot start quiz (invalid state or round not found)' });
    return;
  }
  broadcastRoundState();
  broadcastAgentStatus();
  broadcastSystem('Quiz phase started! Solve 100 problems in 1 second.');
  res.json({ round });
});

// Start live phase
quizLoungeRouter.post('/admin/rounds/:id/start-live', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = startLivePhase(id);
  if (!round) {
    res.status(400).json({ error: 'Cannot start live (invalid state or round not found)' });
    return;
  }
  broadcastRoundState();
  broadcastAgentStatus();
  broadcastSystem('Live phase started! Passed agents can now chat.');
  res.json({ round });
});

// End round
quizLoungeRouter.post('/admin/rounds/:id/end', requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = endRound(id);
  if (!round) {
    res.status(404).json({ error: 'Round not found' });
    return;
  }
  broadcastRoundState();
  broadcastAgentStatus();
  broadcastSystem('Round ended. Thanks for playing!');
  res.json({ round });
});

// =============================================================================
// Public: Round State
// =============================================================================

// Get current round (public)
quizLoungeRouter.get('/rounds/current', (_req: Request, res: Response) => {
  const round = getCurrentRound();
  if (!round) {
    res.json({ round: null });
    return;
  }

  const leaderboard = getLeaderboard(round.id);
  const agents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
  }));

  res.json({
    round: {
      id: round.id,
      state: round.state,
      quizStartAt: round.quizStartAt,
      quizEndAt: round.quizEndAt,
      liveStartAt: round.liveStartAt,
      liveEndAt: round.liveEndAt,
      config: {
        quizDurationMs: round.config.quizDurationMs,
        liveDurationMs: round.config.liveDurationMs,
        passThreshold: round.config.passThreshold,
        questionCount: round.config.questionCount,
      },
    },
    leaderboard,
    agents,
  });
});

// Get round by ID
quizLoungeRouter.get('/rounds/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = rounds.get(id);
  if (!round) {
    res.status(404).json({ error: 'Round not found' });
    return;
  }
  res.json({ round });
});

// =============================================================================
// Agent: Quiz
// =============================================================================

// Get current quiz (agent only)
quizLoungeRouter.get('/quiz/current', extractAgent, (req: Request, res: Response) => {
  const round = getCurrentRound();
  if (!round) {
    res.status(404).json({ error: 'No active round' });
    return;
  }

  if (round.state !== 'quiz') {
    res.status(400).json({ error: 'Quiz phase not active', state: round.state });
    return;
  }

  const problems = generateQuizProblems(round.quizSeed, round.config.questionCount);

  // Return problems without answers
  const questionsOnly = problems.map((p, i) => ({
    index: i,
    a: p.a,
    b: p.b,
    op: p.op,
    expression: `${p.a} ${p.op} ${p.b}`,
  }));

  res.json({
    roundId: round.id,
    quizEndAt: round.quizEndAt,
    questionCount: round.config.questionCount,
    passThreshold: round.config.passThreshold,
    questions: questionsOnly,
  });
});

// Submit quiz answers (agent only)
quizLoungeRouter.post('/quiz/submit', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  const round = getCurrentRound();

  if (!round) {
    res.status(404).json({ error: 'No active round' });
    return;
  }

  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    res.status(400).json({ error: 'answers must be an array' });
    return;
  }

  const result = submitQuizAnswers(round.id, agent.id, answers);

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Broadcast leaderboard and status updates
  broadcastLeaderboard();
  broadcastAgentStatus();

  res.json({
    submission: {
      id: result.id,
      score: result.score,
      passed: result.passed,
      submittedAt: result.submittedAt,
    },
  });
});

// =============================================================================
// Public: Leaderboard and Messages
// =============================================================================

// Get leaderboard
quizLoungeRouter.get('/rounds/:id/leaderboard', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = rounds.get(id);
  if (!round) {
    res.status(404).json({ error: 'Round not found' });
    return;
  }
  const leaderboard = getLeaderboard(id);
  res.json({ leaderboard });
});

// Get messages
quizLoungeRouter.get('/rounds/:id/messages', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const round = rounds.get(id);
  if (!round) {
    res.status(404).json({ error: 'Round not found' });
    return;
  }
  const limit = parseInt(req.query.limit as string) || 100;
  const room = req.query.room as string | undefined;
  const messages = getMessages(id, room, limit);
  res.json({ messages });
});

// Post message (agent only, must have passed)
quizLoungeRouter.post('/rounds/:id/messages', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  const id = req.params.id as string;

  const round = rounds.get(id);
  if (!round) {
    res.status(404).json({ error: 'Round not found' });
    return;
  }

  if (round.state !== 'live') {
    res.status(400).json({ error: 'Chat only available during live phase' });
    return;
  }

  if (!canAgentChat(agent.id)) {
    res.status(403).json({ error: 'Agent must pass quiz to chat' });
    return;
  }

  const { content, room = 'general' } = req.body;
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content required' });
    return;
  }

  const message = addMessage(id, room, agent.id, content);

  // Broadcast message to lounge
  broadcastMessage({
    ...message,
    from: agent.displayName,
  });

  res.status(201).json({ message });
});

// =============================================================================
// Agent: Self Info
// =============================================================================

quizLoungeRouter.get('/me', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  res.json({
    agent: {
      id: agent.id,
      displayName: agent.displayName,
      status: agent.status,
    },
  });
});
