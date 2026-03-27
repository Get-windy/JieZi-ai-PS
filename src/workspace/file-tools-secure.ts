/**
 * Phase 5: 工作空间与文档系统 - 文件工具安全拦截
 *
 * 职责:
 * 1. 拦截文件读写操作
 * 2. 应用工作空间访问控制
 * 3. 提供安全的文件操作接口
 * 4. 记录文件访问日志
 * 5. Phase 3: 集成权限检查系统
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { PermissionCheckContext } from "../permissions/checker.js";
import { permissionIntegrator } from "../permissions/integration.js";
import { SessionType, WorkspaceResolution } from "./types.js";
import { workspaceAccessControl } from "./workspace-access-control.js";

// ============================================================================
// 记忆文件分级保护策略
//
// 业界参考：OpenClaw / Manus / Claude Code 均采用「主文件精简 + 归档目录」双层架构
// 核心原则：注入频率决定大小上限——每条消息都注入的文件必须极度精简
//
// 分级策略：
//   身份层 SOUL / IDENTITY  每条消息注入  上限 ~1 KB  几乎不变，超限裁剪+警告
//   行为层 USER / AGENTS    每条消息注入  上限 ~2 KB  偶尔更新，超限裁剪
//   记忆层 MEMORY           每条消息注入  上限 ~10 KB 频繁更新 → 归档转移（零丢失）
//   共享层 SHARED_MEMORY    多 Agent 写入 上限 ~15 KB 高频写入 → 归档转移（零丢失）
//
// 关键区别：
//   MEMORY.md / SHARED_MEMORY.md 超限时不裁剪丢弃，而是将旧内容归档到
//   memory/YYYY-MM-DD-archive.md，主文件保留归档索引 + 最新内容，零信息丢失
//   SOUL / IDENTITY / USER / AGENTS 超限时裁剪（这些文件不应日积月累增长）
// ============================================================================

/**
 * 记忆文件分级配置
 * maxChars:   写入上限（字符数）
 * headRatio:  保留头部比例（核心知识/较旧内容，仅裁剪模式使用）
 * tailRatio:  保留尾部比例（最新追加内容，仅裁剪模式使用）
 * archivable: true = 超限时归档转移（零丢失），false = 超限时裁剪
 */
interface MemoryFileConfig {
  pattern: RegExp;
  maxChars: number;
  headRatio: number;
  tailRatio: number;
  /** true = MEMORY/SHARED_MEMORY 类，超限归档转移；false = 身份/行为层，超限裁剪 */
  archivable: boolean;
  description: string;
}

const MEMORY_FILE_CONFIGS: MemoryFileConfig[] = [
  // ── 身份层：每条消息注入，必须极度精简，超限直接裁剪并警告 ──
  {
    pattern: /^soul\.md$/i,
    maxChars: 1_000,
    headRatio: 0.8,
    tailRatio: 0.1,
    archivable: false,
    description: "SOUL.md（身份/人格核心）",
  },
  {
    pattern: /^identity\.md$/i,
    maxChars: 1_000,
    headRatio: 0.8,
    tailRatio: 0.1,
    archivable: false,
    description: "IDENTITY.md（Agent 身份信息）",
  },
  // ── 行为层：每条消息注入，偶尔更新，超限裁剪 ──
  {
    pattern: /^user\.md$/i,
    maxChars: 2_000,
    headRatio: 0.75,
    tailRatio: 0.15,
    archivable: false,
    description: "USER.md（用户画像/偏好）",
  },
  {
    pattern: /^agents\.md$/i,
    maxChars: 2_000,
    headRatio: 0.75,
    tailRatio: 0.15,
    archivable: false,
    description: "AGENTS.md（行为规则/工作流）",
  },
  // ── 记忆层：每条消息注入，Agent 频繁写入 → 归档转移，零丢失 ──
  {
    pattern: /^memory\.md$/i,
    maxChars: 10_000,
    headRatio: 0.7,
    tailRatio: 0.3,
    archivable: true,
    description: "MEMORY.md（个人长期记忆）",
  },
  // ── 共享层：多 Agent 高频写入 → 归档转移，零丢失 ──
  {
    pattern: /^shared_memory\.md$/i,
    maxChars: 15_000,
    headRatio: 0.65,
    tailRatio: 0.35,
    archivable: true,
    description: "SHARED_MEMORY.md（团队共享记忆）",
  },
];

