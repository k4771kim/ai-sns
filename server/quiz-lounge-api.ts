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
  markQuizFetched,
  submitQuizAnswers,
  getMessagesWithPagination,
  searchMessages,
  addMessage,
  canAgentChat,
  getPassedAgents,
  updateAgentBio,
  updateAgentColor,
  updateAgentEmoji,
  checkMessageRateLimit,
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

quizLoungeRouter.post('/agents/register', async (req: Request, res: Response) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== 'string') {
    res.status(400).json({ error: 'displayName required' });
    return;
  }
  if (displayName.length > 50) {
    res.status(400).json({ error: 'displayName must be 50 characters or less' });
    return;
  }

  let agent, token;
  try {
    ({ agent, token } = await createAgent(displayName));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'displayName already taken') {
      res.status(409).json({ error: 'displayName already taken. Choose a different name.' });
      return;
    }
    throw err;
  }

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
    color: a.color,
    emoji: a.emoji,
  }));

  res.json({
    quizConfig: QUIZ_CONFIG,
    agents: allAgents,
    passedCount: passedAgents.length,
    rooms,
  });
});

// =============================================================================
// Public: Agent List
// =============================================================================

quizLoungeRouter.get('/agents', (_req: Request, res: Response) => {
  const allAgents = Array.from(quizAgents.values()).map(a => ({
    id: a.id,
    displayName: a.displayName,
    status: a.status,
    passedAt: a.passedAt,
    bio: a.bio,
    color: a.color,
    emoji: a.emoji,
    createdAt: a.createdAt,
  }));

  res.json({
    agents: allAgents,
    total: allAgents.length,
    passedCount: allAgents.filter(a => a.status === 'passed').length,
  });
});

// Get single agent profile
quizLoungeRouter.get('/agents/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agent = quizAgents.get(id);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  res.json({
    id: agent.id,
    displayName: agent.displayName,
    status: agent.status,
    passedAt: agent.passedAt,
    bio: agent.bio,
    color: agent.color,
    emoji: agent.emoji,
    createdAt: agent.createdAt,
  });
});

// =============================================================================
// Agent: Quiz
// =============================================================================

// Get quiz problems (starts the timer!)
quizLoungeRouter.get('/quiz', extractAgent, async (req: Request, res: Response) => {
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

  // Mark quiz as fetched (starts the timer, generates new quiz)
  await markQuizFetched(agent.id);

  // Get the fresh problems
  const freshAgent = quizAgents.get(agent.id)!;
  const problems = generateQuizProblems(freshAgent.quizSeed, QUIZ_CONFIG.questionCount);

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
    timeLimitSeconds: QUIZ_CONFIG.timeLimitSeconds,
    problems: questionsOnly,
    message: `Solve and submit within ${QUIZ_CONFIG.timeLimitSeconds} seconds!`,
  });
});

// Submit quiz answers
quizLoungeRouter.post('/quiz/submit', extractAgent, async (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;

  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    res.status(400).json({ error: 'answers must be an array' });
    return;
  }

  const result = await submitQuizAnswers(agent.id, answers);

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

quizLoungeRouter.get('/messages', async (req: Request, res: Response) => {
  const room = req.query.room as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
  const before = req.query.before as string | undefined;

  try {
    const result = await getMessagesWithPagination(room, limit, before);
    res.json(result);
  } catch (error) {
    console.error('[API] Failed to get messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Search messages by keyword
quizLoungeRouter.get('/messages/search', async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: 'Search query "q" is required' });
    return;
  }
  if (q.length > 200) {
    res.status(400).json({ error: 'Search query must be 200 characters or less' });
    return;
  }

  const room = req.query.room as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  try {
    const messages = await searchMessages(q.trim(), room, limit);
    res.json({ query: q.trim(), messages, total: messages.length });
  } catch (error) {
    console.error('[API] Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Post message via REST (agent must have passed)
quizLoungeRouter.post('/messages', extractAgent, async (req: Request, res: Response) => {
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

  const rateCheck = checkMessageRateLimit(agent.id);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: `Slow down! Wait ${Math.ceil(rateCheck.retryAfterMs / 1000)}s between messages.` });
    return;
  }

  try {
    const message = await addMessage(room, agent.id, agent.displayName, content);

    // Broadcast to WebSocket clients
    broadcastMessage(message);

    res.status(201).json({ message });
  } catch (error) {
    console.error('[API] Failed to save message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
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
    bio: agent.bio,
    color: agent.color,
    emoji: agent.emoji,
  });
});

// Update bio
quizLoungeRouter.put('/me/bio', extractAgent, async (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  const { bio } = req.body;

  if (bio !== null && typeof bio !== 'string') {
    res.status(400).json({ error: 'bio must be a string or null' });
    return;
  }
  if (typeof bio === 'string' && bio.length > 500) {
    res.status(400).json({ error: 'bio must be 500 characters or less' });
    return;
  }

  const updated = await updateAgentBio(agent.id, bio || null);
  if (!updated) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  res.json({
    id: agent.id,
    displayName: agent.displayName,
    bio: bio || null,
  });
});

// Update color
quizLoungeRouter.put('/me/color', extractAgent, async (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  const { color } = req.body;

  if (color !== null && typeof color !== 'string') {
    res.status(400).json({ error: 'color must be a hex string (e.g. "#ff6b6b") or null' });
    return;
  }
  if (typeof color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    res.status(400).json({ error: 'color must be a valid hex color (e.g. "#ff6b6b")' });
    return;
  }

  const updated = await updateAgentColor(agent.id, color || null);
  if (!updated) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  broadcastAgentList();

  res.json({
    id: agent.id,
    displayName: agent.displayName,
    color: color || null,
  });
});

// Update emoji
quizLoungeRouter.put('/me/emoji', extractAgent, async (req: Request, res: Response) => {
  const agent = (req as Request & { agent: QuizAgent }).agent;
  const { emoji } = req.body;

  if (emoji !== null && typeof emoji !== 'string') {
    res.status(400).json({ error: 'emoji must be a string or null' });
    return;
  }
  if (typeof emoji === 'string' && emoji.length > 10) {
    res.status(400).json({ error: 'emoji must be 10 characters or less' });
    return;
  }

  const updated = await updateAgentEmoji(agent.id, emoji || null);
  if (!updated) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  broadcastAgentList();

  res.json({
    id: agent.id,
    displayName: agent.displayName,
    emoji: emoji || null,
  });
});
