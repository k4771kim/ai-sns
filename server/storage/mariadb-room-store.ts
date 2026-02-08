// =============================================================================
// MariaDB Room Store Implementation
// =============================================================================
// Persistent storage for quiz lounge rooms (survives server restarts)
// =============================================================================

import mysql from 'mysql2/promise';
import { getSharedPool } from './mariadb-message-store.js';

// =============================================================================
// Types
// =============================================================================

export interface StoredRoom {
  name: string;
  description: string;
  prompt: string;
  createdBy: string | null;
  createdAt: number;
  isDefault: boolean;
}

// =============================================================================
// MariaDB Room Store
// =============================================================================

export class MariaDBRoomStore {

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const pool = getSharedPool();
    if (!pool) throw new Error('Shared DB pool not available');

    const conn = await pool.getConnection();
    try {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS quiz_rooms (
          name VARCHAR(50) PRIMARY KEY,
          description VARCHAR(200) NOT NULL DEFAULT '',
          prompt VARCHAR(1000) NOT NULL DEFAULT '',
          created_by VARCHAR(36) NULL,
          created_at BIGINT NOT NULL,
          is_default BOOLEAN NOT NULL DEFAULT FALSE
        )
      `);
      console.log('[MariaDB] quiz_rooms table initialized');
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  async saveRoom(room: StoredRoom): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    await pool.execute(
      `INSERT INTO quiz_rooms (name, description, prompt, created_by, created_at, is_default)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description), prompt = VALUES(prompt), is_default = VALUES(is_default)`,
      [room.name, room.description, room.prompt, room.createdBy, room.createdAt, room.isDefault]
    );
  }

  async updateRoom(name: string, updates: { description?: string; prompt?: string }): Promise<void> {
    const pool = getSharedPool();
    if (!pool) return;

    const setClauses: string[] = [];
    const params: (string | number)[] = [];

    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updates.description);
    }
    if (updates.prompt !== undefined) {
      setClauses.push('prompt = ?');
      params.push(updates.prompt);
    }

    if (setClauses.length === 0) return;

    params.push(name);
    await pool.execute(
      `UPDATE quiz_rooms SET ${setClauses.join(', ')} WHERE name = ?`,
      params
    );
  }

  async deleteRoom(name: string): Promise<boolean> {
    const pool = getSharedPool();
    if (!pool) return false;

    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `DELETE FROM quiz_rooms WHERE name = ? AND is_default = FALSE`,
      [name]
    );
    return result.affectedRows > 0;
  }

  async loadAllRooms(): Promise<StoredRoom[]> {
    const pool = getSharedPool();
    if (!pool) return [];

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT name, description, prompt, created_by, created_at, is_default
       FROM quiz_rooms`
    );

    return rows.map(row => ({
      name: row.name,
      description: row.description,
      prompt: row.prompt,
      createdBy: row.created_by || null,
      createdAt: Number(row.created_at),
      isDefault: Boolean(row.is_default),
    }));
  }
}

// =============================================================================
// Singleton
// =============================================================================

let roomStore: MariaDBRoomStore | null = null;

export function getMariaDBRoomStore(): MariaDBRoomStore | null {
  return roomStore;
}

export function createMariaDBRoomStore(): MariaDBRoomStore {
  if (!roomStore) {
    roomStore = new MariaDBRoomStore();
  }
  return roomStore;
}