/** 归档子目录名（相对于主文件所在目录） */
const MEMORY_ARCHIVE_SUBDIR = "memory";
/** 共享记忆的归档子目录名 */
const SHARED_MEMORY_ARCHIVE_SUBDIR = "shared_memory";
/** MEMORY.md 头部归档索引区的起止标记 */
const ARCHIVE_INDEX_START = "<!-- [ARCHIVE INDEX START] -->";
const ARCHIVE_INDEX_END = "<!-- [ARCHIVE INDEX END] -->";

// ============================================================================
// P0-A: 个人工作空间写入白名单
//
// 个人工作空间（workspace-xxx）根目录只允许存放系统文件，
// 非系统文件必须放在 docs/ 等子目录，防止 Agent 在根目录堆积杂项报告。
// ============================================================================

/** 个人工作空间根目录允许直接存放的系统文件白名单（大小写不敏感） */
const AGENT_WORKSPACE_ROOT_ALLOWED_FILES = new Set([
  "agents.md",
  "soul.md",
  "identity.md",
  "user.md",
  "memory.md",
  "tools.md",
  "heartbeat.md",
  "heartbeat_state.md",
  "bootstrap.md",
  "projects.md",
  "qoder.md",
  "deployment.md",
  "code_review_guidelines.md",
  "readme.md",
]);

// ============================================================================
// P0-B: MEMORY.md 幂等写入哈希去重
//
// 在每次写入 MEMORY.md / SHARED_MEMORY.md 前，
// 计算新内容（去除尾部哈希行后）的 SHA-256，
// 若与上次写入的哈希一致，则跳过写入，返回 deduplicated=true。
// 防止系统中断重启后 Agent 重复写入相同内容。
// ============================================================================

/** 哈希行前缀标记（写在文件最末行） */
const CONTENT_HASH_PREFIX = "<!-- content-hash:";
const CONTENT_HASH_SUFFIX = " -->";

/**
 * 计算内容哈希（去除尾部哈希行后计算）
 */
function computeContentHash(content: string): string {
  const stripped = stripContentHash(content);
  return crypto.createHash("sha256").update(stripped, "utf-8").digest("hex").slice(0, 16);
}

/**
 * 去除内容末尾的哈希行
 */
function stripContentHash(content: string): string {
  const lines = content.trimEnd().split("\n");
  if (lines.length > 0 && lines[lines.length - 1].startsWith(CONTENT_HASH_PREFIX)) {
    return lines.slice(0, -1).join("\n").trimEnd();
  }
  return content.trimEnd();
}

/**
 * 从文件内容中提取已存储的哈希值
 */
function extractStoredHash(content: string): string | null {
  const lines = content.trimEnd().split("\n");
  if (lines.length === 0) {
    return null;
  }
  const lastLine = lines[lines.length - 1];
  if (lastLine.startsWith(CONTENT_HASH_PREFIX) && lastLine.endsWith(CONTENT_HASH_SUFFIX)) {
    return lastLine.slice(CONTENT_HASH_PREFIX.length, -CONTENT_HASH_SUFFIX.length).trim();
  }
  return null;
}

/**
 * 将哈希行追加到内容末尾
 */
function appendContentHash(content: string, hash: string): string {
  return stripContentHash(content) + "\n" + CONTENT_HASH_PREFIX + hash + CONTENT_HASH_SUFFIX;
}

// ============================================================================
// P0-C: MEMORY.md 语义边界警告
//
// 当 Agent 向 MEMORY.md 写入内容时，如果内容包含「项目成果」相关关键词，
// 发出警告日志，提醒 Agent 写入层级可能有误。
// 不阻断写入（避免误判），只记录警告。
// ============================================================================

