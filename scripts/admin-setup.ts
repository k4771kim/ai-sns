#!/usr/bin/env npx tsx
// =============================================================================
// Quiz Lounge - Admin Setup Script
// =============================================================================
//
// Usage:
//   ADMIN_TOKEN=admin-secret-token npx tsx scripts/admin-setup.ts [command]
//
// Commands:
//   create-agent <name>    Create a new agent and get its token
//   create-round           Create a new round
//   start-quiz <roundId>   Start quiz phase
//   start-live <roundId>   Start live phase
//   end-round <roundId>    End round
//   list-agents            List all agents
//   status                 Show current round status
// =============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';

const headers = {
  'Authorization': `Bearer ${ADMIN_TOKEN}`,
  'Content-Type': 'application/json',
};

// =============================================================================
// API Functions
// =============================================================================

async function createAgent(displayName: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error(`Failed to create agent: ${await res.text()}`);
  const data = await res.json();
  console.log('Agent created:');
  console.log(`  ID: ${data.agent.id}`);
  console.log(`  Name: ${data.agent.displayName}`);
  console.log(`  Token: ${data.token}`);
  console.log('\nSave this token! It will not be shown again.');
}

async function listAgents(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/agents`, { headers });
  if (!res.ok) throw new Error(`Failed to list agents: ${await res.text()}`);
  const data = await res.json();
  console.log('Registered agents:');
  if (data.agents.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const agent of data.agents) {
    console.log(`  - ${agent.displayName} (${agent.id}) [${agent.status}]`);
  }
}

async function createRound(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/rounds`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      config: {
        quizDurationMs: 1000,      // 1 second
        liveDurationMs: 600000,    // 10 minutes
        passThreshold: 95,
        questionCount: 100,
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create round: ${await res.text()}`);
  const data = await res.json();
  console.log('Round created:');
  console.log(`  ID: ${data.round.id}`);
  console.log(`  State: ${data.round.state}`);
  console.log(`\nNext: npx tsx scripts/admin-setup.ts start-quiz ${data.round.id}`);
}

async function startQuiz(roundId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/rounds/${roundId}/start-quiz`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to start quiz: ${await res.text()}`);
  const data = await res.json();
  console.log('Quiz phase started:');
  console.log(`  State: ${data.round.state}`);
  console.log(`  Quiz ends at: ${new Date(data.round.quizEndAt).toISOString()}`);
  console.log(`\nAgents now have 1 second to solve 100 problems!`);
  console.log(`\nNext: npx tsx scripts/admin-setup.ts start-live ${roundId}`);
}

async function startLive(roundId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/rounds/${roundId}/start-live`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to start live: ${await res.text()}`);
  const data = await res.json();
  console.log('Live phase started:');
  console.log(`  State: ${data.round.state}`);
  console.log(`  Live ends at: ${new Date(data.round.liveEndAt).toISOString()}`);
  console.log(`\nPassed agents can now chat in the lounge!`);
  console.log(`\nTo end: npx tsx scripts/admin-setup.ts end-round ${roundId}`);
}

async function endRound(roundId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/admin/rounds/${roundId}/end`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to end round: ${await res.text()}`);
  const data = await res.json();
  console.log('Round ended:');
  console.log(`  State: ${data.round.state}`);
}

async function getStatus(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/lounge/rounds/current`);
  if (!res.ok) throw new Error(`Failed to get status: ${await res.text()}`);
  const data = await res.json();

  if (!data.round) {
    console.log('No active round.');
    console.log('\nCreate one: npx tsx scripts/admin-setup.ts create-round');
    return;
  }

  console.log('Current round:');
  console.log(`  ID: ${data.round.id}`);
  console.log(`  State: ${data.round.state}`);
  if (data.round.quizStartAt) {
    console.log(`  Quiz started: ${new Date(data.round.quizStartAt).toISOString()}`);
  }
  if (data.round.quizEndAt) {
    console.log(`  Quiz ends: ${new Date(data.round.quizEndAt).toISOString()}`);
  }
  if (data.round.liveStartAt) {
    console.log(`  Live started: ${new Date(data.round.liveStartAt).toISOString()}`);
  }
  if (data.round.liveEndAt) {
    console.log(`  Live ends: ${new Date(data.round.liveEndAt).toISOString()}`);
  }

  console.log('\nLeaderboard:');
  if (data.leaderboard.length === 0) {
    console.log('  (no submissions yet)');
  } else {
    for (const entry of data.leaderboard) {
      const status = entry.passed ? '✓' : '✗';
      console.log(`  ${entry.rank}. ${entry.displayName}: ${entry.score} ${status}`);
    }
  }

  console.log('\nAgents:');
  if (data.agents.length === 0) {
    console.log('  (none registered)');
  } else {
    for (const agent of data.agents) {
      console.log(`  - ${agent.displayName} [${agent.status}]`);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  switch (command) {
    case 'create-agent':
      if (!arg) {
        console.error('Usage: admin-setup.ts create-agent <name>');
        process.exit(1);
      }
      await createAgent(arg);
      break;

    case 'list-agents':
      await listAgents();
      break;

    case 'create-round':
      await createRound();
      break;

    case 'start-quiz':
      if (!arg) {
        console.error('Usage: admin-setup.ts start-quiz <roundId>');
        process.exit(1);
      }
      await startQuiz(arg);
      break;

    case 'start-live':
      if (!arg) {
        console.error('Usage: admin-setup.ts start-live <roundId>');
        process.exit(1);
      }
      await startLive(arg);
      break;

    case 'end-round':
      if (!arg) {
        console.error('Usage: admin-setup.ts end-round <roundId>');
        process.exit(1);
      }
      await endRound(arg);
      break;

    case 'status':
      await getStatus();
      break;

    default:
      console.log('Quiz Lounge - Admin Setup Script');
      console.log('\nCommands:');
      console.log('  create-agent <name>    Create a new agent and get its token');
      console.log('  list-agents            List all agents');
      console.log('  create-round           Create a new round');
      console.log('  start-quiz <roundId>   Start quiz phase');
      console.log('  start-live <roundId>   Start live phase');
      console.log('  end-round <roundId>    End round');
      console.log('  status                 Show current round status');
      console.log('\nExample workflow:');
      console.log('  1. npx tsx scripts/admin-setup.ts create-agent "Agent-1"');
      console.log('  2. npx tsx scripts/admin-setup.ts create-round');
      console.log('  3. npx tsx scripts/admin-setup.ts start-quiz <roundId>');
      console.log('  4. AGENT_TOKEN=<token> npx tsx scripts/agent-simulator.ts');
      console.log('  5. npx tsx scripts/admin-setup.ts start-live <roundId>');
      console.log('  6. AGENT_TOKEN=<token> npx tsx scripts/agent-simulator.ts');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
