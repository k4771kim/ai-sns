// =============================================================================
// MariaDB Agent Store Implementation
// =============================================================================
// Persistent storage for quiz agents (survives server restarts)
// =============================================================================

import mysql from 'mysql2/promise';
import { getSharedPool } from './mariadb-message-store.js';

// =============================================================================
// Types (mirrors QuizAgent from quiz-lounge.ts)
// =============================================================================

export interface StoredAgent {
  id: string;
  displayName: string;
  tokenHash: string;
  status: 'idle' | 'passed';
  quizSeed: string;
  quizFetchedAt: number | null;
  passedAt: number | null;
  createdAt: number;
}

// =============================================================================
// MariaDB Agent Store
// =============================================================================

export class MariaDBAgentStore {

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const pool = getSharedPool();
    if (!pool) throw new Error('Shared DB pool not available');

    const conn = await pool.getConnection();
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS quiz_agents (
          id VARCHAR(36) PRIMARY KEY,
          display_name VARCHAR(100) NOT NULL,
          token_hash VARCHAR(64) NOT NULL,
          status ENUM('idle', 'passed') DEFAULT 'idle',
          quiz_seed VARCHAR(32) NOT NULL,
          quiz_fetched_at BIGINT NULL,
          passed_at BIGINT NULL,
          created_at BIGINT NOT NULL,
          UNIQUE INDEX idx_token_hash (token_hash),
          INDEX idx_status (status)
        )
      `);
      console.log('[MariaDB] quiz_agents table initialized');
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  async saveAgent(agent: StoredAgent): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `INSERT INTO quiz_agents (id, display_name, token_hash, status, quiz_seed, quiz_fetched_at, passed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), token_hash = VALUES(token_hash)`,
      [agent.id, agent.displayName, agent.tokenHash, agent.status, agent.quizSeed, agent.quizFetchedAt, agent.passedAt, agent.createdAt]
    );
  }

  async updateAgentStatus(agentId: string, status: 'idle' | 'passed', passedAt: number | null): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `UPDATE quiz_agents SET status = ?, passed_at = ? WHERE id = ?`,
      [status, passedAt, agentId]
    );
  }

  async updateQuizFetch(agentId: string, quizSeed: string, quizFetchedAt: number): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `UPDATE quiz_agents SET quiz_seed = ?, quiz_fetched_at = ? WHERE id = ?`,
      [quizSeed, quizFetchedAt, agentId]
    );
  }

  async loadAllAgents(): Promise<StoredAgent[]> {
    const pool = getSharedPool();
    if (!pool) return [];

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, display_name, token_hash, status, quiz_seed, quiz_fetched_at, passed_at, created_at
       FROM quiz_agents`
    );

    return rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      tokenHash: row.token_hash,
      status: row.status,
      quizSeed: row.quiz_seed,
      quizFetchedAt: row.quiz_fetched_at ? Number(row.quiz_fetched_at) : null,
      passedAt: row.passed_at ? Number(row.passed_at) : null,
      createdAt: Number(row.created_at),
    }));
  }

  async deleteAgent(agentId: string): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `DELETE FROM quiz_agents WHERE id = ?`,
      [agentId]
    );
  }
}

// =============================================================================
// Singleton
// =============================================================================

let agentStore: MariaDBAgentStore | null = null;

export function getMariaDBAgentStore(): MariaDBAgentStore | null {
  return agentStore;
}

export function createMariaDBAgentStore(): MariaDBAgentStore {
  if (!agentStore) {
    agentStore = new MariaDBAgentStore();
  }
  return agentStore;
}
