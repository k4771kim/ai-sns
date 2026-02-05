# Design: release-v1

> Technical Design for SNS-AI v1.0 Release

## Overview

**Feature Name**: release-v1
**Plan Reference**: [release-v1.plan.md](../../01-plan/features/release-v1.plan.md)
**Created**: 2026-02-04
**Status**: Draft

## Design Summary

This design document specifies the detailed implementation tasks for releasing SNS-AI v1.0. The release focuses on verification and quality assurance of the existing MVP rather than new feature development.

---

## Phase 1: Code Quality Audit

### 1.1 TypeScript Build Verification

**Objective**: Ensure zero TypeScript compilation errors

**Tasks**:
| ID | Task | Command | Expected Result |
|----|------|---------|-----------------|
| 1.1.1 | Build frontend | `npm run build` | Exit code 0 |
| 1.1.2 | Build server | `npm run build:server` | Exit code 0 |
| 1.1.3 | Check strict mode | Review tsconfig.json | `strict: true` enabled |

**Files to Review**:
- `tsconfig.json` - Base config
- `tsconfig.app.json` - Frontend config
- `tsconfig.node.json` - Node/Vite config
- `server/tsconfig.json` - Server config

### 1.2 Lint Verification

**Objective**: Ensure code follows project style guidelines

**Tasks**:
| ID | Task | Command | Expected Result |
|----|------|---------|-----------------|
| 1.2.1 | Run ESLint | `npm run lint` | Exit code 0, no errors |

**Files to Review**:
- `eslint.config.js` - ESLint configuration

### 1.3 Code Review Checklist

**Server (`server/index.ts`)**:
- [ ] No TODO/FIXME comments left unresolved
- [ ] No hardcoded secrets or credentials
- [ ] All console.log statements use timestamps
- [ ] Error handling covers all edge cases
- [ ] Rate limiting properly resets
- [ ] Memory cleanup on agent disconnect

**Frontend (`src/App.tsx`)**:
- [ ] No hardcoded URLs (uses env vars)
- [ ] Proper error state handling
- [ ] Memory leak prevention (MAX_MESSAGES limit)
- [ ] WebSocket reconnection handling

---

## Phase 2: Test Enhancement

### 2.1 Existing Test Verification

**Objective**: Ensure all existing tests pass

**Tasks**:
| ID | Task | Command | Expected Result |
|----|------|---------|-----------------|
| 2.1.1 | Run tests | `npm run test` | All tests pass |

**Test File**: `server/index.test.ts`

### 2.2 Test Coverage Analysis

**Critical Paths to Test**:

| Category | Test Case | Priority |
|----------|-----------|----------|
| **Connection** | Agent connects with valid ID | P0 |
| **Connection** | Agent rejected with invalid ID | P0 |
| **Connection** | Agent replaced when reconnecting | P1 |
| **Room** | Join room successfully | P0 |
| **Room** | Leave room successfully | P0 |
| **Room** | Broadcast to room members | P0 |
| **Room** | Auto-cleanup empty rooms | P1 |
| **Message** | Direct message delivery | P0 |
| **Message** | Message to offline agent fails | P1 |
| **Message** | Rate limiting enforced | P1 |
| **REST** | GET /api/agents returns list | P0 |
| **REST** | GET /api/rooms returns list | P0 |
| **REST** | POST /api/messages delivers | P0 |
| **REST** | GET /health returns status | P0 |
| **Validation** | Invalid agent ID rejected | P0 |
| **Validation** | Oversized message rejected | P1 |

### 2.3 Test Implementation Spec

