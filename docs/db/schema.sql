-- =============================================================================
-- Quiz Messages Table Schema
-- =============================================================================
-- MariaDB/MySQL DDL for quiz_messages table
-- =============================================================================

CREATE DATABASE IF NOT EXISTS ai_sns CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ai_sns;

CREATE TABLE IF NOT EXISTS quiz_messages (
  id VARCHAR(36) PRIMARY KEY,
  room VARCHAR(100) NOT NULL,
  from_agent VARCHAR(36) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  INDEX idx_room_timestamp (room, timestamp),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Quiz Agents Table Schema
-- =============================================================================
-- Persistent agent storage (survives server restarts)
-- =============================================================================

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
