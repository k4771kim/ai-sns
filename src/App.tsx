import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

interface Message {
  id: string;
  type: string;
  from?: string;
  to?: string;
  room?: string;
  content?: string;
  agentId?: string;
  members?: string[];
  message?: string; // For error messages
  timestamp: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

function App() {
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<Set<string>>(new Set());
  const [roomInput, setRoomInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [targetRoom, setTargetRoom] = useState('');
  const [targetAgent, setTargetAgent] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID() }]);
  }, []);

  const connect = useCallback(() => {
    if (!agentId.trim()) return;

    setStatus('connecting');
    const ws = new WebSocket(`ws://localhost:8787?agentId=${encodeURIComponent(agentId)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        addMessage(msg);

        // Update rooms state based on events
        if (msg.type === 'joined' && msg.room) {
          setRooms(prev => new Set([...prev, msg.room]));
          setTargetRoom(msg.room);
        } else if (msg.type === 'left' && msg.room) {
          setRooms(prev => {
            const next = new Set(prev);
            next.delete(msg.room);
            return next;
          });
          setTargetRoom('');
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      setRooms(new Set());
      wsRef.current = null;
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('disconnected');
    };
  }, [agentId, addMessage]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
    setRooms(new Set());
  }, []);

  const joinRoom = useCallback(() => {
    if (!roomInput.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'join', room: roomInput }));
    setRoomInput('');
  }, [roomInput]);

  const leaveRoom = useCallback((room: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'leave', room }));
  }, []);

  const sendMessage = useCallback(() => {
    if (!messageInput.trim() || !wsRef.current) return;

    const msg: Record<string, string> = {
      type: 'message',
      content: messageInput,
    };

    if (targetAgent.trim()) {
      msg.to = targetAgent;
    } else if (targetRoom) {
      msg.room = targetRoom;
    } else {
      alert('Select a room or enter an agent ID to send to');
      return;
    }

    wsRef.current.send(JSON.stringify(msg));

    // Add our own message to the list
    addMessage({
      type: 'message',
      from: agentId,
      to: msg.to,
      room: msg.room,
      content: messageInput,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
    });

    setMessageInput('');
  }, [messageInput, targetRoom, targetAgent, agentId, addMessage]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  const getMessageClass = (msg: Message) => {
    switch (msg.type) {
      case 'message':
        return msg.from === agentId ? 'message-self' : 'message-other';
      case 'agent_joined':
      case 'agent_left':
        return 'message-system';
      case 'connected':
      case 'joined':
      case 'left':
        return 'message-info';
      case 'error':
        return 'message-error';
      default:
        return 'message-info';
    }
  };

  const formatMessage = (msg: Message) => {
    switch (msg.type) {
      case 'connected':
        return `Connected as ${msg.agentId}`;
      case 'joined':
        return `Joined room "${msg.room}" (members: ${msg.members?.join(', ')})`;
      case 'left':
        return `Left room "${msg.room}"`;
      case 'agent_joined':
        return `${msg.agentId} joined "${msg.room}"`;
      case 'agent_left':
        return `${msg.agentId} left "${msg.room}"`;
      case 'message':
        const target = msg.to ? `-> ${msg.to}` : msg.room ? `[${msg.room}]` : '';
        return `${msg.from} ${target}: ${msg.content}`;
      case 'error':
        return `Error: ${msg.message || 'Unknown error'}`;
      case 'pong':
        return 'Pong received';
      default:
        return JSON.stringify(msg);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>SNS-AI Agent Hub</h1>
        <div className={`status status-${status}`}>
          {status === 'connected' && <span className="status-dot"></span>}
          {status}
        </div>
      </header>

      <main className="main">
        <aside className="sidebar">
          <section className="section">
            <h2>Connection</h2>
            {status === 'disconnected' ? (
              <div className="connect-form">
                <input
                  type="text"
                  placeholder="Agent ID"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && connect()}
                />
                <button onClick={connect} disabled={!agentId.trim()}>
                  Connect
                </button>
              </div>
            ) : (
              <div className="connect-form">
                <span className="agent-name">{agentId}</span>
                <button className="danger" onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            )}
          </section>

          <section className="section">
            <h2>Rooms</h2>
            {status === 'connected' && (
              <div className="room-form">
                <input
                  type="text"
                  placeholder="Room name"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                />
                <button onClick={joinRoom} disabled={!roomInput.trim()}>
                  Join
                </button>
              </div>
            )}
            <div className="room-list">
              {rooms.size === 0 ? (
                <p className="empty">No rooms joined</p>
              ) : (
                Array.from(rooms).map(room => (
                  <div
                    key={room}
                    className={`room-item ${targetRoom === room ? 'active' : ''}`}
                    onClick={() => { setTargetRoom(room); setTargetAgent(''); }}
                  >
                    <span># {room}</span>
                    <button className="secondary small" onClick={(e) => { e.stopPropagation(); leaveRoom(room); }}>
                      Leave
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="section">
            <h2>Direct Message</h2>
            <input
              type="text"
              placeholder="Target Agent ID"
              value={targetAgent}
              onChange={(e) => { setTargetAgent(e.target.value); setTargetRoom(''); }}
              disabled={status !== 'connected'}
            />
          </section>
        </aside>

        <div className="chat-area">
          <div className="messages">
            {messages.length === 0 ? (
              <p className="empty">No messages yet. Connect and join a room to start.</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`message ${getMessageClass(msg)}`}>
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                  <span className="message-content">{formatMessage(msg)}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="message-form">
            <input
              type="text"
              placeholder={targetAgent ? `Message to ${targetAgent}...` : targetRoom ? `Message to #${targetRoom}...` : 'Select a room or agent...'}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              disabled={status !== 'connected' || (!targetRoom && !targetAgent)}
            />
            <button
              onClick={sendMessage}
              disabled={status !== 'connected' || !messageInput.trim() || (!targetRoom && !targetAgent)}
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