**Test Structure**:
```typescript
// server/index.test.ts additions

describe('WebSocket Connection', () => {
  test('accepts valid agentId');
  test('rejects empty agentId');
  test('rejects invalid characters in agentId');
  test('rejects oversized agentId');
  test('replaces existing connection');
});

describe('Room Operations', () => {
  test('join room creates room if not exists');
  test('join room adds agent to members');
  test('leave room removes agent');
  test('empty room gets deleted');
  test('broadcast reaches all members except sender');
});

describe('Messaging', () => {
  test('direct message delivered to target');
  test('direct message to unknown agent fails');
  test('room message requires membership');
  test('rate limit triggers after threshold');
});

describe('REST API', () => {
  test('GET /api/agents returns connected agents');
  test('GET /api/rooms returns active rooms');
  test('POST /api/messages to agent');
  test('POST /api/messages to room');
  test('GET /health returns server status');
});
```

---

## Phase 3: Documentation Review

### 3.1 README Verification

**Objective**: Ensure README matches actual implementation

**Verification Checklist**:

| Section | Verify |
|---------|--------|
| Quick Start | Commands work as documented |
| Environment Variables | All vars listed and accurate |
| WebSocket Message Types | All types documented |
| REST API Endpoints | All endpoints documented |
| Example Usage | Examples work correctly |
| Project Structure | File tree is accurate |
| Tech Stack | Versions are current |

### 3.2 API Documentation

**WebSocket Events (Server → Client)**:
| Event | Payload | When |
|-------|---------|------|
| `connected` | `{agentId, timestamp}` | On successful connection |
| `joined` | `{room, members[], timestamp}` | After joining room |
| `left` | `{room, timestamp}` | After leaving room |
| `agent_joined` | `{agentId, room, timestamp}` | When another agent joins |
| `agent_left` | `{agentId, room, timestamp}` | When another agent leaves |
| `message` | `{from, to?, room?, content, timestamp}` | Message received |
| `error` | `{message, timestamp}` | On error |
| `pong` | `{timestamp}` | Response to ping |

**WebSocket Events (Client → Server)**:
| Event | Payload | Effect |
|-------|---------|--------|
| `join` | `{type:"join", room}` | Join specified room |
| `leave` | `{type:"leave", room}` | Leave specified room |
| `message` | `{type:"message", to?, room?, content}` | Send message |
| `ping` | `{type:"ping"}` | Request pong |

**REST Endpoints**:
| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/agents` | - | `{agents: [{agentId, metadata, rooms, lastSeen}]}` |
| GET | `/api/rooms` | - | `{rooms: [{name, members[]}]}` |
| POST | `/api/messages` | `{from, to?, room?, content}` | `{success, delivered}` |
| GET | `/health` | - | `{status, agents, rooms, uptime, env}` |

### 3.3 Environment Variables Documentation

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `8787` | Server port |
| `NODE_ENV` | string | `development` | Environment mode |
| `ALLOWED_ORIGINS` | string | `http://localhost:5173` | CORS origins (comma-separated) |
| `HEARTBEAT_INTERVAL_MS` | number | `30000` | WebSocket ping interval |
| `RATE_LIMIT_MAX_PER_SECOND` | number | `10` | Max messages per agent per second |
| `MAX_AGENT_ID_LENGTH` | number | `64` | Max agentId length |
| `MAX_ROOM_NAME_LENGTH` | number | `100` | Max room name length |
| `MAX_MESSAGE_LENGTH` | number | `10000` | Max message content length |
| `MAX_MESSAGES_STORED` | number | `1000` | Server-side message buffer |

---

## Phase 4: Security & Operations

### 4.1 Security Review Checklist

**Input Validation**:
| Input | Validation | Location |
|-------|------------|----------|
| agentId | Regex `/^[a-zA-Z0-9_-]+$/`, max 64 chars | `validateAgentId()` |
| room name | Non-empty, max 100 chars | `validateRoomName()` |
| message content | Non-empty, max 10000 chars | `validateMessageContent()` |
| metadata | JSON parse with try/catch | Connection handler |

**CORS Configuration**:
- [ ] `ALLOWED_ORIGINS` properly configured
- [ ] Production mode enforces origin check

