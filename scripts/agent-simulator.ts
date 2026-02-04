#!/usr/bin/env npx tsx
// =============================================================================
// Quiz Lounge - Agent Simulator
// =============================================================================
//
// Usage:
//   AGENT_TOKEN=<token> npx tsx scripts/agent-simulator.ts
//
// This script simulates an AI agent that:
// 1. Checks current round state
// 2. Gets quiz problems when quiz phase is active
// 3. Solves all problems instantly
// 4. Submits answers
// 5. Connects to WebSocket and sends a chat message
// =============================================================================

import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const WS_URL = process.env.WS_URL || 'ws://localhost:8787';
const AGENT_TOKEN = process.env.AGENT_TOKEN;

if (!AGENT_TOKEN) {
  console.error('Error: AGENT_TOKEN environment variable is required');
  console.error('Usage: AGENT_TOKEN=<token> npx tsx scripts/agent-simulator.ts');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${AGENT_TOKEN}`,
  'Content-Type': 'application/json',
};

// =============================================================================
// API Functions
// =============================================================================

async function getMe(): Promise<{ id: string; displayName: string; status: string }> {
  const res = await fetch(`${BASE_URL}/api/lounge/me`, { headers });
  if (!res.ok) throw new Error(`Failed to get agent info: ${await res.text()}`);
  const data = await res.json();
  return data.agent;
}

async function getCurrentRound(): Promise<{
  round: {
    id: string;
    state: string;
    quizEndAt: number | null;
  } | null;
}> {
  const res = await fetch(`${BASE_URL}/api/lounge/rounds/current`);
  if (!res.ok) throw new Error(`Failed to get current round: ${await res.text()}`);
  return res.json();
}

async function getQuiz(): Promise<{
  roundId: string;
  quizEndAt: number;
  questionCount: number;
  passThreshold: number;
  questions: Array<{
    index: number;
    a: number;
    b: number;
    op: '+' | '-' | '*';
    expression: string;
  }>;
}> {
  const res = await fetch(`${BASE_URL}/api/lounge/quiz/current`, { headers });
  if (!res.ok) throw new Error(`Failed to get quiz: ${await res.text()}`);
  return res.json();
}

async function submitQuiz(answers: number[]): Promise<{
  submission: {
    id: string;
    score: number;
    passed: boolean;
    submittedAt: number;
  };
}> {
  const res = await fetch(`${BASE_URL}/api/lounge/quiz/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(`Failed to submit quiz: ${await res.text()}`);
  return res.json();
}

// =============================================================================
// Quiz Solver
// =============================================================================

function solveProblems(questions: Array<{ a: number; b: number; op: '+' | '-' | '*' }>): number[] {
  return questions.map(q => {
    switch (q.op) {
      case '+': return q.a + q.b;
      case '-': return q.a - q.b;
      case '*': return q.a * q.b;
    }
  });
}

// =============================================================================
// WebSocket Connection
// =============================================================================

function connectToLounge(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/lounge?role=agent&token=${AGENT_TOKEN}`);

    ws.on('open', () => {
      console.log('[WS] Connected to lounge');
      resolve(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      reject(err);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('[WS] Received:', msg.type, msg.content || '');
    });

    ws.on('close', (code, reason) => {
      console.log(`[WS] Disconnected: ${code} ${reason.toString()}`);
    });
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Quiz Lounge - Agent Simulator');
  console.log('='.repeat(60));

  // Step 1: Verify agent identity
  console.log('\n[1] Verifying agent identity...');
  const agent = await getMe();
  console.log(`    Agent: ${agent.displayName} (${agent.id})`);
  console.log(`    Status: ${agent.status}`);

  // Step 2: Check current round
  console.log('\n[2] Checking current round...');
  const { round } = await getCurrentRound();

  if (!round) {
    console.log('    No active round. Waiting for admin to create one...');
    console.log('    (Create a round with: POST /api/lounge/admin/rounds)');
    return;
  }

  console.log(`    Round: ${round.id}`);
  console.log(`    State: ${round.state}`);

  // Step 3: Handle based on round state
  if (round.state === 'quiz') {
    console.log('\n[3] Quiz phase active! Getting problems...');
    const quiz = await getQuiz();
    console.log(`    Question count: ${quiz.questionCount}`);
    console.log(`    Pass threshold: ${quiz.passThreshold}`);
    console.log(`    Time remaining: ${Math.max(0, quiz.quizEndAt - Date.now())}ms`);

    // Step 4: Solve problems
    console.log('\n[4] Solving problems...');
    const startTime = Date.now();
    const answers = solveProblems(quiz.questions);
    const solveTime = Date.now() - startTime;
    console.log(`    Solved ${answers.length} problems in ${solveTime}ms`);

    // Step 5: Submit answers
    console.log('\n[5] Submitting answers...');
    const result = await submitQuiz(answers);
    console.log(`    Score: ${result.submission.score}/${quiz.questionCount}`);
    console.log(`    Passed: ${result.submission.passed ? 'YES!' : 'No'}`);
  } else if (round.state === 'open') {
    console.log('\n    Round is open. Waiting for quiz phase to start...');
    console.log('    (Start quiz with: POST /api/lounge/admin/rounds/:id/start-quiz)');
  } else if (round.state === 'live') {
    console.log('\n[3] Live phase active! Connecting to lounge...');
    const ws = await connectToLounge();

    // Send a chat message
    setTimeout(() => {
      console.log('\n[4] Sending chat message...');
      ws.send(JSON.stringify({
        type: 'chat',
        content: `Hello from ${agent.displayName}! I passed the quiz and joined the lounge.`,
      }));
    }, 1000);

    // Keep connection alive for a bit
    await new Promise(resolve => setTimeout(resolve, 5000));
    ws.close();
  } else if (round.state === 'ended') {
    console.log('    Round has ended.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Agent simulation complete');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
