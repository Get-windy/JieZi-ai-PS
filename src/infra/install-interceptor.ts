/**
 * 智能安装拦截引擎
 *
 * 解决 AI Agent 重复安装依赖的问题
 * 业界最佳实践：Anthropic Claude Code / OpenClaw / MCP Protocol
 *
 * 核心功能：
 * 1. 检测软件是否已安装
 * 2. 版本兼容性检查
 * 3. 智能决策：跳过或安装
 */

import { detectBinaryDetail, type BinaryDetectionResult } from "../infra/detect-binary.js";
import { runCommandWithTimeout } from "../process/exec.js";

/**
 * 安装包信息
 */
export interface PackageInfo {
  name: string;
  version?: string;
  versionRange?: string;
  manager: "npm" | "pnpm" | "yarn" | "pip" | "apt" | "brew" | "other";
}

/**
 * 安装拦截结果
 */
export interface InstallInterceptResult {
  /** 是否应该跳过安装 */
  shouldSkip: boolean;
  /** 跳过原因 */
  reason?: string;
  /** 已安装的信息 */
  existing?: {
    version: string;
    path: string;
    compatible: boolean;
  };
  /** 建议的操作 */
  suggestion?: string;
}

/**
 * 版本兼容性检查
 *
 * 简化的语义化版本比较
 * 支持：exact (1.2.3), range (>=1.2.0), caret (^1.2.3), tilde (~1.2.0)
 */
export function checkVersionCompatibility(
  existingVersion: string,
  requiredVersion?: string,
): boolean {
  if (!requiredVersion) {
    return true; // 没有版本要求，任何版本都可以
  }

  // 精确匹配
  if (requiredVersion === existingVersion) {
    return true;
  }

  // 解析版本号
  const existing = parseSemver(existingVersion);
  if (!existing) {
    return true; // 无法解析，假设兼容
  }

  // 处理范围语法
  if (requiredVersion.startsWith(">=")) {
    const minVersion = parseSemver(requiredVersion.slice(2).trim());
    if (!minVersion) {
      return true;
    }
    return compareSemver(existing, minVersion) >= 0;
  }

  if (requiredVersion.startsWith("^")) {
    // Caret: ^1.2.3 => >=1.2.3 <2.0.0
    const baseVersion = parseSemver(requiredVersion.slice(1).trim());
    if (!baseVersion) {
      return true;
    }
    return existing.major === baseVersion.major && compareSemver(existing, baseVersion) >= 0;
  }

  if (requiredVersion.startsWith("~")) {
    // Tilde: ~1.2.3 => >=1.2.3 <1.3.0
    const baseVersion = parseSemver(requiredVersion.slice(1).trim());
    if (!baseVersion) {
      return true;
    }
    return (
      existing.major === baseVersion.major &&
      existing.minor === baseVersion.minor &&
      compareSemver(existing, baseVersion) >= 0
    );
  }

  // 精确匹配（无前缀）
  const required = parseSemver(requiredVersion);
  if (!required) {
    return true;
  }
  return compareSemver(existing, required) === 0;
}

/**
 * 解析语义化版本号
 */
function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * 比较两个语义化版本号
 * 返回: -1 (a < b), 0 (a === b), 1 (a > b)
 */
function compareSemver(
  a: { major: number; minor: number; patch: number },
  b: { major: number; minor: number; patch: number },
): number {
  if (a.major !== b.major) {
    return a.major > b.major ? 1 : -1;
  }
  if (a.minor !== b.minor) {
    return a.minor > b.minor ? 1 : -1;
  }
  if (a.patch !== b.patch) {
    return a.patch > b.patch ? 1 : -1;
  }
  return 0;
}

/**
 * 解析安装命令
 *
 * 支持：
 * - npm install <package>@<version>
 * - pnpm add <package>@<version>
 * - pip install <package>==<version>
 * - apt install <package>=<version>
 * - brew install <package>
 */
