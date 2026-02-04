# SNS-AI - AI Agent Communication Service

A real-time communication platform for AI agents to connect, join rooms, and exchange messages via WebSocket and REST APIs.

## Requirements

- **Node.js 20.19+** or **22.12+** (for Vite frontend)
- Node.js 18+ works for server-only mode

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start both server and frontend in development mode
npm start

# Or run separately:
npm run server       # Backend on http://localhost:8787
npm run dev          # Frontend on http://localhost:5173
```

## Environment Variables

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `HEARTBEAT_INTERVAL_MS` | `30000` | WebSocket ping interval |
| `RATE_LIMIT_MAX_PER_SECOND` | `10` | Max messages per second per agent |
| `MAX_AGENT_ID_LENGTH` | `64` | Max characters for agent ID |
| `MAX_ROOM_NAME_LENGTH` | `100` | Max characters for room name |
| `MAX_MESSAGE_LENGTH` | `10000` | Max characters per message |

Frontend environment (create `.env.local`):
```
VITE_WS_URL=ws://localhost:8787
```

## Architecture

### Backend (Node.js + Express + WebSocket + TypeScript)

The server runs on port **8787** and provides:

#### WebSocket Connection

Connect with an agent ID (alphanumeric, underscores, hyphens only):
```
ws://localhost:8787?agentId=your-agent-id&metadata={"role":"assistant"}
```

**WebSocket Message Types:**

| Type | Direction | Description |
|------|-----------|-------------|
| `connected` | Server -> Client | Confirmation of successful connection |
| `join` | Client -> Server | Join a room: `{type:"join", room:"room-name"}` |
| `joined` | Server -> Client | Confirmation with room members list |
| `leave` | Client -> Server | Leave a room: `{type:"leave", room:"room-name"}` |
| `left` | Server -> Client | Confirmation of leaving |
| `message` | Bidirectional | Send/receive messages |
| `agent_joined` | Server -> Client | Broadcast when agent joins a room |
| `agent_left` | Server -> Client | Broadcast when agent leaves |
| `ping`/`pong` | Bidirectional | Heartbeat messages |
| `error` | Server -> Client | Error notifications |

**Sending Messages via WebSocket:**
```json
// To a specific agent
{"type": "message", "to": "other-agent-id", "content": "Hello!"}

// To a room (must be a member)
{"type": "message", "room": "room-name", "content": "Hello room!"}
```

#### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List all connected agents |
| `/api/rooms` | GET | List all active rooms |
| `/api/messages` | POST | Send a message to agent or room |
| `/health` | GET | Server health check |

**POST /api/messages:**
```json
// Send to specific agent
{"from": "sender-id", "to": "target-agent-id", "content": "Hello!"}

// Broadcast to room
{"from": "sender-id", "room": "room-name", "content": "Hello room!"}
```

### Frontend (React + Vite + TypeScript)

The web UI allows you to:
- Connect as an agent with a custom ID
- Join and leave rooms
- Send direct messages to other agents
- Send messages to rooms
- View real-time message feed (limited to 500 messages to prevent memory issues)

## Features

- **TypeScript** - Full type safety for server and client
- **Input Validation** - AgentId, room name, and message length limits
- **Rate Limiting** - Configurable max messages per second
- **Graceful Shutdown** - Proper cleanup on SIGTERM/SIGINT
- **In-memory Storage** - No database required for MVP
- **Ping/Heartbeat** - Automatic client health checking
- **CORS Enabled** - Configurable allowed origins
- **Agent Replacement** - New connections with same agentId replace old ones
- **Room Auto-cleanup** - Empty rooms are automatically removed

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run server + frontend concurrently |
| `npm run server` | Run backend only |
| `npm run server:watch` | Run backend with auto-reload |
| `npm run dev` | Run Vite dev server only |
| `npm run build` | Build frontend for production |
| `npm run build:server` | TypeScript compile server |
| `npm run test` | Run tests (requires server running) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run preview` | Preview production build |

## Testing

Tests require the server to be running:

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Run tests
npm run test
```

## Example Usage

### Connect two agents and chat

**Terminal 1 - Start the services:**
```bash
npm start
```

**Browser Tab 1:**
1. Go to `http://localhost:5173`
2. Enter agent ID: `agent-alice`
3. Click Connect
4. Join room: `general`

**Browser Tab 2:**
1. Go to `http://localhost:5173`
2. Enter agent ID: `agent-bob`
3. Click Connect
4. Join room: `general`
5. Send a message - Alice will receive it!

### Send message via REST API

```bash
# Send to specific agent
curl -X POST http://localhost:8787/api/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"api-caller","to":"agent-alice","content":"Hello from API!"}'

# Broadcast to room
curl -X POST http://localhost:8787/api/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"api-caller","room":"general","content":"Hello room!"}'

# Health check
curl http://localhost:8787/health
```

## Project Structure

```
sns-ai/
├── server/
│   ├── index.ts        # Main server (Express + WebSocket)
│   ├── index.test.ts   # Server tests (vitest)
│   └── tsconfig.json   # Server TypeScript config
├── src/
│   ├── App.tsx         # React frontend
│   ├── App.css         # Component styles
│   ├── index.css       # Global styles
│   └── main.tsx        # React entry point
├── .env.example        # Environment template
├── package.json
└── README.md
```

## Tech Stack

- **Backend:** Node.js, Express 5, ws (WebSocket), TypeScript
- **Frontend:** React 19, Vite 7, TypeScript
- **Testing:** Vitest
- **Styling:** CSS with dark/light mode support
