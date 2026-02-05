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