/** MEMORY.md 写入时的「项目成果」关键词（命中则发出层级警告） */
const MEMORY_SCOPE_WARN_PATTERNS = [
  /完成了.*项目|项目.*完成/,
  /交付.*报告|报告.*交付/,
  /sprint.*完成|milestone.*完成|里程碑.*完成/i,
  /任务已完成|task.*completed/i,
  /会议纪要|meeting.*minutes/i,
  /心跳报告|heartbeat.*report/i,
];

/**
 * 检测 MEMORY.md 写入内容是否疑似「项目成果」（应写入 SHARED_MEMORY.md）
 */
function detectMemoryScopeViolation(content: string, filePath: string): boolean {
  const basename = path.basename(filePath).toLowerCase();
  if (basename !== "memory.md") {
    return false;
  }
  return MEMORY_SCOPE_WARN_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * 兼容旧调用方的默认上限（取记忆层上限）
 * @deprecated 优先使用 getMemoryFileConfig 获取分级配置
 */
export const MEMORY_FILE_MAX_CHARS = 10_000;

/**
 * 根据文件路径查找分级配置，未命中返回 null
 */
export function getMemoryFileConfig(filePath: string): MemoryFileConfig | null {
  const basename = path.basename(filePath);
  return MEMORY_FILE_CONFIGS.find((cfg) => cfg.pattern.test(basename)) ?? null;
}

/**
 * 判断一个文件路径是否属于需要保护的记忆型文件
 */
export function isMemoryFile(filePath: string): boolean {
  return getMemoryFileConfig(filePath) !== null;
}

/**
 * 对记忆文件内容应用分级裁剪（仅用于不可归档的身份/行为层文件）
 *
 * @param content   原始内容
 * @param filePath  文件路径（用于自动查表 + 日志标记）
 * @param maxChars  覆盖上限（不传则按文件类型自动查表）
 * @returns         裁剪结果
 */
export function trimMemoryContent(
  content: string,
  filePath: string,
  maxChars?: number,
): { content: string; trimmed: boolean; originalLength: number } {
  const cfg = getMemoryFileConfig(filePath);
  const limit = maxChars ?? cfg?.maxChars ?? MEMORY_FILE_MAX_CHARS;
  const headRatio = cfg?.headRatio ?? 0.7;
  const tailRatio = cfg?.tailRatio ?? 0.2;

  const trimmed = content.trimEnd();
  if (trimmed.length <= limit) {
    return { content: trimmed, trimmed: false, originalLength: trimmed.length };
  }

  const headChars = Math.floor(limit * headRatio);
  const tailChars = Math.floor(limit * tailRatio);
  const head = trimmed.slice(0, headChars);
  const tail = trimmed.slice(-tailChars);
  const omittedChars = trimmed.length - headChars - tailChars;
  const typeLabel = cfg?.description ?? path.basename(filePath);

  const marker = [
    "",
    `[✂️ 超限裁剪警告 — ${typeLabel}]`,
    `[原始长度 ${trimmed.length} 字符，超过分级限制 ${limit}，已省略中间 ${omittedChars} 字符]`,
    `[此文件（身份/行为层）不应持续增长，请人工精简内容]`,
    "",
  ].join("\n");

  return {
    content: [head, marker, tail].join("\n"),
    trimmed: true,
    originalLength: trimmed.length,
  };
}

/**
 * 归档结果
 */
export interface ArchiveMemoryResult {
  /** 写回主文件的新内容（含归档索引区 + 最新内容） */
  newMainContent: string;
  /** 归档文件的绝对路径 */
  archiveFilePath: string;
  /** 写入归档文件的内容 */
  archiveContent: string;
  /** 主文件原始长度 */
  originalLength: number;
  /** 是否实际触发了归档（false = 未超限，无需归档） */
  archived: boolean;
}

/**
 * 对 MEMORY.md / SHARED_MEMORY.md 应用归档索引转移（零信息丢失）
 *
 * 当主文件超过 maxChars 时：
 * 1. 提取现有归档索引区（HEAD 部分）
 * 2. 将溢出的旧内容（去除索引区后的头部）写入 memory/YYYY-MM-DD-archive.md（追加）
 * 3. 在主文件头部更新归档索引区（新增本次归档条目）
 * 4. 主文件只保留：[归档索引区] + [最新内容尾部]
 *
 * 归档文件路径规则：
 *   MEMORY.md          → {workspaceDir}/memory/YYYY-MM-DD-archive.md
 *   SHARED_MEMORY.md   → {workspaceDir}/shared_memory/YYYY-MM-DD-archive.md
 *
 * @param content   即将写入主文件的新内容
 * @param filePath  主文件绝对路径
 * @param maxChars  覆盖上限（不传则按文件类型自动查表）
 * @returns         归档结果（即使未超限也会返回，archived=false）
 */
export function archiveMemoryOverflow(
  content: string,
  filePath: string,
  maxChars?: number,
): ArchiveMemoryResult {
  const cfg = getMemoryFileConfig(filePath);
  const limit = maxChars ?? cfg?.maxChars ?? MEMORY_FILE_MAX_CHARS;
  const typeLabel = cfg?.description ?? path.basename(filePath);

  const trimmed = content.trimEnd();
  const originalLength = trimmed.length;

  // 未超限，直接返回
  if (trimmed.length <= limit) {
    return {
      newMainContent: trimmed,
      archiveFilePath: "",
      archiveContent: "",
      originalLength,
      archived: false,
    };
  }

  // ── 1. 分离现有归档索引区 ──
  let existingIndexBlock = "";
  let contentWithoutIndex = trimmed;
  const idxStart = trimmed.indexOf(ARCHIVE_INDEX_START);
  const idxEnd = trimmed.indexOf(ARCHIVE_INDEX_END);
  if (idxStart !== -1 && idxEnd !== -1 && idxEnd > idxStart) {
    existingIndexBlock = trimmed.slice(idxStart, idxEnd + ARCHIVE_INDEX_END.length);
    // 去掉索引区后的实际内容（可能有前后空行）
    contentWithoutIndex = (
      trimmed.slice(0, idxStart) + trimmed.slice(idxEnd + ARCHIVE_INDEX_END.length)
    )
      .replace(/^\n+/, "")
      .trimEnd();
  }

  // ── 2. 计算保留尾部（最新内容）和溢出头部（待归档）──
  const tailRatio = cfg?.tailRatio ?? 0.3;
  const tailChars = Math.floor(limit * tailRatio);
  // 尾部：保留最新内容
  const tailContent = contentWithoutIndex.slice(-tailChars);
  // 溢出部分：去掉尾部后剩余的全部内容
  const overflowContent = contentWithoutIndex.slice(0, contentWithoutIndex.length - tailChars);

  // ── 3. 确定归档文件路径 ──
  const workspaceDir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const isShared = /^shared_memory\.md$/i.test(fileName);
  const archiveSubdir = isShared ? SHARED_MEMORY_ARCHIVE_SUBDIR : MEMORY_ARCHIVE_SUBDIR;
  const archiveDir = path.join(workspaceDir, archiveSubdir);
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const archiveFileName = `${dateStr}-archive.md`;
  const archiveFilePath = path.join(archiveDir, archiveFileName);

  // ── 4. 构建归档文件内容（追加模式：若当日已有归档则追加分隔符） ──
  const archiveTimestamp = new Date().toISOString();
  const archiveContent = [
    `\n---\n`,
    `## 归档时间: ${archiveTimestamp}`,
    `## 来源: ${filePath}`,
    `## 字符数: ${overflowContent.length}`,
    ``,
    overflowContent.trimStart(),
  ].join("\n");

  // ── 5. 构建新的归档索引区 ──
  // 从现有索引区提取已有条目列表
  const existingEntries = existingIndexBlock
    ? existingIndexBlock.replace(ARCHIVE_INDEX_START, "").replace(ARCHIVE_INDEX_END, "").trim()
    : "";
  const newEntry = `- [${archiveTimestamp}] → ${path.join(archiveSubdir, archiveFileName)} (${overflowContent.length} 字符)`;
  const newIndexEntries = existingEntries ? `${existingEntries}\n${newEntry}` : newEntry;

  const newIndexBlock = [
    ARCHIVE_INDEX_START,
    `## 📚 归档索引 | Memory Archive Index — ${typeLabel}`,
    `## 历史内容已归档到 ${archiveSubdir}/ 目录，按需读取，完整保留`,
    newIndexEntries,
    ARCHIVE_INDEX_END,
  ].join("\n");

  // ── 6. 组装新的主文件内容：[归档索引区] + [最新内容] ──
  const newMainContent = [newIndexBlock, "", tailContent].join("\n");

  return {
    newMainContent,
    archiveFilePath,
    archiveContent,
    originalLength,
    archived: true,
  };
}

/**
 * 文件操作结果
 */
export interface FileOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  redirectedPath?: string;
}

