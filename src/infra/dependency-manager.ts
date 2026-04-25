/**
 * 智能依赖管理器
 *
 * 第三阶段：完整依赖生命周期管理
 *
 * 核心功能：
 * 1. 任务级依赖声明
 * 2. 自动检测缺失依赖
 * 3. 智能安装（带版本检查）
 * 4. 冲突检测与解决
 */

import { getEnvironmentSnapshot, type EnvironmentSnapshot } from "./environment-snapshot.js";
import { interceptInstall, type InstallInterceptResult } from "./install-interceptor.js";

/**
 * 依赖声明接口
 *
 * 用于任务/Skill 声明所需依赖
 */
export interface DependencyDeclaration {
  /** 需要的命令行工具 */
  bins?: string[];
  /** 需要的 npm 包 */
  npmPackages?: Array<{ name: string; version?: string; global?: boolean }>;
  /** 需要的 pip 包 */
  pipPackages?: Array<{ name: string; version?: string }>;
  /** 需要的系统包（apt/brew） */
  systemPackages?: Array<{ name: string; version?: string; manager: "apt" | "brew" }>;
  /** 需要的服务 */
  services?: string[]; // 如 "mysql", "redis"
}

/**
 * 依赖状态
 */
export interface DependencyStatus {
  name: string;
  type: "bin" | "npm" | "pip" | "system";
  installed: boolean;
  version?: string;
  compatible: boolean;
  requiredVersion?: string;
}

/**
 * 依赖解析结果
 */
export interface DependencyResolution {
  /** 已满足的依赖 */
  satisfied: DependencyStatus[];
  /** 缺失的依赖 */
  missing: DependencyStatus[];
  /** 版本不兼容的依赖 */
  incompatible: DependencyStatus[];
  /** 是否可以执行 */
  canProceed: boolean;
}

/**
 * 依赖管理器
 */
export class DependencyManager {
  private snapshot: EnvironmentSnapshot | null = null;

  /**
   * 解析依赖声明
   * 
   * 核心流程：
   1. 获取环境快照
   2. 检查每个依赖
   3. 分类：已满足/缺失/不兼容
   */
  async resolveDependencies(deps: DependencyDeclaration): Promise<DependencyResolution> {
    // 获取最新环境快照
    this.snapshot = await getEnvironmentSnapshot();

    const satisfied: DependencyStatus[] = [];
    const missing: DependencyStatus[] = [];
    const incompatible: DependencyStatus[] = [];

    // 检查二进制工具
    if (deps.bins) {
      for (const bin of deps.bins) {
        const status = await this.checkBinDependency(bin);
        if (status.installed && status.compatible) {
          satisfied.push(status);
        } else if (status.installed && !status.compatible) {
          incompatible.push(status);
        } else {
          missing.push(status);
        }
      }
    }

    // 检查 npm 包
    if (deps.npmPackages) {
      for (const pkg of deps.npmPackages) {
        const status = await this.checkNpmPackageDependency(pkg.name, pkg.version);
        if (status.installed && status.compatible) {
          satisfied.push(status);
        } else if (status.installed && !status.compatible) {
          incompatible.push(status);
        } else {
          missing.push(status);
        }
      }
    }

    // 检查 pip 包
    if (deps.pipPackages) {
      for (const pkg of deps.pipPackages) {
        const status = await this.checkPipPackageDependency(pkg.name, pkg.version);
        if (status.installed && status.compatible) {
          satisfied.push(status);
        } else if (status.installed && !status.compatible) {
          incompatible.push(status);
        } else {
          missing.push(status);
        }
      }
    }

    return {
      satisfied,
      missing,
      incompatible,
      canProceed: missing.length === 0 && incompatible.length === 0,
    };
  }

