/**
 * Branded Types - TypeScript类型安全增强
 * 
 * 业界最佳实践（TypeScript-First 2026）：
 * - 防止不同类型的ID混淆
 * - 编译时类型检查
 * - 零运行时开销
 */

// ============ Branded Type 基础工具 ============

/**
 * 创建Branded Type
 * 
 * 使用示例：
 * ```typescript
 * type TaskId = string & { readonly __brand: unique symbol };
 * type AgentId = string & { readonly __brand: unique symbol };
 * 
 * // 编译错误：不能混用
 * function processTask(taskId: TaskId, agentId: AgentId) { }
 * processTask("task-123" as TaskId, "task-123" as AgentId); // ❌ 错误
 * ```
 */
declare const brand: unique symbol;

export type Brand<T, TBrand> = T & { readonly [brand]: TBrand };

// ============ ID类型定义 ============

/** Agent ID */
export type AgentId = Brand<string, 'AgentId'>;

/** Task ID */
export type TaskId = Brand<string, 'TaskId'>;

/** Project ID */
export type ProjectId = Brand<string, 'ProjectId'>;

/** User ID */
export type UserId = Brand<string, 'UserId'>;

/** Session ID */
export type SessionId = Brand<string, 'SessionId'>;

/** Group ID */
export type GroupId = Brand<string, 'GroupId'>;

/** File Path */
export type FilePath = Brand<string, 'FilePath'>;

/** URL */
export type Url = Brand<string, 'Url'>;

/** Email */
export type Email = Brand<string, 'Email'>;

// ============ 转换函数 ============

/**
 * 将string转换为AgentId
 */
export function toAgentId(value: string): AgentId {
  return value as AgentId;
}

/**
 * 将string转换为TaskId
 */
export function toTaskId(value: string): TaskId {
  return value as TaskId;
}

/**
 * 将string转换为ProjectId
 */
export function toProjectId(value: string): ProjectId {
  return value as ProjectId;
}

/**
 * 将string转换为UserId
 */
export function toUserId(value: string): UserId {
  return value as UserId;
}

/**
 * 将string转换为SessionId
 */
export function toSessionId(value: string): SessionId {
  return value as SessionId;
}

/**
 * 将string转换为GroupId
 */
export function toGroupId(value: string): GroupId {
  return value as GroupId;
}

/**
 * 将string转换为FilePath
 */
export function toFilePath(value: string): FilePath {
  return value as FilePath;
}

/**
 * 将string转换为Url
 */
export function toUrl(value: string): Url {
  if (!isValidUrl(value)) {
    throw new Error(`Invalid URL: ${value}`);
  }
  return value as Url;
}

/**
 * 将string转换为Email
 */
export function toEmail(value: string): Email {
  if (!isValidEmail(value)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value as Email;
}

// ============ 验证函数 ============

/**
 * 验证是否为有效的URL
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证是否为有效的Email
 */
function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

// ============ 工具函数 ============

/**
 * 从Branded Type获取原始值
 */
export function unbrand<T>(value: Brand<T, any>): T {
  return value as T;
}

/**
 * 类型守卫：检查是否为AgentId
 */
export function isAgentId(value: string): value is AgentId {
  return value.startsWith('agent-') || value.length > 0;
}

/**
 * 类型守卫：检查是否为TaskId
 */
export function isTaskId(value: string): value is TaskId {
  return value.startsWith('task-') || value.length > 0;
}

/**
 * 类型守卫：检查是否为ProjectId
 */
export function isProjectId(value: string): value is ProjectId {
  return value.startsWith('project-') || value.length > 0;
}

// ============ 使用示例 ============

/*
// ✅ 正确使用示例

function processTask(taskId: TaskId, agentId: AgentId) {
  console.log(`Processing task ${taskId} by agent ${agentId}`);
}

const taskId = toTaskId('task-123');
const agentId = toAgentId('agent-456');

// 编译通过
processTask(taskId, agentId);

// ❌ 编译错误（如果尝试混用）
// processTask(agentId, taskId); // Error: Argument of type 'AgentId' is not assignable to parameter of type 'TaskId'

// ✅ 在API响应中使用
interface TaskResponse {
  id: TaskId;
  title: string;
  assigneeId: AgentId;
}

// ✅ 在数据库模型中使用
interface TaskModel {
  id: TaskId;
  projectId: ProjectId;
  createdBy: UserId;
  createdAt: Date;
}
*/
