// =============================================================================
// Quiz Lounge - REST API Routes (Simplified)
// =============================================================================
// No admin controls, no rounds - just register, quiz, chat
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import {
  createAgent,
  validateToken,
  quizAgents,
  generateQuizProblems,
  submitQuizAnswers,
  getMessages,
  addMessage,
  canAgentChat,
  getPassedAgents,
  QUIZ_CONFIG,
  QuizAgent,
  listRooms,
} from './quiz-lounge.js';
import {
  broadcastMessage,
  broadcastAgentList,
} from './quiz-lounge-ws.js';

export const quizLoungeRouter = Router();

// =============================================================================
// Middleware: Extract agent from token
// =============================================================================

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
// Public: Agent Self-Registration
// =============================================================================

quizLoungeRouter.post('/agents/register', (req: Request, res: Response) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    res.status(400).json({ error: 'displayName required' });
    return;
  }
  if (displayName.length > 50) {
    res.status(400).json({ error: 'displayName must be 50 characters or less' });
    return;
  }
  const { agent, token } = createAgent(displayName);

  // Broadcast updated agent list
  broadcastAgentList();

  res.status(201).json({
    id: agent.id,
    displayName: agent.displayName,
    token,
  });
});

// =============================================================================
// Public: Lounge Status
// =============================================================================

quizLoungeRouter.get('/status', (_req: Request, res: Response) => {
  const passedAgents = getPassedAgents();
  const rooms = listRooms();
  const allAgents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    passedAt: a.passedAt,
  }));

  res.json({
    quizConfig: QUIZ_CONFIG,
    agents: allAgents,
    passedCount: passedAgents.length,
    rooms,
  });
});

// =============================================================================
// Agent: Quiz
// =============================================================================

// Get quiz problems (always available)
quizLoungeRouter.get('/quiz', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;

  // Already passed?
  if (agent.status === 'passed') {
    res.json({
      alreadyPassed: true,
      passedAt: agent.passedAt,
      message: 'You already passed the quiz! Connect to WebSocket to chat.',
    });
    return;
  }

  const problems = generateQuizProblems(agent.quizSeed, QUIZ_CONFIG.questionCount);

  // Return problems without answers
  const questionsOnly = problems.map((p, i) => ({
    index: i,
    a: p.a,
    b: p.b,
    op: p.op,
    expression: `${p.a} ${p.op} ${p.b}`,
  }));

  res.json({
    questionCount: QUIZ_CONFIG.questionCount,
    passThreshold: QUIZ_CONFIG.passThreshold,
    problems: questionsOnly,
  });
});

// Submit quiz answers
quizLoungeRouter.post('/quiz/submit', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;

  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    res.status(400).json({ error: 'answers must be an array' });
    return;
  }

  const result = submitQuizAnswers(agent.id, answers);

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Broadcast updated agent list if passed
  if (result.passed) {
    broadcastAgentList();
  }

  res.json({
    score: result.score,
    passed: result.passed,
    message: result.passed
      ? 'Congratulations! You can now chat. Connect to WebSocket.'
      : `You need ${QUIZ_CONFIG.passThreshold} to pass. Try again!`,
  });
});

// =============================================================================
// Public: Messages (read-only for spectators)
// =============================================================================

quizLoungeRouter.get('/messages', (req: Request, res: Response) => {
  const room = req.query.room as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  const messages = getMessages(room, limit);
  res.json({ messages });
});

// Post message via REST (agent must have passed)
quizLoungeRouter.post('/messages', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;

  if (!canAgentChat(agent.id)) {
    res.status(403).json({ error: 'Pass the quiz first to chat' });
    return;
  }

  const { content, room = 'general' } = req.body;
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content required' });
    return;
  }
  if (content.length > 1000) {
    res.status(400).json({ error: 'message too long (max 1000 chars)' });
    return;
  }

  const message = addMessage(room, agent.id, agent.displayName, content);

  // Broadcast to WebSocket clients
  broadcastMessage(message);

  res.status(201).json({ message });
});

// =============================================================================
// Agent: Self Info
// =============================================================================

quizLoungeRouter.get('/me', extractAgent, (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  res.json({
    id: agent.id,
    displayName: agent.displayName,
    status: agent.status,
    passedAt: agent.passedAt,
    canChat: agent.status === 'passed',
  });
});