export function parseInstallCommand(command: string): PackageInfo | null {
  const trimmed = command.trim();

  // npm/pnpm/yarn
  const npmMatch = trimmed.match(/^(npm\s+(i|install)|pnpm\s+(add|install)|yarn\s+(add))\s+(.+)$/i);
  if (npmMatch) {
    const packagePart = npmMatch[5].trim().split(/\s+/)[0]; // 只取第一个包
    const [name, version] = packagePart.split("@");
    const manager = trimmed.startsWith("npm")
      ? "npm"
      : trimmed.startsWith("pnpm")
        ? "pnpm"
        : "yarn";
    return { name, version, manager };
  }

  // pip
  const pipMatch = trimmed.match(/^pip(3)?\s+install\s+(.+)$/i);
  if (pipMatch) {
    const packagePart = pipMatch[2].trim().split(/\s+/)[0];
    const pipExactMatch = packagePart.match(/^([a-zA-Z0-9_-]+)==(.+)$/);
    if (pipExactMatch) {
      return { name: pipExactMatch[1], version: pipExactMatch[2], manager: "pip" };
    }
    return { name: packagePart, manager: "pip" };
  }

  // apt
  const aptMatch = trimmed.match(/^apt(-get)?\s+install\s+(.+)$/i);
  if (aptMatch) {
    const packagePart = aptMatch[2].trim().split(/\s+/)[0];
    const aptExactMatch = packagePart.match(/^([a-zA-Z0-9.+-]+)=?(.+)?$/);
    if (aptExactMatch) {
      return {
        name: aptExactMatch[1],
        version: aptExactMatch[2] || undefined,
        manager: "apt",
      };
    }
    return { name: packagePart, manager: "apt" };
  }

  // brew
  const brewMatch = trimmed.match(/^brew\s+install\s+(.+)$/i);
  if (brewMatch) {
    const packagePart = brewMatch[1].trim().split(/\s+/)[0];
    return { name: packagePart, manager: "brew" };
  }

  return null;
}

/**
 * 检查包是否已安装（npm/pnpm/yarn）
 */
async function checkNpmPackageInstalled(
  name: string,
  global: boolean = false,
): Promise<{ version?: string; path?: string }> {
  try {
    const args = global ? ["list", "-g", "--json", "--depth=0"] : ["list", "--json", "--depth=0"];
    const result = await runCommandWithTimeout(["npm", ...args], { timeoutMs: 5000 });
    if (result.code !== 0) {
      return {};
    }

    const json = JSON.parse(result.stdout);
    const dependencies = json.dependencies || {};
    const pkg = dependencies[name];
    if (pkg) {
      return { version: pkg.version, path: pkg.path };
    }
  } catch {
    // 忽略错误
  }
  return {};
}

/**
 * 检查包是否已安装（pip）
 */
async function checkPipPackageInstalled(name: string): Promise<{ version?: string }> {
  try {
    const result = await runCommandWithTimeout(["pip", "show", name], { timeoutMs: 5000 });
    if (result.code === 0) {
      const versionMatch = result.stdout.match(/Version:\s*(.+)/i);
      if (versionMatch) {
        return { version: versionMatch[1].trim() };
      }
    }
  } catch {
    // 忽略错误
  }
  return {};
}

/**
 * 智能安装拦截器
 *
 * 核心逻辑：
 * 1. 解析安装命令
 * 2. 检查是否已安装
 * 3. 版本兼容性检查
 * 4. 返回决策结果
 */
export async function interceptInstall(command: string): Promise<InstallInterceptResult> {
  const packageInfo = parseInstallCommand(command);
  if (!packageInfo) {
    return { shouldSkip: false, suggestion: "无法解析安装命令" };
  }

  // 检查是否已安装
  let existing: BinaryDetectionResult | { version?: string; path?: string } = { found: false };

  if (["npm", "pnpm", "yarn"].includes(packageInfo.manager)) {
    existing = await checkNpmPackageInstalled(
      packageInfo.name,
      command.includes("-g") || command.includes("--global"),
    );
  } else if (packageInfo.manager === "pip") {
    existing = await checkPipPackageInstalled(packageInfo.name);
  } else {
    // 检查二进制文件
    existing = await detectBinaryDetail(packageInfo.name);
  }

  // 如果已安装，检查版本兼容性
  if ("found" in existing && existing.found && existing.version) {
    const compatible = checkVersionCompatibility(existing.version, packageInfo.version);
    if (compatible) {
      return {
        shouldSkip: true,
        reason: `已安装 ${packageInfo.name} v${existing.version}，满足需求${packageInfo.version ? ` (${packageInfo.version})` : ""}`,
        existing: {
          version: existing.version,
          path: existing.path || "",
          compatible: true,
        },
        suggestion: "跳过安装，使用现有版本",
      };
    } else {
      return {
        shouldSkip: false,
        reason: `已安装 ${packageInfo.name} v${existing.version}，但与需求 ${packageInfo.version} 不兼容`,
        existing: {
          version: existing.version,
          path: existing.path || "",
          compatible: false,
        },
        suggestion: "需要安装兼容版本",
      };
    }
  }

  // "version" in existing 用于 npm/pip 的返回
  if ("version" in existing && existing.version) {
    const compatible = checkVersionCompatibility(existing.version, packageInfo.version);
    if (compatible) {
      return {
        shouldSkip: true,
        reason: `已安装 ${packageInfo.name} v${existing.version}，满足需求${packageInfo.version ? ` (${packageInfo.version})` : ""}`,
        existing: {
          version: existing.version,
          path: existing.path || "",
          compatible: true,
        },
        suggestion: "跳过安装，使用现有版本",
      };
    }
  }

  // 未安装，需要安装
  return {
    shouldSkip: false,
    reason: `未检测到 ${packageInfo.name}`,
    suggestion: `执行安装命令: ${command}`,
  };
}
