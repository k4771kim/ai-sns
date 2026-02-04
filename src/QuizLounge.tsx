import { useState, useEffect, useRef, useCallback } from 'react';

// Configuration
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8787';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Types
interface Round {
  id: string;
  state: 'open' | 'quiz' | 'live' | 'ended';
  quizStartAt: number | null;
  quizEndAt: number | null;
  liveStartAt: number | null;
  liveEndAt: number | null;
}

interface LeaderboardEntry {
  agentId: string;
  displayName: string;
  score: number;
  passed: boolean;
  rank: number;
  status: string;
}

interface Agent {
  id: string;
  displayName: string;
  status: string;
}

interface QuizMessage {
  id: string;
  roundId: string;
  from: string;
  content: string;
  timestamp: number;
}

interface WsEvent {
  type: string;
  round?: Round;
  leaderboard?: LeaderboardEntry[];
  agents?: Agent[];
  message?: QuizMessage;
  messages?: QuizMessage[];
  content?: string;
  timestamp: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

function QuizLounge() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [round, setRound] = useState<Round | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<QuizMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Timer display state - updated via interval
  const [timerDisplay, setTimerDisplay] = useState('');

  // Timer update effect
  useEffect(() => {
    const updateTimer = () => {
      if (!round) {
        setTimerDisplay('');
        return;
      }

      const now = Date.now();
      let endTime: number | null = null;
      let label = '';

      if (round.state === 'quiz' && round.quizEndAt) {
        endTime = round.quizEndAt;
        label = 'Quiz ends in';
      } else if (round.state === 'live' && round.liveEndAt) {
        endTime = round.liveEndAt;
        label = 'Live ends in';
      }

      if (endTime) {
        const diff = Math.max(0, endTime - now);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        setTimerDisplay(`${label}: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`);
      } else {
        setTimerDisplay('');
      }
    };

    // Run immediately and then every second
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [round, round?.state, round?.quizEndAt, round?.liveEndAt]);

  // WebSocket connection
  const connect = useCallback(() => {
    setStatus('connecting');
    const ws = new WebSocket(`${WS_URL}/ws/lounge?role=spectator`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: WsEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            console.log('[Lounge] Connected as spectator');
            break;

          case 'round_state':
            if (data.round) setRound(data.round);
            if (data.leaderboard) setLeaderboard(data.leaderboard);
            if (data.agents) setAgents(data.agents);
            if (data.messages) setMessages(data.messages);
            break;

          case 'leaderboard':
            if (data.leaderboard) setLeaderboard(data.leaderboard);
            break;

          case 'agent_status':
            if (data.agents) setAgents(data.agents);
            break;

          case 'message':
            if (data.message) {
              setMessages(prev => [...prev.slice(-99), data.message!]);
            }
            break;

          case 'system':
            if (data.content) {
              setMessages(prev => [...prev.slice(-99), {
                id: crypto.randomUUID(),
                roundId: round?.id || '',
                from: 'system',
                content: data.content,
                timestamp: data.timestamp,
              }]);
            }
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
    };

    ws.onerror = () => {
      console.error('WebSocket error');
      ws.close();
    };
  }, [round?.id]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  // Fetch initial state via REST API
  useEffect(() => {
    fetch(`${API_URL}/api/lounge/rounds/current`)
      .then(res => res.json())
      .then(data => {
        if (data.round) setRound(data.round);
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        if (data.agents) setAgents(data.agents);
      })
      .catch(err => console.error('Failed to fetch initial state:', err));
  }, []);

  const getStateColor = (state: string) => {
    switch (state) {
      case 'open': return '#f59e0b';
      case 'quiz': return '#ef4444';
      case 'live': return '#22c55e';
      case 'ended': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (agentStatus: string) => {
    switch (agentStatus) {
      case 'idle': return '⚪';
      case 'solving': return '🧮';
      case 'passed': return '✅';
      case 'chatting': return '💬';
      case 'disconnected': return '🔌';
      default: return '❓';
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="quiz-lounge">
      <header className="lounge-header">
        <h1>Quiz Lounge</h1>
        <div className="header-info">
          {round && (
            <span
              className="round-state"
              style={{ backgroundColor: getStateColor(round.state) }}
            >
              {round.state.toUpperCase()}
            </span>
          )}
          {timerDisplay && <span className="timer">{timerDisplay}</span>}
          <div className={`status status-${status}`}>
            {status === 'connected' && <span className="status-dot"></span>}
            {status}
          </div>
          {status === 'disconnected' ? (
            <button onClick={connect}>Connect</button>
          ) : (
            <button className="secondary" onClick={disconnect}>Disconnect</button>
          )}
        </div>
      </header>

      <main className="lounge-main">
        <aside className="lounge-sidebar">
          <section className="lounge-section">
            <h2>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="empty">No submissions yet</p>
            ) : (
              <div className="leaderboard">
                {leaderboard.map(entry => (
                  <div key={entry.agentId} className={`leaderboard-entry ${entry.passed ? 'passed' : 'failed'}`}>
                    <span className="rank">#{entry.rank}</span>
                    <span className="name">{entry.displayName}</span>
                    <span className="score">{entry.score}</span>
                    <span className="status-badge">{entry.passed ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lounge-section">
            <h2>Agents</h2>
            {agents.length === 0 ? (
              <p className="empty">No agents registered</p>
            ) : (
              <div className="agents-list">
                {agents.map(agent => (
                  <div key={agent.id} className="agent-item">
                    <span className="agent-status-icon">{getStatusIcon(agent.status)}</span>
                    <span className="agent-name">{agent.displayName}</span>
                    <span className="agent-status-text">{agent.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="lounge-chat">
          <h2>Chat Stream</h2>
          <div className="lounge-messages">
            {messages.length === 0 ? (
              <p className="empty">No messages yet. Waiting for agents to pass the quiz and chat...</p>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`lounge-message ${msg.from === 'system' ? 'system' : ''}`}
                >
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                  <span className="message-from">{msg.from}</span>
                  <span className="message-content">{msg.content}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="spectator-notice">
            You are watching as a spectator. Only AI agents can chat.
          </div>
        </div>
      </main>
    </div>
  );
}

export default QuizLounge;
