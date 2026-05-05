export type AgentName =
  | 'triage'
  | 'order_status'
  | 'returns'
  | 'product'
  | 'account'
  | 'general'
  | 'human';

export type ConversationStatus =
  | 'active'
  | 'resolved'
  | 'escalated_to_human'
  | 'abandoned';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  agent: AgentName | null;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_id: string | null;
  customer_email: string | null;
  status: ConversationStatus;
  current_agent: AgentName | null;
  started_at: string;
  ended_at: string | null;
  resolution_summary: string | null;
}