/**
 * 文件访问日志
 */
export interface FileAccessLog {
  timestamp: number;
  agentId: string;
  operation: "read" | "write" | "delete";
  filePath: string;
  allowed: boolean;
  reason?: string;
  sessionKey: string;
}

/**
 * 文件工具安全拦截器（单例）
 */
export class FileToolsSecureInterceptor {
  private static instance: FileToolsSecureInterceptor;
  private logs: FileAccessLog[] = [];
  private maxLogs: number = 1000;
  private enableLogging: boolean = true;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): FileToolsSecureInterceptor {
    if (!FileToolsSecureInterceptor.instance) {
      FileToolsSecureInterceptor.instance = new FileToolsSecureInterceptor();
    }
    return FileToolsSecureInterceptor.instance;
  }

  /**
   * 设置日志配置
   */
  public setLoggingConfig(enabled: boolean, maxLogs?: number): void {
    this.enableLogging = enabled;
    if (maxLogs !== undefined) {
      this.maxLogs = maxLogs;
    }
  }

  /**
   * 记录访问日志
   */
  private logAccess(log: FileAccessLog): void {
    if (!this.enableLogging) {
      return;
    }

    this.logs.push(log);

    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * 获取访问日志
   */
  public getAccessLogs(agentId?: string, sessionKey?: string, limit?: number): FileAccessLog[] {
    let logs = [...this.logs];

    if (agentId) {
      logs = logs.filter((log) => log.agentId === agentId);
    }

    if (sessionKey) {
      logs = logs.filter((log) => log.sessionKey === sessionKey);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  /**
   * 清除访问日志
   */
  public clearAccessLogs(): void {
    this.logs = [];
  }

  /**
   * 安全读取文件
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 文件内容或错误
   */
  public async secureReadFile(
    filePath: string,
    workspace: WorkspaceResolution,
  ): Promise<FileOperationResult<string>> {
    const startTime = Date.now();

    // === Phase 3: 权限检查拦截 ===
    if (workspace.agentId) {
      const permissionContext: PermissionCheckContext = {
        subject: {
          type: "user",
          id: workspace.agentId,
          name: workspace.agentId,
        },
        toolName: "file_read",
        toolParams: {
          filePath,
          workspaceRoot: workspace.rootDir,
        },
        sessionId: workspace.sessionKey,
        agentId: workspace.agentId,
        timestamp: startTime,
        metadata: {
          sessionType: workspace.sessionType,
        },
      };

      const permissionResult = await permissionIntegrator.checkToolPermission(permissionContext);

      if (!permissionResult.allowed) {
        // 记录日志
        this.logAccess({
          timestamp: startTime,
          agentId: workspace.agentId,
          operation: "read",
          filePath,
          allowed: false,
          reason: permissionResult.reason || "权限被拒绝",
          sessionKey: workspace.sessionKey,
        });

        if (permissionResult.requiresApproval) {
          // 需要审批
          const approvalRequest = await permissionIntegrator.createApprovalRequest(
            permissionContext,
            permissionResult.approvalId,
          );

          return {
            success: false,
            error: `file_read requires approval. Request ID: ${approvalRequest.id}. Reason: ${permissionResult.reason || "Approval required"}`,
          };
        } else {
          // 直接拒绝
          return {
            success: false,
            error: `file_read permission denied. Reason: ${permissionResult.reason || "Access denied"}`,
          };
        }
      }
    }
    // === 权限检查结束 ===

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "read",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 读取文件
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        success: true,
        data: content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `读取文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param workspace 工作空间解析结果
   * @returns 操作结果
   */
  public async secureWriteFile(
    filePath: string,
    content: string,
    workspace: WorkspaceResolution,
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now();

    // ── P0-A: 个人工作空间根目录写入白名单检查 ──
    // 当写入路径位于某个 workspace-xxx 根目录时，只允许写系统文件
    const normalizedFilePath = path.normalize(filePath);
    const fileBasename = path.basename(normalizedFilePath).toLowerCase();
    const fileDir = path.dirname(normalizedFilePath);
    // 匹配个人工作空间根目录（workspace-xxx 或 main / team-member 等自定义名）
    // 判断标准：父目录 = agentWorkspaceRoot 直接子目录，且该子目录本身是工作空间
    if (
      workspace.type === "agent" &&
      workspace.rootDir &&
      path.normalize(fileDir) === path.normalize(workspace.rootDir) &&
      !AGENT_WORKSPACE_ROOT_ALLOWED_FILES.has(fileBasename) &&
      normalizedFilePath.endsWith(".md")
    ) {
      const suggestedPath = path.join(fileDir, "docs", path.basename(normalizedFilePath));
      console.warn(
        `[FileToolsSecure] ⚠️ P0-A 路径白名单拦截: Agent ${workspace.agentId ?? "unknown"} 试图在个人工作空间根目录创建非系统文件 "${path.basename(normalizedFilePath)}"。` +
          `\n  请将文件放到 docs/ 子目录: ${suggestedPath}`,
      );
      // 拒绝写入根目录，防止杂项文件污染
      return {
        success: false,
        error: `禁止在个人工作空间根目录创建非系统文件 "${path.basename(normalizedFilePath)}"。请使用 docs/ 子目录: ${suggestedPath}`,
        redirectedPath: suggestedPath,
      };
    }

    // === Phase 3: 权限检查拦截 ===
    if (workspace.agentId) {
      const permissionContext: PermissionCheckContext = {
        subject: {
          type: "user",
          id: workspace.agentId,
          name: workspace.agentId,
        },
        toolName: "file_write",
        toolParams: {
          filePath,
          workspaceRoot: workspace.rootDir,
          contentLength: content.length,
        },
        sessionId: workspace.sessionKey,
        agentId: workspace.agentId,
        timestamp: startTime,
        metadata: {
          sessionType: workspace.sessionType,
        },
      };

      const permissionResult = await permissionIntegrator.checkToolPermission(permissionContext);

      if (!permissionResult.allowed) {
        // 记录日志
        this.logAccess({
          timestamp: startTime,
          agentId: workspace.agentId,
          operation: "write",
          filePath,
          allowed: false,
          reason: permissionResult.reason || "权限被拒绝",
          sessionKey: workspace.sessionKey,
        });

        if (permissionResult.requiresApproval) {
          // 需要审批
          const approvalRequest = await permissionIntegrator.createApprovalRequest(
            permissionContext,
            permissionResult.approvalId,
          );

          return {
            success: false,
            error: `file_write requires approval. Request ID: ${approvalRequest.id}. Reason: ${permissionResult.reason || "Approval required"}`,
          };
        } else {
          // 直接拒绝
          return {
            success: false,
            error: `file_write permission denied. Reason: ${permissionResult.reason || "Access denied"}`,
          };
        }
      }
    }
    // === 权限检查结束 ===

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "write", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "write",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 写入文件
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ── P0-B: 幂等哈希去重（MEMORY.md / SHARED_MEMORY.md）──
      // 计算新内容哈希，若与现有文件哈希一致则跳过写入，防止中断重启重复写
      const memBasename = path.basename(filePath).toLowerCase();
      if (memBasename === "memory.md" || memBasename === "shared_memory.md") {
        if (fs.existsSync(filePath)) {
          const existingRaw = fs.readFileSync(filePath, "utf-8");
          const storedHash = extractStoredHash(existingRaw);
          const newHash = computeContentHash(content);
          if (storedHash && storedHash === newHash) {
            console.log(
              `[FileToolsSecure] P0-B 幂等跳过: ${path.basename(filePath)} 内容未变 (hash=${newHash}, agentId=${workspace.agentId ?? "unknown"})`,
            );
            return { success: true };
          }
        }
      }

      // ── P0-C: MEMORY.md 语义边界警告 ──
      if (detectMemoryScopeViolation(content, filePath)) {
        console.warn(
          `[FileToolsSecure] ⚠️ P0-C 记忆层级警告: Agent ${workspace.agentId ?? "unknown"} 向 MEMORY.md 写入的内容疑似「项目成果摘要」。` +
            `\n  项目成果应写入项目的 SHARED_MEMORY.md，个人 MEMORY.md 只应记录个人经验教训。`,
        );
      }

      // 记忆文件分级保护：
      //   MEMORY.md / SHARED_MEMORY.md → 归档转移（零丢失）
      //   SOUL / IDENTITY / USER / AGENTS   → 裁剪并警告（这些文件不应持续增长）
      // 这是唯一写入通道，一处拦截即全局生效
      let finalContent = content;
      const memCfg = getMemoryFileConfig(filePath);
      if (memCfg) {
        if (memCfg.archivable) {
          // MEMORY.md / SHARED_MEMORY.md — 归档转移，零丢失
          const archResult = archiveMemoryOverflow(content, filePath);
          if (archResult.archived) {
            finalContent = archResult.newMainContent;
            // 将归档目录和归档文件写入完成后再写主文件
            try {
              const archiveDir = path.dirname(archResult.archiveFilePath);
              if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
              }
              // 追加模式写入归档文件（当天多次触发则合并到同一文件）
              fs.appendFileSync(archResult.archiveFilePath, archResult.archiveContent, "utf-8");
              console.log(
                `[FileToolsSecure] 归档转移: ${memCfg.description} ${archResult.originalLength} → 主文件 ${finalContent.length} 字符 + 归档 ${archResult.archiveFilePath} (agentId=${workspace.agentId ?? "unknown"})`,
              );
            } catch (archErr) {
              // 归档写入失败时回退到主文件不裁剪，避免数据丢失
              console.warn(`[FileToolsSecure] 归档文件写入失败，保持主文件原内容不变:`, archErr);
              finalContent = content;
            }
          } else if (archResult.originalLength > memCfg.maxChars * 0.8) {
            console.warn(
              `[FileToolsSecure] ⚠️ ${memCfg.description} 已用 ${archResult.originalLength}/${memCfg.maxChars} 字符 (${Math.round((archResult.originalLength / memCfg.maxChars) * 100)}%)，接近归档阈値 (agentId=${workspace.agentId ?? "unknown"})`,
            );
          }
        } else {
          // SOUL / IDENTITY / USER / AGENTS — 裁剪并警告
          const result = trimMemoryContent(content, filePath);
          if (result.trimmed) {
            finalContent = result.content;
            console.warn(
              `[FileToolsSecure] 裁剪警告(${memCfg.description}) ${result.originalLength} → ${finalContent.length} 字符，此文件超过 ${memCfg.maxChars} 字符上限，请人工精简 (agentId=${workspace.agentId ?? "unknown"})`,
            );
          } else if (result.originalLength > memCfg.maxChars * 0.8) {
            console.warn(
              `[FileToolsSecure] ⚠️ ${memCfg.description} 已用 ${result.originalLength}/${memCfg.maxChars} 字符 (${Math.round((result.originalLength / memCfg.maxChars) * 100)}%)，接近分级上限 (agentId=${workspace.agentId ?? "unknown"})`,
            );
          }
        }
      }

      // ── 写入前对 MEMORY.md / SHARED_MEMORY.md 追加哈希行 ──
      if (memBasename === "memory.md" || memBasename === "shared_memory.md") {
        const hashToStore = computeContentHash(finalContent);
        finalContent = appendContentHash(finalContent, hashToStore);
      }

      fs.writeFileSync(filePath, finalContent, "utf-8");
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `写入文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全删除文件
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 操作结果
   */
  public secureDeleteFile(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<void> {
    const startTime = Date.now();

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "delete", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "delete",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 删除文件
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `删除文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全读取目录
   * @param dirPath 目录路径
   * @param workspace 工作空间解析结果
   * @returns 文件列表或错误
   */
  public secureReadDir(
    dirPath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<string[]> {
    const startTime = Date.now();

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(dirPath, "read", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "read",
      filePath: dirPath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "目录访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 读取目录
    try {
      if (!fs.existsSync(dirPath)) {
        return {
          success: false,
          error: "目录不存在",
        };
      }

      const files = fs.readdirSync(dirPath);
      return {
        success: true,
        data: files,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `读取目录失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全检查文件是否存在
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 是否存在或错误
   */
  public secureFileExists(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<boolean> {
    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 检查文件是否存在
    try {
      const exists = fs.existsSync(filePath);
      return {
        success: true,
        data: exists,
      };
    } catch {
      return {
        success: false,
        error: "检查文件失败",
      };
    }
  }

  /**
   * 安全获取文件状态
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 文件状态或错误
   */
  public secureFileStat(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<fs.Stats> {
    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 获取文件状态
    try {
      const stat = fs.statSync(filePath);
      return {
        success: true,
        data: stat,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取文件状态失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 批量安全读取文件
   * @param filePaths 文件路径列表
   * @param workspace 工作空间解析结果
   * @returns 文件内容列表
   */
  public async secureBatchReadFiles(
    filePaths: string[],
    workspace: WorkspaceResolution,
  ): Promise<Map<string, FileOperationResult<string>>> {
    const results = new Map<string, FileOperationResult<string>>();

    for (const filePath of filePaths) {
      results.set(filePath, await this.secureReadFile(filePath, workspace));
    }

    return results;
  }

  /**
   * 获取文件访问统计
   * @param agentId 智能助手ID（可选）
   * @returns 统计信息
   */
  public getAccessStats(agentId?: string): {
    totalAccesses: number;
    allowedAccesses: number;
    deniedAccesses: number;
    operationCounts: {
      read: number;
      write: number;
      delete: number;
    };
  } {
    let logs = this.logs;

    if (agentId) {
      logs = logs.filter((log) => log.agentId === agentId);
    }

    const stats = {
      totalAccesses: logs.length,
      allowedAccesses: logs.filter((log) => log.allowed).length,
      deniedAccesses: logs.filter((log) => !log.allowed).length,
      operationCounts: {
        read: logs.filter((log) => log.operation === "read").length,
        write: logs.filter((log) => log.operation === "write").length,
        delete: logs.filter((log) => log.operation === "delete").length,
      },
    };

    return stats;
  }

  /**
   * 导出访问日志
   * @param outputPath 输出路径（可选）
   * @returns 日志JSON字符串
   */
  public exportAccessLogs(outputPath?: string): string {
    const logsJson = JSON.stringify(this.logs, null, 2);

    if (outputPath) {
      try {
        fs.writeFileSync(outputPath, logsJson, "utf-8");
      } catch (error) {
        console.error("导出日志失败:", error);
      }
    }

    return logsJson;
  }
}

/**
 * 导出单例实例
 */
export const fileToolsSecure = FileToolsSecureInterceptor.getInstance();

/**
 * 便捷函数：安全读取文件
 */
export async function readFileSecure(
  filePath: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): Promise<FileOperationResult<string>> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return await fileToolsSecure.secureReadFile(filePath, workspace);
}

/**
 * 便捷函数：安全写入文件
 */
export async function writeFileSecure(
  filePath: string,
  content: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): Promise<FileOperationResult<void>> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return await fileToolsSecure.secureWriteFile(filePath, content, workspace);
}

/**
 * 便捷函数：安全删除文件
 */
export function deleteFileSecure(
  filePath: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): FileOperationResult<void> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return fileToolsSecure.secureDeleteFile(filePath, workspace);
}
