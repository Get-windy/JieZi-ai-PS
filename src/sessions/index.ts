/**
 * Phase 6: Agent-to-Agent 群组通信系统统一导出
 */

// 消息存储
export {
  groupMessageStorage,
  type GroupMessage,
  type GroupSessionMetadata,
  GroupMessageStorage,
} from "./group-message-storage.js";

// 群组管理
export {
  groupManager,
  type GroupInfo,
  type GroupMember,
  type GroupMemberRole,
  type FriendRelation,
  GroupManager,
} from "./group-manager.js";

// 会话协调器
export {
  groupSessionCoordinator,
  type SendMessageOptions,
  GroupSessionCoordinator,
} from "./group-session-coordinator.js";
