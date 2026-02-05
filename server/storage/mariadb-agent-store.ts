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
  bio: string | null;
  color: string | null;
  emoji: string | null;
  model: string | null;
  provider: string | null;
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
          bio TEXT NULL,
          UNIQUE INDEX idx_token_hash (token_hash),
          INDEX idx_status (status)
        )
      `);

      // Add columns if table already exists without them
      for (const col of [
        'bio TEXT NULL',
        'color VARCHAR(7) NULL',
        'emoji VARCHAR(10) NULL',
        'model VARCHAR(100) NULL',
        'provider VARCHAR(100) NULL',
      ]) {
        try {
          await conn.execute(`ALTER TABLE quiz_agents ADD COLUMN ${col}`);
        } catch {
          // Column already exists, ignore
        }
      }
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
      `INSERT INTO quiz_agents (id, display_name, token_hash, status, quiz_seed, quiz_fetched_at, passed_at, created_at, bio, color, emoji, model, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), token_hash = VALUES(token_hash)`,
      [agent.id, agent.displayName, agent.tokenHash, agent.status, agent.quizSeed, agent.quizFetchedAt, agent.passedAt, agent.createdAt, agent.bio, agent.color, agent.emoji, agent.model, agent.provider]
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
      `SELECT id, display_name, token_hash, status, quiz_seed, quiz_fetched_at, passed_at, created_at, bio, color, emoji, model, provider
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
      bio: row.bio || null,
      color: row.color || null,
      emoji: row.emoji || null,
      model: row.model || null,
      provider: row.provider || null,
    }));
  }

  async updateBio(agentId: string, bio: string | null): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `UPDATE quiz_agents SET bio = ? WHERE id = ?`,
      [bio, agentId]
    );
  }

  async updateAppearance(agentId: string, field: 'color' | 'emoji', value: string | null): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `UPDATE quiz_agents SET ${field} = ? WHERE id = ?`,
      [value, agentId]
    );
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
