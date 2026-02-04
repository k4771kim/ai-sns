// =============================================================================
// Message Store Interface
// =============================================================================
// Abstraction layer for message persistence
// Implementations: in-memory (dev), SQLite (prod MVP), PostgreSQL (scale)

export interface PaginationOptions {
  limit?: number;
  before?: string;  // message ID for cursor pagination
  after?: string;
}

// =============================================================================
// Message Types
// =============================================================================

export interface BaseMessage {
  id: string;
  content: string;
  from: string;           // agentId or 'system'
  timestamp: number;
}

export interface RoomMessage extends BaseMessage {
  roomId: string;
  roundId?: string;       // For Quiz Lounge messages
}

export interface DirectMessage extends BaseMessage {
  conversationId: string;
  to: string;             // recipient agentId
  read: boolean;
}

// =============================================================================
// Conversation Type
// =============================================================================

export interface Conversation {
  id: string;
  participants: [string, string];  // Two agentIds
  createdAt: number;
  lastMessageAt: number;
  lastMessagePreview?: string;
  unreadCount?: number;
}

// =============================================================================
// Message Store Interface
// =============================================================================

export interface MessageStore {
  // Room messages (Agent Hub, Quiz Lounge)
  saveRoomMessage(msg: RoomMessage): Promise<void>;
  getRoomMessages(roomId: string, options?: PaginationOptions): Promise<RoomMessage[]>;
  getRoomMessagesByRound(roundId: string, options?: PaginationOptions): Promise<RoomMessage[]>;

  // Direct messages
  saveDM(msg: DirectMessage): Promise<void>;
  getDMs(conversationId: string, options?: PaginationOptions): Promise<DirectMessage[]>;
  markAsRead(conversationId: string, agentId: string): Promise<number>;  // returns count updated
  getUnreadCount(agentId: string): Promise<number>;

  // Conversations
  getOrCreateConversation(agent1: string, agent2: string): Promise<Conversation>;
  getConversations(agentId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

// =============================================================================
// In-Memory Implementation (Development)
// =============================================================================

export class InMemoryMessageStore implements MessageStore {
  private roomMessages: Map<string, RoomMessage[]> = new Map();
  private directMessages: Map<string, DirectMessage[]> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private roundMessages: Map<string, RoomMessage[]> = new Map();

  async initialize(): Promise<void> {
    // No-op for in-memory
  }

  async close(): Promise<void> {
    this.roomMessages.clear();
    this.directMessages.clear();
    this.conversations.clear();
    this.roundMessages.clear();
  }

  // Room Messages
  async saveRoomMessage(msg: RoomMessage): Promise<void> {
    const roomMsgs = this.roomMessages.get(msg.roomId) || [];
    roomMsgs.push(msg);
    this.roomMessages.set(msg.roomId, roomMsgs);

    if (msg.roundId) {
      const roundMsgs = this.roundMessages.get(msg.roundId) || [];
      roundMsgs.push(msg);
      this.roundMessages.set(msg.roundId, roundMsgs);
    }
  }

  async getRoomMessages(roomId: string, options?: PaginationOptions): Promise<RoomMessage[]> {
    const msgs = this.roomMessages.get(roomId) || [];
    return this.paginate(msgs, options);
  }

  async getRoomMessagesByRound(roundId: string, options?: PaginationOptions): Promise<RoomMessage[]> {
    const msgs = this.roundMessages.get(roundId) || [];
    return this.paginate(msgs, options);
  }

  // Direct Messages
  async saveDM(msg: DirectMessage): Promise<void> {
    const convMsgs = this.directMessages.get(msg.conversationId) || [];
    convMsgs.push(msg);
    this.directMessages.set(msg.conversationId, convMsgs);

    // Update conversation
    const conv = this.conversations.get(msg.conversationId);
    if (conv) {
      conv.lastMessageAt = msg.timestamp;
      conv.lastMessagePreview = msg.content.slice(0, 50);
    }
  }

  async getDMs(conversationId: string, options?: PaginationOptions): Promise<DirectMessage[]> {
    const msgs = this.directMessages.get(conversationId) || [];
    return this.paginate(msgs, options);
  }

  async markAsRead(conversationId: string, agentId: string): Promise<number> {
    const msgs = this.directMessages.get(conversationId) || [];
    let count = 0;
    for (const msg of msgs) {
      if (msg.to === agentId && !msg.read) {
        msg.read = true;
        count++;
      }
    }
    return count;
  }

  async getUnreadCount(agentId: string): Promise<number> {
    let count = 0;
    for (const msgs of this.directMessages.values()) {
      for (const msg of msgs) {
        if (msg.to === agentId && !msg.read) {
          count++;
        }
      }
    }
    return count;
  }

  // Conversations
  async getOrCreateConversation(agent1: string, agent2: string): Promise<Conversation> {
    // Sort IDs for consistent lookup
    const [a, b] = [agent1, agent2].sort();

    let conv = Array.from(this.conversations.values())
      .find(c => c.participants.includes(agent1) && c.participants.includes(agent2));

    if (!conv) {
      conv = {
        id: crypto.randomUUID(),
        participants: [a, b] as [string, string],
        createdAt: Date.now(),
        lastMessageAt: Date.now(),
      };
      this.conversations.set(conv.id, conv);
    }

    return conv;
  }

  async getConversations(agentId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter(c => c.participants.includes(agentId))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) || null;
  }

  // Pagination helper
  private paginate<T extends { id: string; timestamp: number }>(
    items: T[],
    options?: PaginationOptions
  ): T[] {
    let result = [...items];
    const limit = options?.limit || 100;

    if (options?.before) {
      const idx = result.findIndex(m => m.id === options.before);
      if (idx > 0) {
        result = result.slice(0, idx);
      }
    }

    if (options?.after) {
      const idx = result.findIndex(m => m.id === options.after);
      if (idx >= 0) {
        result = result.slice(idx + 1);
      }
    }

    // Return last N messages (most recent)
    return result.slice(-limit);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let messageStore: MessageStore | null = null;

export function getMessageStore(): MessageStore {
  if (!messageStore) {
    // Default to in-memory for now
    // TODO: Switch based on DATABASE_URL env var
    messageStore = new InMemoryMessageStore();
  }
  return messageStore;
}

export function setMessageStore(store: MessageStore): void {
  messageStore = store;
}
