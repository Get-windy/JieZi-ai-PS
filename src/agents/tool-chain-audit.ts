/**
 * 工具链审计追踪（Tool Chain Audit Trail）
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  对标 Stripe / Shopify Harness 理念：完整的可观测性审计链                  ║
 * ║                                                                              ║
 * ║  追踪链路：prompt → toolcall → output → validation                          ║
 * ║                                                                              ║
 * ║  设计原则：                                                                  ║
 * ║  1. Append-Only JSONL：每条记录不可修改，支持流式写入和回放                 ║
 * ║  2. 完整 input/output 可回放：toolcall 的入参和出参均完整存档               ║
 * ║  3. 关联 runId/toolCallId：可按 run 维度查询完整工具调用链路               ║
 * ║  4. 验证结果记录：validation pass/fail 与错误上下文一并追踪                 ║
 * ║  5. 性能指标：每次工具调用的耗时均被记录                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * 文件路径：{STATE_DIR}/agent-audit/tool-chain-{YYYYMMDD}.jsonl
 * 每天自动滚动，防止单文件过大。
 */

import * as fs from "fs/promises";
import * as path from "path";
import { STATE_DIR } from "../../upstream/src/config/paths.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 工具链审计事件阶段 */
export type ToolChainPhase =
  | "tool_start"      // 工具开始执行
  | "tool_output"     // 工具输出（含原始 output）
  | "tool_error"      // 工具执行失败
  | "validation_pass" // 验证通过
  | "validation_fail" // 验证失败（含结构化错误上下文）
  | "retry_scheduled" // 安排重试
  | "retry_exhausted" // 重试耗尽
  | "deterministic_script_start"  // 确定性脚本开始
  | "deterministic_script_end";   // 确定性脚本结束

/** 单条工具链审计记录（不可变） */
export interface ToolChainAuditRecord {
  /** 记录 ID（格式：tca_{ts36}_{rand4}） */
  id: string;
  /** 事件发生时间（Unix ms） */
  timestamp: number;
  /** Agent 运行 ID */
  runId: string;
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 事件阶段 */
  phase: ToolChainPhase;
  /** 工具调用入参（tool_start 阶段） */
  args?: Record<string, unknown>;
  /** 工具调用出参原始值（tool_output/tool_error 阶段） */
  output?: unknown;
  /** 执行耗时（ms，tool_output/tool_error 阶段） */
  durationMs?: number;
  /** 是否为错误结果 */
  isError?: boolean;
  /** 验证器名称（validation_* 阶段） */
  validatorName?: string;
  /** 验证失败的结构化错误上下文（validation_fail 阶段） */
  validationError?: StructuredValidationError;
  /** 当前是第几次重试（retry_scheduled 阶段，从 1 开始） */
  retryAttempt?: number;
  /** 最大重试次数（retry_scheduled 阶段） */
  maxRetries?: number;
  /** 重试延迟（ms） */
  retryDelayMs?: number;
  /** 确定性脚本名称（deterministic_script_* 阶段） */
  scriptName?: string;
  /** 额外上下文（扩展字段） */
  meta?: Record<string, unknown>;
}

/** 结构化验证错误（对标 Stripe 错误反馈格式） */
export interface StructuredValidationError {
  /** 错误码（便于程序化识别） */
  code: string;
  /** 人类可读错误描述 */
  message: string;
  /** 期望的输出格式/值 */
  expected?: unknown;
  /** 实际收到的输出 */
  actual?: unknown;
  /** 失败的验收标准名称 */
  criterion?: string;
  /** 给 AI 重试的结构化提示（注入到下一轮上下文） */
  retryHint?: string;
  /** 额外细节 */
  details?: Record<string, unknown>;
}

// ============================================================================
// 存储路径
// ============================================================================

const AUDIT_DIR = path.join(STATE_DIR, "agent-audit");

function getAuditFilePath(): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path.join(AUDIT_DIR, `tool-chain-${yyyy}${mm}${dd}.jsonl`);
}

// ============================================================================
// 内部工具
// ============================================================================

function genAuditId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `tca_${ts}_${rand}`;
}

let _ensureDirPromise: Promise<void> | null = null;

async function ensureAuditDir(): Promise<void> {
  if (_ensureDirPromise) {return _ensureDirPromise;}
  _ensureDirPromise = fs.mkdir(AUDIT_DIR, { recursive: true }).then(() => undefined);
  return _ensureDirPromise;
}

// ============================================================================
// 核心写入 API
// ============================================================================

/**
 * 追加一条工具链审计记录（fire-and-forget，失败不阻断业务）。
 */
export async function appendToolChainRecord(
  record: Omit<ToolChainAuditRecord, "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  },
): Promise<void> {
  const full: ToolChainAuditRecord = {
    id: record.id ?? genAuditId(),
    timestamp: record.timestamp ?? Date.now(),
    ...record,
  };
  const line = JSON.stringify(full) + "\n";
  try {
    await ensureAuditDir();
    await fs.appendFile(getAuditFilePath(), line, { encoding: "utf-8" });
  } catch (err) {
    // 审计写入失败不影响业务
    console.warn("[ToolChainAudit] Failed to write record:", full.phase, full.toolName, err);
  }
}

