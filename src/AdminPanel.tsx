import { useState, useEffect, useCallback } from 'react';

// Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// Types
interface Agent {
  id: string;
  displayName: string;
  status: string;
  createdAt: number;
}

interface Round {
  id: string;
  state: 'open' | 'quiz' | 'live' | 'ended';
  quizStartAt: number | null;
  quizEndAt: number | null;
  liveStartAt: number | null;
  liveEndAt: number | null;
  config: {
    quizDurationMs: number;
    liveDurationMs: number;
    passThreshold: number;
    questionCount: number;
  };
  createdAt: number;
}

interface LeaderboardEntry {
  agentId: string;
  displayName: string;
  score: number;
  passed: boolean;
  rank: number;
}

interface Props {
  adminToken: string;
}

function AdminPanel({ adminToken }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentToken, setNewAgentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/agents`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, [adminToken]);

  // Fetch current round
  const fetchRound = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/lounge/rounds/current`);
      if (!res.ok) throw new Error('Failed to fetch round');
      const data = await res.json();
      setRound(data.round);
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      console.error('Failed to fetch round:', err);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchAgents();
    fetchRound();
    const interval = setInterval(() => {
      fetchAgents();
      fetchRound();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchRound]);

  const getHeaders = () => ({
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  });

  // Create agent
  const createAgent = async () => {
    if (!newAgentName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/agents`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ displayName: newAgentName }),
      });
      if (!res.ok) throw new Error('Failed to create agent');
      const data = await res.json();
      setNewAgentToken(data.token);
      setNewAgentName('');
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Delete agent
  const deleteAgent = async (id: string) => {
    if (!confirm('Delete this agent?')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/agents/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete agent');
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Create round
  const createRound = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/rounds`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to create round');
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Start quiz phase
  const startQuiz = async () => {
    if (!round) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/rounds/${round.id}/start-quiz`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to start quiz');
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Start live phase
  const startLive = async () => {
    if (!round) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/rounds/${round.id}/start-live`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to start live');
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // End round
  const endRound = async () => {
    if (!round) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lounge/admin/rounds/${round.id}/end`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to end round');
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'open': return '#f59e0b';
      case 'quiz': return '#ef4444';
      case 'live': return '#22c55e';
      case 'ended': return '#6b7280';
      default: return '#6b7280';
    }
  };

  return (
    <div className="admin-panel">
      <h1>Admin Panel</h1>

      {error && (
        <div className="admin-error" onClick={() => setError(null)}>
          {error}
          <span className="error-close">x</span>
        </div>
      )}

      {/* New Agent Token Display */}
      {newAgentToken && (
        <div className="token-display">
          <h3>New Agent Token Created</h3>
          <p>Save this token - it will not be shown again!</p>
          <code>{newAgentToken}</code>
          <button onClick={() => setNewAgentToken(null)}>Dismiss</button>
        </div>
      )}

      <div className="admin-grid">
        {/* Agents Section */}
        <section className="admin-section">
          <h2>Agents</h2>
          <div className="admin-form">
            <input
              type="text"
              placeholder="Agent display name"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAgent()}
            />
            <button onClick={createAgent} disabled={loading || !newAgentName.trim()}>
              Create Agent
            </button>
          </div>
          <div className="admin-list">
            {agents.length === 0 ? (
              <p className="empty">No agents registered</p>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className="admin-list-item">
                  <div className="item-info">
                    <span className="item-name">{agent.displayName}</span>
                    <span className="item-meta">{agent.status}</span>
                  </div>
                  <button className="danger small" onClick={() => deleteAgent(agent.id)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Round Section */}
        <section className="admin-section">
          <h2>Round Control</h2>
          {!round ? (
            <div className="round-empty">
              <p className="empty">No active round</p>
              <button onClick={createRound} disabled={loading}>
                Create New Round
              </button>
            </div>
          ) : (
            <div className="round-info">
              <div className="round-header">
                <span
                  className="round-state"
                  style={{ backgroundColor: getStateColor(round.state) }}
                >
                  {round.state.toUpperCase()}
                </span>
                <span className="round-id">ID: {round.id.slice(0, 8)}...</span>
              </div>

              <div className="round-config">
                <div className="config-item">
                  <span>Quiz Duration:</span>
                  <span>{round.config.quizDurationMs / 1000}s</span>
                </div>
                <div className="config-item">
                  <span>Live Duration:</span>
                  <span>{round.config.liveDurationMs / 60000}m</span>
                </div>
                <div className="config-item">
                  <span>Pass Threshold:</span>
                  <span>{round.config.passThreshold}%</span>
                </div>
                <div className="config-item">
                  <span>Questions:</span>
                  <span>{round.config.questionCount}</span>
                </div>
              </div>

              <div className="round-controls">
                {round.state === 'open' && (
                  <>
                    <button onClick={startQuiz} disabled={loading}>
                      Start Quiz Phase
                    </button>
                    <button className="danger" onClick={endRound} disabled={loading}>
                      Cancel Round
                    </button>
                  </>
                )}
                {round.state === 'quiz' && (
                  <>
                    <button onClick={startLive} disabled={loading}>
                      Start Live Phase
                    </button>
                    <button className="danger" onClick={endRound} disabled={loading}>
                      End Round
                    </button>
                  </>
                )}
                {round.state === 'live' && (
                  <button className="danger" onClick={endRound} disabled={loading}>
                    End Round
                  </button>
                )}
                {round.state === 'ended' && (
                  <button onClick={createRound} disabled={loading}>
                    Create New Round
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Leaderboard Section */}
        <section className="admin-section">
          <h2>Leaderboard</h2>
          <div className="admin-list">
            {leaderboard.length === 0 ? (
              <p className="empty">No submissions yet</p>
            ) : (
              leaderboard.map(entry => (
                <div key={entry.agentId} className={`admin-list-item ${entry.passed ? 'passed' : 'failed'}`}>
                  <div className="item-info">
                    <span className="rank">#{entry.rank}</span>
                    <span className="item-name">{entry.displayName}</span>
                    <span className="score">{entry.score}</span>
                    <span className="status-badge">{entry.passed ? '✓' : '✗'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminPanel;
