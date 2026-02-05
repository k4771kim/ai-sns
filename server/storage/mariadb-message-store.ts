// =============================================================================
// MariaDB Message Store Implementation
// =============================================================================
// Persistent storage for quiz lounge messages with cursor-based pagination
// =============================================================================

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export interface QuizMessage {
  id: string;
  room: string;
  from: string;
  displayName: string;
  content: string;
  timestamp: number;
}

export interface PaginatedMessages {
  messages: QuizMessage[];
  hasMore: boolean;
  oldestId: string | null;
}

export interface MariaDBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// =============================================================================
// MariaDB Quiz Message Store
// =============================================================================

export class MariaDBMessageStore {
  private pool: Pool | null = null;
  private config: MariaDBConfig;

  constructor(config: MariaDBConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Create connection pool
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Share pool for other stores
    setSharedPool(this.pool);

    // Test connection and create table
    const conn = await this.pool.getConnection();
    try {
      await this.createTables(conn);
      console.log('[MariaDB] Connected and tables initialized');
    } finally {
      conn.release();
    }
  }

  private async createTables(conn: PoolConnection): Promise<void> {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS quiz_messages (
        id VARCHAR(36) PRIMARY KEY,
        room VARCHAR(100) NOT NULL,
        from_agent VARCHAR(36) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        INDEX idx_room_timestamp (room, timestamp),
        INDEX idx_timestamp (timestamp)
      )
    `);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('[MariaDB] Connection pool closed');
    }
  }

  // ---------------------------------------------------------------------------
  // Message Operations
  // ---------------------------------------------------------------------------

  async addMessage(message: QuizMessage): Promise<void> {
    if (!this.pool) throw new Error('MariaDB not initialized');

    await this.pool.execute(
      `INSERT INTO quiz_messages (id, room, from_agent, display_name, content, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [message.id, message.room, message.from, message.displayName, message.content, message.timestamp]
    );
  }

  async getMessages(
    room?: string,
    limit: number = 100,
    before?: string
  ): Promise<PaginatedMessages> {
    if (!this.pool) throw new Error('MariaDB not initialized');

    let query: string;
    let params: (string | number)[];

    if (before) {
      // Get the timestamp of the 'before' message
      const [beforeRows] = await this.pool.execute<mysql.RowDataPacket[]>(
        'SELECT timestamp FROM quiz_messages WHERE id = ?',
        [before]
      );

      if (beforeRows.length === 0) {
        // If 'before' message not found, return empty
        return { messages: [], hasMore: false, oldestId: null };
      }

      const beforeTimestamp = beforeRows[0].timestamp;

      if (room) {
        query = `
          SELECT id, room, from_agent, display_name, content, timestamp
          FROM quiz_messages
          WHERE room = ? AND timestamp < ?
          ORDER BY timestamp DESC
          LIMIT ?
        `;
        params = [room, beforeTimestamp, limit + 1];
      } else {
        query = `
          SELECT id, room, from_agent, display_name, content, timestamp
          FROM quiz_messages
          WHERE timestamp < ?
          ORDER BY timestamp DESC
          LIMIT ?
        `;
        params = [beforeTimestamp, limit + 1];
      }
    } else {
      // No cursor - get latest messages
      if (room) {
        query = `
          SELECT id, room, from_agent, display_name, content, timestamp
          FROM quiz_messages
          WHERE room = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `;
        params = [room, limit + 1];
      } else {
        query = `
          SELECT id, room, from_agent, display_name, content, timestamp
          FROM quiz_messages
          ORDER BY timestamp DESC
          LIMIT ?
        `;
        params = [limit + 1];
      }
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(query, params);

    // Check if there are more messages
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(row => ({
      id: row.id,
      room: row.room,
      from: row.from_agent,
      displayName: row.display_name,
      content: row.content,
      timestamp: Number(row.timestamp),
    }));

    // Reverse to get chronological order (oldest first)
    messages.reverse();

    const oldestId = messages.length > 0 ? messages[0].id : null;

    return { messages, hasMore, oldestId };
  }

  async getMessageCount(room?: string): Promise<number> {
    if (!this.pool) throw new Error('MariaDB not initialized');

    let query: string;
    let params: string[];

    if (room) {
      query = 'SELECT COUNT(*) as count FROM quiz_messages WHERE room = ?';
      params = [room];
    } else {
      query = 'SELECT COUNT(*) as count FROM quiz_messages';
      params = [];
    }

    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(query, params);
    return Number(rows[0].count);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let store: MariaDBMessageStore | null = null;
let sharedPool: Pool | null = null;

export function createMariaDBMessageStore(): MariaDBMessageStore | null {
  const host = process.env.DB_HOST;
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME || 'ai_sns';

  if (!host || !user || !password) {
    console.log('[MariaDB] Missing DB configuration, will use in-memory storage');
    return null;
  }

  if (!store) {
    store = new MariaDBMessageStore({ host, port, user, password, database });
  }

  return store;
}

export function getMariaDBMessageStore(): MariaDBMessageStore | null {
  return store;
}

// Shared pool access for other stores (e.g., agent store)
export function getSharedPool(): Pool | null {
  return sharedPool;
}

export function setSharedPool(pool: Pool): void {
  sharedPool = pool;
}