// ============================================================================
// 便捷工厂方法
// ============================================================================

/**
 * 记录工具开始执行
 */
export function auditToolStart(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "tool_start",
    args: params.args,
    meta: params.meta,
  });
}

/**
 * 记录工具成功输出
 */
export function auditToolOutput(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "tool_output",
    output: params.output,
    durationMs: params.durationMs,
    isError: false,
    meta: params.meta,
  });
}

/**
 * 记录工具执行失败
 */
export function auditToolError(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "tool_error",
    output: params.output,
    durationMs: params.durationMs,
    isError: true,
    meta: params.meta,
  });
}

/**
 * 记录验证通过
 */
export function auditValidationPass(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  validatorName: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "validation_pass",
    validatorName: params.validatorName,
    meta: params.meta,
  });
}

/**
 * 记录验证失败（含结构化错误上下文）
 */
export function auditValidationFail(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  validatorName: string;
  validationError: StructuredValidationError;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "validation_fail",
    validatorName: params.validatorName,
    validationError: params.validationError,
    meta: params.meta,
  });
}

/**
 * 记录安排重试
 */
export function auditRetryScheduled(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  retryAttempt: number;
  maxRetries: number;
  retryDelayMs: number;
  validationError?: StructuredValidationError;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "retry_scheduled",
    retryAttempt: params.retryAttempt,
    maxRetries: params.maxRetries,
    retryDelayMs: params.retryDelayMs,
    validationError: params.validationError,
    meta: params.meta,
  });
}

/**
 * 记录重试耗尽
 */
export function auditRetryExhausted(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  maxRetries: number;
  lastError?: StructuredValidationError;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "retry_exhausted",
    maxRetries: params.maxRetries,
    validationError: params.lastError,
    meta: params.meta,
  });
}

/**
 * 记录确定性脚本执行开始
 */
export function auditDeterministicScriptStart(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  scriptName: string;
  args: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "deterministic_script_start",
    scriptName: params.scriptName,
    args: params.args,
    meta: params.meta,
  });
}

/**
 * 记录确定性脚本执行结束
 */
export function auditDeterministicScriptEnd(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  scriptName: string;
  output: unknown;
  durationMs: number;
  isError: boolean;
  meta?: Record<string, unknown>;
}): Promise<void> {
  return appendToolChainRecord({
    runId: params.runId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    phase: "deterministic_script_end",
    scriptName: params.scriptName,
    output: params.output,
    durationMs: params.durationMs,
    isError: params.isError,
    meta: params.meta,
  });
}

// ============================================================================
// 查询 / 回放 API
// ============================================================================

/**
 * 读取某个 runId 的完整工具调用链路（按时间升序，支持回放）。
 *
 * @param runId - Agent 运行 ID
 * @param date  - 指定日期（默认今天），格式 YYYYMMDD
 */
export async function getToolChainTrace(
  runId: string,
  date?: string,
): Promise<ToolChainAuditRecord[]> {
  const filePath = date
    ? path.join(AUDIT_DIR, `tool-chain-${date}.jsonl`)
    : getAuditFilePath();

  try {
    const content = await fs.readFile(filePath, { encoding: "utf-8" });
    const records: ToolChainAuditRecord[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}
      try {
        const rec = JSON.parse(trimmed) as ToolChainAuditRecord;
        if (rec.runId === runId) {
          records.push(rec);
        }
      } catch {
        // 跳过损坏行
      }
    }
    records.sort((a, b) => a.timestamp - b.timestamp);
    return records;
  } catch {
    return [];
  }
}

/**
 * 读取某次具体工具调用的完整链路（toolCallId 维度）。
 *
 * @param toolCallId - 工具调用 ID
 * @param date       - 指定日期，格式 YYYYMMDD
 */
export async function getToolCallTrace(
  toolCallId: string,
  date?: string,
): Promise<ToolChainAuditRecord[]> {
  const filePath = date
    ? path.join(AUDIT_DIR, `tool-chain-${date}.jsonl`)
    : getAuditFilePath();

  try {
    const content = await fs.readFile(filePath, { encoding: "utf-8" });
    const records: ToolChainAuditRecord[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}
      try {
        const rec = JSON.parse(trimmed) as ToolChainAuditRecord;
        if (rec.toolCallId === toolCallId) {
          records.push(rec);
        }
      } catch {
        // 跳过损坏行
      }
    }
    records.sort((a, b) => a.timestamp - b.timestamp);
    return records;
  } catch {
    return [];
  }
}

/**
 * 获取审计文件列表（用于跨天查询）
 */
export async function listAuditFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(AUDIT_DIR);
    return entries
      .filter((f) => f.startsWith("tool-chain-") && f.endsWith(".jsonl"))
      .toSorted()
      .map((f) => path.join(AUDIT_DIR, f));
  } catch {
    return [];
  }
}