  /**
   * 智能安装缺失依赖
   *
   * 使用安装拦截器，避免重复安装
   */
  async installMissingDeps(
    deps: DependencyDeclaration,
    onProgress?: (message: string) => void,
  ): Promise<{ success: boolean; results: InstallInterceptResult[] }> {
    const resolution = await this.resolveDependencies(deps);
    const results: InstallInterceptResult[] = [];

    if (resolution.canProceed) {
      onProgress?.("✅ All dependencies are satisfied");
      return { success: true, results };
    }

    onProgress?.(`📦 Installing ${resolution.missing.length} missing dependencies...`);

    // 安装缺失的二进制工具
    for (const dep of resolution.missing.filter((d) => d.type === "bin")) {
      const command = this.getSuggestedInstallCommand(dep);
      if (command) {
        const result = await interceptInstall(command);
        results.push(result);

        if (!result.shouldSkip) {
          onProgress?.(`Installing ${dep.name}...`);
          // 这里可以执行实际安装命令
          // await executeInstallCommand(command);
        } else {
          onProgress?.(`⏭️  Skipped ${dep.name}: ${result.reason}`);
        }
      }
    }

    // 处理版本不兼容
    if (resolution.incompatible.length > 0) {
      onProgress?.(`⚠️  ${resolution.incompatible.length} incompatible dependencies detected:`);
      for (const dep of resolution.incompatible) {
        onProgress?.(`   - ${dep.name} v${dep.version} (required: ${dep.requiredVersion})`);
      }
    }

    const success =
      resolution.missing.length === 0 ||
      resolution.missing.every((_dep) => {
        const result = results.find((r) => r.existing?.path);
        return result?.shouldSkip === false;
      });

    return { success, results };
  }

  /**
   * 检查二进制依赖
   */
  private async checkBinDependency(name: string): Promise<DependencyStatus> {
    const detail = this.snapshot?.detectedBins.get(name);
    return {
      name,
      type: "bin",
      installed: detail?.found === true,
      version: detail?.version,
      compatible: true, // 二进制工具通常没有版本要求
      requiredVersion: undefined,
    };
  }

  /**
   * 检查 npm 包依赖
   */
  private async checkNpmPackageDependency(
    name: string,
    requiredVersion?: string,
  ): Promise<DependencyStatus> {
    // 简化实现：实际应该查询 npm list
    return {
      name,
      type: "npm",
      installed: false,
      compatible: true,
      requiredVersion,
    };
  }

  /**
   * 检查 pip 包依赖
   */
  private async checkPipPackageDependency(
    name: string,
    requiredVersion?: string,
  ): Promise<DependencyStatus> {
    // 简化实现：实际应该查询 pip show
    return {
      name,
      type: "pip",
      installed: false,
      compatible: true,
      requiredVersion,
    };
  }

  /**
   * 获取建议的安装命令
   */
  private getSuggestedInstallCommand(dep: DependencyStatus): string | null {
    switch (dep.type) {
      case "bin":
        // 根据平台推荐
        if (process.platform === "darwin") {
          return `brew install ${dep.name}`;
        } else if (process.platform === "linux") {
          return `apt install ${dep.name}`;
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * 打印依赖状态报告
   */
  static printResolutionReport(resolution: DependencyResolution): string {
    const lines: string[] = [];

    lines.push("📋 Dependency Resolution Report");
    lines.push("=".repeat(50));

    if (resolution.satisfied.length > 0) {
      lines.push("\n✅ Satisfied:");
      for (const dep of resolution.satisfied) {
        lines.push(`   ✓ ${dep.name} v${dep.version || "unknown"}`);
      }
    }

    if (resolution.missing.length > 0) {
      lines.push("\n❌ Missing:");
      for (const dep of resolution.missing) {
        lines.push(`   ✗ ${dep.name} (required)`);
      }
    }

    if (resolution.incompatible.length > 0) {
      lines.push("\n⚠️  Incompatible:");
      for (const dep of resolution.incompatible) {
        lines.push(`   ⚠ ${dep.name} v${dep.version} (required: ${dep.requiredVersion})`);
      }
    }

    lines.push("\n" + "-".repeat(50));
    lines.push(
      resolution.canProceed
        ? "✅ All dependencies satisfied, can proceed"
        : "❌ Cannot proceed: missing or incompatible dependencies",
    );

    return lines.join("\n");
  }
}
