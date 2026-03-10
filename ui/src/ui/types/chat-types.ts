/**
 * Chat message types for the UI layer.
 */

/** Union type for items in the chat thread */
export type ChatItem =
  | { kind: "message"; key: string; message: unknown }
  | { kind: "divider"; key: string; label: string; timestamp: number }
  | { kind: "stream"; key: string; text: string; startedAt: number }
  | { kind: "reading-indicator"; key: string };

/** A group of consecutive messages from the same role (Slack-style layout) */
export type MessageGroup = {
  kind: "group";
  key: string;
  role: string;
  messages: Array<{ message: unknown; key: string }>;
  timestamp: number;
  isStreaming: boolean;
  /** OpenClaw group chat sender ID (from __group_sender_id field) */
  groupSenderId?: string;
  /** OpenClaw group chat sender display name (from __group_sender_name field) */
  groupSenderName?: string;
};

/** Content item types in a normalized message */
export type MessageContentItem = {
  type: "text" | "tool_call" | "tool_result";
  text?: string;
  name?: string;
  args?: unknown;
};

/** Agent-to-agent communication metadata, parsed from [TYPE from agentId] prefix */
export type AgentCommMeta = {
  /** Message type: command | request | query | notification */
  type: "command" | "request" | "query" | "notification";
  /** Sender agent ID */
  senderId: string;
  /** Actual message body (prefix stripped) */
  body: string;
};

/** Normalized message structure for rendering */
export type NormalizedMessage = {
  role: string;
  content: MessageContentItem[];
  timestamp: number;
  id?: string;
  /** Present when this is an inter-agent communication message */
  agentComm?: AgentCommMeta;
};

/** Tool card representation for tool calls and results */
export type ToolCard = {
  kind: "call" | "result";
  name: string;
  args?: unknown;
  text?: string;
};
