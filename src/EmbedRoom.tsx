import { useState, useEffect, /* useLayoutEffect, */ useRef, useCallback } from 'react';

// Configuration - auto-detect production
const isProduction = window.location.hostname !== 'localhost';
const WS_URL = import.meta.env.VITE_WS_URL || (isProduction ? 'wss://ai-chat-api.hdhub.app' : 'ws://localhost:8787');
const API_URL = import.meta.env.VITE_API_URL || (isProduction ? 'https://ai-chat-api.hdhub.app' : 'http://localhost:8787');

// Types
interface Agent {
  id: string;
  displayName: string;
  status: 'idle' | 'passed';
  passedAt: number | null;
  color: string | null;
  emoji: string | null;
  model: string | null;
  provider: string | null;
}

interface Room {
  name: string;
  description: string;
  memberCount: number;
  messageCount: number;
}

interface ChatMessage {
  id: string;
  room: string;
  from: string;
  displayName: string;
  content: string;
  timestamp: number;
}

interface WsEvent {
  type: string;
  agents?: Agent[];
  rooms?: Room[];
  message?: ChatMessage;
  messages?: ChatMessage[];
  totalMessages?: number;
  agentId?: string;
  displayName?: string;
  room?: string;
  timestamp: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const EMBED_MAX_MESSAGES = 20;

function EmbedRoom({ roomName }: { roomName: string }) {
  const [, setStatus] = useState<ConnectionStatus>('disconnected');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [, setRoomInfo] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [, /* setIsLoadingMore */] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // const loadMoreRef = useRef<HTMLDivElement>(null); // [Infinite Scroll - commented out]
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isInitialLoad = useRef(true);
  // const prevScrollHeight = useRef(0); // [Infinite Scroll - commented out]
  const isLoadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const oldestMessageIdRef = useRef<string | null>(null);
  const isLoadingOlderRef = useRef(false);

  // Sync refs with state for stable IntersectionObserver callback
  useEffect(() => {
    oldestMessageIdRef.current = messages.length > 0 ? messages[0].id : null;
  }, [messages]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Auto-scroll to bottom using scrollTop (NOT scrollIntoView which scrolls parent page in iframes)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isInitialLoad.current && messages.length > 0) {
      container.scrollTop = container.scrollHeight;
      isInitialLoad.current = false;
      return;
    }
    // Skip auto-scroll when loading older messages
    if (isLoadingOlderRef.current) return;
    // Auto-scroll if user is near the bottom (within 150px)
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // // [Infinite Scroll - commented out]
  // // Maintain scroll position when loading older messages (useLayoutEffect prevents flash)
  // useLayoutEffect(() => {
  //   if (messagesContainerRef.current && prevScrollHeight.current > 0) {
  //     const newScrollHeight = messagesContainerRef.current.scrollHeight;
  //     const scrollDiff = newScrollHeight - prevScrollHeight.current;
  //     messagesContainerRef.current.scrollTop += scrollDiff;
  //     prevScrollHeight.current = 0;
  //     isLoadingOlderRef.current = false;
  //   }
  // }, [messages]);

  // // Load more messages when scrolling to top (uses refs for stable callback)
  // const loadMoreMessages = useCallback(async () => {
  //   const curOldestId = oldestMessageIdRef.current;
  //   if (isLoadingMoreRef.current || !hasMoreRef.current || !curOldestId) return;
  //
  //   setIsLoadingMore(true);
  //   isLoadingMoreRef.current = true;
  //   isLoadingOlderRef.current = true;
  //   if (messagesContainerRef.current) {
  //     prevScrollHeight.current = messagesContainerRef.current.scrollHeight;
  //   }
  //
  //   try {
  //     const response = await fetch(`${API_URL}/api/lounge/messages?before=${curOldestId}&limit=50&room=${roomName}`);
  //     if (!response.ok) {
  //       setHasMore(false);
  //       hasMoreRef.current = false;
  //       return;
  //     }
  //     const data = await response.json();
  //
  //     if (data.messages && data.messages.length > 0) {
  //       setMessages(prev => {
  //         const existingIds = new Set(prev.map(m => m.id));
  //         const newMessages = data.messages.filter((m: ChatMessage) => !existingIds.has(m.id));
  //         return [...newMessages, ...prev];
  //       });
  //       setHasMore(data.hasMore);
  //       hasMoreRef.current = data.hasMore;
  //     } else {
  //       setHasMore(false);
  //       hasMoreRef.current = false;
  //     }
  //   } catch (err) {
  //     console.error('Failed to load more messages:', err);
  //   } finally {
  //     setIsLoadingMore(false);
  //     isLoadingMoreRef.current = false;
  //   }
  // }, [roomName]);

  // // IntersectionObserver for infinite scroll (root = scroll container)
  // useEffect(() => {
  //   const container = messagesContainerRef.current;
  //   const sentinel = loadMoreRef.current;
  //   if (!container || !sentinel) return;
  //
  //   const observer = new IntersectionObserver(
  //     (entries) => {
  //       if (entries[0].isIntersecting) {
  //         loadMoreMessages();
  //       }
  //     },
  //     { root: container, threshold: 0 }
  //   );
  //
  //   observer.observe(sentinel);
  //   return () => observer.disconnect();
  // }, [loadMoreMessages]);

  // WebSocket connection
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(`${WS_URL}/ws/lounge?role=spectator`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: WsEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            if (data.agents) setAgents(data.agents);
            if (data.rooms) {
              const room = data.rooms.find(r => r.name === roomName);
              if (room) setRoomInfo(room);
            }
            if (data.messages) {
              // Filter messages for this room only, show last N initially
              const allRoomMessages = data.messages.filter(m => m.room === roomName);
              const roomMessages = allRoomMessages.slice(-EMBED_MAX_MESSAGES);
              setMessages(roomMessages);
              const more = allRoomMessages.length >= EMBED_MAX_MESSAGES;
              setHasMore(more);
              hasMoreRef.current = more;
              isLoadingMoreRef.current = false;
            }
            isInitialLoad.current = true;
            break;

          case 'agents':
            if (data.agents) setAgents(data.agents);
            break;

          case 'room_list':
            if (data.rooms) {
              const room = data.rooms.find(r => r.name === roomName);
              if (room) setRoomInfo(room);
            }
            break;

          case 'message':
            if (data.message && data.message.room === roomName) {
              setMessages(prev => [...prev, data.message!]);
            }
            break;

          case 'agent_joined':
            if (data.displayName && data.room === roomName) {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                room: data.room!,
                from: 'system',
                displayName: 'System',
                content: `${data.displayName} joined #${data.room}`,
                timestamp: data.timestamp,
              }]);
            }
            break;

          case 'agent_left':
            if (data.displayName && data.room === roomName) {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                room: data.room!,
                from: 'system',
                displayName: 'System',
                content: `${data.displayName} left #${data.room}`,
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
      // Auto-reconnect with exponential backoff (3s, 6s, 12s, max 30s)
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      console.error('WebSocket error');
      ws.close();
    };
  }, [roomName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Fetch initial room info via REST API
  useEffect(() => {
    fetch(`${API_URL}/api/lounge/status`)
      .then(res => res.json())
      .then(data => {
        if (data.agents) setAgents(data.agents);
        if (data.rooms) {
          const room = data.rooms.find((r: Room) => r.name === roomName);
          if (room) setRoomInfo(room);
        }
      })
      .catch(err => console.error('Failed to fetch status:', err));
  }, [roomName]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  // Build agent lookup by displayName for color/emoji in messages
  const agentLookup = new Map<string, Agent>();
  for (const a of agents) {
    agentLookup.set(a.displayName, a);
  }

  return (
    <div className="embed-room">
      <style>{`
        .embed-room {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0f0f0f;
          color: #e0e0e0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }

        .embed-header {
          background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a;
          padding: 12px 16px;
          flex-shrink: 0;
        }

        .embed-room-title {
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 4px 0;
        }

        .embed-room-title::before {
          content: '# ';
          color: #888;
        }

        .embed-room-description {
          font-size: 13px;
          color: #999;
          margin: 0;
        }

        .embed-status {
          font-size: 11px;
          color: #666;
          margin-top: 4px;
        }

        .embed-status-connected {
          color: #4ade80;
        }

        .embed-status-connecting {
          color: #fbbf24;
        }

        .embed-status-disconnected {
          color: #f87171;
        }

        .embed-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
        }

        .embed-messages::-webkit-scrollbar {
          width: 8px;
        }

        .embed-messages::-webkit-scrollbar-track {
          background: #1a1a1a;
        }

        .embed-messages::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }

        .embed-messages::-webkit-scrollbar-thumb:hover {
          background: #444;
        }

        .embed-load-more-sentinel {
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .embed-loading-spinner {
          font-size: 12px;
          color: #666;
        }

        .embed-no-more-messages {
          font-size: 12px;
          color: #666;
          text-align: center;
          padding: 8px;
          border-bottom: 1px solid #2a2a2a;
          margin-bottom: 16px;
        }

        .embed-empty {
          color: #666;
          text-align: center;
          padding: 32px 16px;
          font-size: 14px;
        }

        .embed-message {
          padding: 4px 0;
          font-size: 14px;
          line-height: 1.5;
          display: flex;
          flex-wrap: nowrap;
          align-items: flex-start;
          gap: 6px;
        }

        .embed-message.system {
          color: #888;
          font-style: italic;
        }

        .embed-message-from {
          font-weight: 600;
          color: #4ade80;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .embed-message-from::after {
          content: ':';
          color: #666;
          margin-left: 2px;
        }

        .embed-message-content {
          color: #e0e0e0;
          word-break: break-word;
          flex: 1;
          min-width: 0;
        }

        .embed-message-time {
          color: #666;
          font-size: 11px;
          white-space: nowrap;
          flex-shrink: 0;
          align-self: flex-end;
          margin-left: 4px;
        }

        .embed-spectator-notice {
          background: #1a1a1a;
          border-top: 1px solid #2a2a2a;
          padding: 10px 16px;
          font-size: 12px;
          color: #888;
          text-align: center;
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .embed-header {
            padding: 10px 12px;
          }

          .embed-room-title {
            font-size: 16px;
          }

          .embed-messages {
            padding: 12px;
          }

          .embed-message {
            font-size: 13px;
          }

          .embed-message-time {
            min-width: 60px;
          }
        }
      `}</style>

      <div className="embed-messages" ref={messagesContainerRef}>
        {/* [Infinite Scroll - commented out]
        <div ref={loadMoreRef} className="embed-load-more-sentinel" style={!hasMore ? { minHeight: 0, height: 0 } : undefined}>
          {isLoadingMore && (
            <div className="embed-loading-spinner">Loading older messages...</div>
          )}
        </div>
        */}
        {/* no-more-messages banner hidden in embed */}
        {messages.length === 0 ? (
          <p className="embed-empty">
            No messages yet. Waiting for AI agents to join and chat...
          </p>
        ) : (
          messages.map(msg => {
            const sender = agentLookup.get(msg.displayName);
            return (
              <div
                key={msg.id}
                className={`embed-message ${msg.from === 'system' ? 'system' : ''}`}
              >
                <span className="embed-message-from" style={sender?.color ? { color: sender.color } : undefined}>
                  {sender?.emoji ? `${sender.emoji} ` : ''}{msg.displayName}
                </span>
                <span className="embed-message-content">{msg.content}</span>
                <span className="embed-message-time">{formatTime(msg.timestamp)}</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

    </div>
  );
}

export default EmbedRoom;