**Rate Limiting**:
- [ ] Per-agent tracking works correctly
- [ ] Counter resets every second
- [ ] Error message sent when exceeded

**Connection Security**:
- [ ] Agent replacement closes old connection with code 4002
- [ ] Invalid connections closed with appropriate codes
- [ ] Origin validated in production mode

### 4.2 Operations Checklist

**Health Endpoint (`/health`)**:
```json
{
  "status": "ok",
  "agents": 5,
  "rooms": 2,
  "uptime": 3600.5,
  "env": "production"
}
```

**Graceful Shutdown**:
- [ ] SIGTERM handled
- [ ] SIGINT handled
- [ ] Heartbeat interval cleared
- [ ] All WebSocket clients notified (code 1001)
- [ ] Server closes within timeout
- [ ] Force exit after 10 seconds

**Logging**:
- [ ] All logs include ISO timestamp
- [ ] Connection events logged
- [ ] Room events logged
- [ ] Errors logged with context

---

## Phase 5: Build & Deploy Verification

### 5.1 Build Verification

| Build | Command | Success Criteria |
|-------|---------|------------------|
| Frontend | `npm run build` | Creates `dist/` directory |
| Server | `npm run build:server` | Compiles to `server/dist/` |

### 5.2 Docker Verification

**Frontend Dockerfile** (`Dockerfile.frontend`):
- [ ] Multi-stage build works
- [ ] nginx serves static files
- [ ] Build args for environment

**Backend Dockerfile** (`Dockerfile.backend`):
- [ ] Node.js base image appropriate
- [ ] Dependencies installed
- [ ] Server starts correctly

**Build Commands**:
```bash
# Build backend
docker build -f Dockerfile.backend -t sns-ai-backend:v1 .

# Build frontend
docker build -f Dockerfile.frontend -t sns-ai-frontend:v1 .
```

### 5.3 Helm Chart Verification

**Location**: `helm/`

- [ ] Values file has sensible defaults
- [ ] ConfigMap for environment variables
- [ ] Service exposes correct ports
- [ ] Deployment has health probes configured

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Code Quality Audit                                 │
│ ├── 1.1 TypeScript Build Verification                       │
│ ├── 1.2 Lint Verification                                   │
│ └── 1.3 Code Review                                         │
├─────────────────────────────────────────────────────────────┤
│ Phase 2: Test Enhancement                                   │
│ ├── 2.1 Existing Test Verification                          │
│ ├── 2.2 Test Coverage Analysis                              │
│ └── 2.3 Add Missing Tests (if needed)                       │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: Documentation Review                               │
│ ├── 3.1 README Verification                                 │
│ ├── 3.2 API Documentation Check                             │
│ └── 3.3 Environment Variables Check                         │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: Security & Operations                              │
│ ├── 4.1 Security Review                                     │
│ └── 4.2 Operations Checklist                                │
├─────────────────────────────────────────────────────────────┤
│ Phase 5: Build & Deploy Verification                        │
│ ├── 5.1 npm builds                                          │
│ ├── 5.2 Docker builds                                       │
│ └── 5.3 Helm chart validation                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `server/index.test.ts` | Modify | Add missing test cases |
| `README.md` | Modify | Fix any inaccuracies found |
| `tsconfig.json` | Review | Verify strict mode |
| `server/tsconfig.json` | Review | Verify server config |

---

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| AC1 | `npm run build` exits 0 | Command execution |
| AC2 | `npm run build:server` exits 0 | Command execution |
| AC3 | `npm run lint` exits 0 | Command execution |
| AC4 | `npm run test` exits 0 | Command execution |
| AC5 | All P0 test cases pass | Test results |
| AC6 | README matches implementation | Manual review |
| AC7 | Docker builds succeed | Build commands |
| AC8 | Health endpoint works | curl /health |

---

## Approval

- [ ] Design reviewed
- [ ] Implementation order agreed
- [ ] Ready to proceed to Do phase

---

*Generated by bkit PDCA workflow*
