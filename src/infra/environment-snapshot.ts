/**
 * 环境快照系统
 *
 * 第二阶段：系统化环境感知
 *
 * 核心功能：
 * 1. Agent 启动时扫描环境
 * 2. 缓存检测结果（避免重复检测）
 * 3. 提供环境信息查询接口
 * 4. 自动过期刷新
 */

import { detectBinariesBatch, type BinaryDetectionResult } from "../infra/detect-binary.js";

/**
 * 环境快照数据
 */
export interface EnvironmentSnapshot {
  /** 检测到的二进制文件 */
  detectedBins: Map<string, BinaryDetectionResult>;
  /** 系统信息 */
  systemInfo: {
    platform: string;
    arch: string;
    nodeVersion: string;
    npmVersion?: string;
  };
  /** 扫描时间戳 */
  scannedAt: number;
  /** 过期时间戳 */
  expiresAt: number;
}

/**
 * 环境快照配置
 */
export interface EnvSnapshotConfig {
  /** 缓存有效期（毫秒），默认 30 分钟 */
  cacheTtlMs?: number;
  /** 默认检测的工具列表 */
  defaultTools?: string[];
}

const DEFAULT_CONFIG: Required<EnvSnapshotConfig> = {
  cacheTtlMs: 30 * 60 * 1000, // 30 分钟
  defaultTools: [
    // 开发工具
    "node",
    "npm",
    "pnpm",
    "yarn",
    "git",
    // 数据库
    "mysql",
    "mysqldump",
    "psql",
    "sqlite3",
    "mongosh",
    "redis-cli",
    // 其他常用工具
    "python",
    "python3",
    "pip",
    "pip3",
    "curl",
    "wget",
    "docker",
    "docker-compose",
  ],
};

/**
 * 全局环境快照缓存
 */
let globalSnapshot: EnvironmentSnapshot | null = null;

/**
 * 创建环境快照
 *
 * 业界最佳实践：
 * - Claude Code: 启动时扫描环境
 * - OpenClaw: 缓存检测结果避免重复
 *
 * @param config 配置选项
 * @param customTools 自定义工具列表（会合并到默认列表）
 */
export async function createEnvironmentSnapshot(
  config: EnvSnapshotConfig = {},
  customTools: string[] = [],
): Promise<EnvironmentSnapshot> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const allTools = [...new Set([...mergedConfig.defaultTools, ...customTools])];

  console.log(`[EnvSnapshot] Scanning environment for ${allTools.length} tools...`);

  // 批量检测所有工具（性能优化）
  const detectedBins = await detectBinariesBatch(allTools);

  // 获取系统信息
  const systemInfo = await collectSystemInfo();

  const now = Date.now();
  const snapshot: EnvironmentSnapshot = {
    detectedBins,
    systemInfo,
    scannedAt: now,
    expiresAt: now + mergedConfig.cacheTtlMs,
  };

  console.log(
    `[EnvSnapshot] Snapshot created: ${detectedBins.size} tools scanned, ` +
      `${Array.from(detectedBins.values()).filter((r) => r.found).length} found`,
  );

  return snapshot;
}

/**
 * 获取环境快照（带缓存）
 *
 * 如果缓存过期，自动刷新
 */
export async function getEnvironmentSnapshot(
  config: EnvSnapshotConfig = {},
): Promise<EnvironmentSnapshot> {
  // 检查缓存是否有效
  if (globalSnapshot && globalSnapshot.expiresAt > Date.now()) {
    return globalSnapshot;
  }

  // 缓存过期或不存在，创建新快照
  globalSnapshot = await createEnvironmentSnapshot(config);
  return globalSnapshot;
}

/**
 * 清除环境快照缓存
 */
export function clearEnvironmentSnapshot(): void {
  globalSnapshot = null;
}

/**
 * 检查工具是否可用
 *
 * @param toolName 工具名称
 * @param autoRefresh 缓存过期时是否自动刷新
 */
export async function isToolAvailable(
  toolName: string,
  autoRefresh: boolean = true,
): Promise<boolean> {
  let snapshot = globalSnapshot;

  // 缓存过期处理
  if (!snapshot || snapshot.expiresAt <= Date.now()) {
    if (autoRefresh) {
      snapshot = await createEnvironmentSnapshot();
      globalSnapshot = snapshot;
    } else {
      return false;
    }
  }

  const result = snapshot.detectedBins.get(toolName);
  return result?.found === true;
}

/**
 * 获取工具的详细信息
 */
export async function getToolDetail(
  toolName: string,
  autoRefresh: boolean = true,
): Promise<BinaryDetectionResult | null> {
  let snapshot = globalSnapshot;

  if (!snapshot || snapshot.expiresAt <= Date.now()) {
    if (autoRefresh) {
      snapshot = await createEnvironmentSnapshot();
      globalSnapshot = snapshot;
    } else {
      return null;
    }
  }

  return snapshot.detectedBins.get(toolName) || null;
}

/**
 * 收集系统信息
 */
async function collectSystemInfo(): Promise<EnvironmentSnapshot["systemInfo"]> {
  const systemInfo: EnvironmentSnapshot["systemInfo"] = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };

  // 获取 npm 版本
  try {
    const { runCommandWithTimeout } = await import("../process/exec.js");
    const result = await runCommandWithTimeout(["npm", "--version"], { timeoutMs: 2000 });
    if (result.code === 0) {
      systemInfo.npmVersion = result.stdout.trim();
    }
  } catch {
    // 忽略错误
  }

  return systemInfo;
}

/**
 * 打印环境快照摘要
 */
export function printSnapshotSummary(snapshot: EnvironmentSnapshot): string {
  const found = Array.from(snapshot.detectedBins.entries())
    .filter(([, result]) => result.found)
    .map(([name, result]) => `${name} v${result.version || "unknown"}`);

  const missing = Array.from(snapshot.detectedBins.entries())
    .filter(([, result]) => !result.found)
    .map(([name]) => name);

  const lines = [
    `📊 Environment Snapshot (scanned at ${new Date(snapshot.scannedAt).toLocaleString()})`,
    `   System: ${snapshot.systemInfo.platform} ${snapshot.systemInfo.arch}`,
    `   Node.js: ${snapshot.systemInfo.nodeVersion}`,
    `   npm: ${snapshot.systemInfo.npmVersion || "unknown"}`,
    ``,
    `✅ Found (${found.length}):`,
    ...found.map((tool) => `   - ${tool}`),
    ``,
    `❌ Missing (${missing.length}):`,
    ...missing.map((tool) => `   - ${tool}`),
  ];

  return lines.join("\n");
}

/**
 * 将环境快照转换为 JSON（用于序列化）
 */
export function snapshotToJson(snapshot: EnvironmentSnapshot): Record<string, unknown> {
  return {
    detectedBins: Object.fromEntries(
      Array.from(snapshot.detectedBins.entries()).map(([name, result]) => [name, result]),
    ),
    systemInfo: snapshot.systemInfo,
    scannedAt: snapshot.scannedAt,
    expiresAt: snapshot.expiresAt,
  };
}
