/**
 * 环境检测与依赖管理 RPC Handlers
 *
 * 提供给 AI Agent 调用的环境检测和依赖管理工具
 */

import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { DependencyManager } from "../../infra/dependency-manager.js";
import { detectBinariesBatch } from "../../infra/detect-binary.js";
import {
  getEnvironmentSnapshot,
  getToolDetail,
  printSnapshotSummary,
} from "../../infra/environment-snapshot.js";
import { interceptInstall, parseInstallCommand } from "../../infra/install-interceptor.js";

/**
 * 环境检测与依赖管理 RPC Handlers
 */
export const environmentDetectionHandlers: GatewayRequestHandlers = {
  /**
   * env.detect_tool - 检测单个工具是否安装
   *
   * 用法：
   * ```typescript
   * await rpc.call("env.detect_tool", { toolName: "mysql" });
   * ```
   */
  "env.detect_tool": async ({ params, respond }) => {
    try {
      const toolName = typeof params?.toolName === "string" ? params.toolName : "";

      if (!toolName) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "toolName 是必填参数"));
        return;
      }

      const detail = await getToolDetail(toolName);

      respond(
        true,
        {
          toolName,
          found: detail?.found === true,
          path: detail?.path,
          version: detail?.version,
          versionRaw: detail?.versionRaw,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to detect tool: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * env.detect_tools_batch - 批量检测多个工具
   *
   * 用法：
   * ```typescript
   * await rpc.call("env.detect_tools_batch", { toolNames: ["mysql", "psql", "redis-cli"] });
   * ```
   */
  "env.detect_tools_batch": async ({ params, respond }) => {
    try {
      const toolNames = Array.isArray(params?.toolNames) ? (params.toolNames as string[]) : [];

      if (toolNames.length === 0) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "toolNames 不能为空"));
        return;
      }

      const results = await detectBinariesBatch(toolNames);
      const resultObj: Record<string, unknown> = {};

      for (const [name, detail] of results) {
        resultObj[name] = detail;
      }

      respond(
        true,
        {
          tools: resultObj,
          totalChecked: toolNames.length,
          foundCount: Array.from(results.values()).filter((r) => r.found).length,
          missingCount: Array.from(results.values()).filter((r) => !r.found).length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to detect tools: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * env.get_snapshot - 获取环境快照
   *
   * 用法：
   * ```typescript
   * await rpc.call("env.get_snapshot", {});
   * ```
   */
  "env.get_snapshot": async ({ params: _params, respond }) => {
    try {
      const snapshot = await getEnvironmentSnapshot();
      const summary = printSnapshotSummary(snapshot);

      respond(
        true,
        {
          snapshot: {
            systemInfo: snapshot.systemInfo,
            scannedAt: snapshot.scannedAt,
            expiresAt: snapshot.expiresAt,
            toolsFound: Array.from(snapshot.detectedBins.entries())
              .filter(([, r]) => r.found)
              .map(([name, r]) => ({ name, version: r.version, path: r.path })),
            toolsMissing: Array.from(snapshot.detectedBins.entries())
              .filter(([, r]) => !r.found)
              .map(([name]) => name),
          },
          summary,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to get snapshot: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * env.check_install - 检查安装命令（智能拦截）
   *
   * 用法：
   * ```typescript
   * const result = await rpc.call("env.check_install", {
   *   command: "npm install mysql2@^3.0.0"
   * });
   *
   * if (result.shouldSkip) {
   *   console.log("已安装，跳过");
   * } else {
   *   // 执行安装
   * }
   * ```
   */
  "env.check_install": async ({ params, respond }) => {
    try {
      const command = typeof params?.command === "string" ? params.command : "";

      if (!command) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command 是必填参数"));
        return;
      }

      const result = await interceptInstall(command);

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to check install: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * env.resolve_dependencies - 解析并安装依赖
   *
   * 用法：
   * ```typescript
   * await rpc.call("env.resolve_dependencies", {
   *   dependencies: {
   *     bins: ["mysql", "redis-cli"],
   *     npmPackages: [{ name: "mysql2", version: "^3.0.0" }]
   *   }
   * });
   * ```
   */
  "env.resolve_dependencies": async ({ params, respond }) => {
    try {
      const dependencies = params?.dependencies as Record<string, unknown> | undefined;

      if (!dependencies) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "dependencies 是必填参数"),
        );
        return;
      }

      const manager = new DependencyManager();
      const resolution = await manager.resolveDependencies(dependencies);
      const report = DependencyManager.printResolutionReport(resolution);

      respond(
        true,
        {
          resolution: {
            canProceed: resolution.canProceed,
            satisfiedCount: resolution.satisfied.length,
            missingCount: resolution.missing.length,
            incompatibleCount: resolution.incompatible.length,
            satisfied: resolution.satisfied,
            missing: resolution.missing,
            incompatible: resolution.incompatible,
          },
          report,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to resolve dependencies: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * env.parse_install_command - 解析安装命令
   *
   * 用法：
   * ```typescript
   * const parsed = await rpc.call("env.parse_install_command", {
   *   command: "npm install mysql2@^3.0.0"
   * });
   * ```
   */
  "env.parse_install_command": async ({ params, respond }) => {
    try {
      const command = typeof params?.command === "string" ? params.command : "";

      if (!command) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command 是必填参数"));
        return;
      }

      const parsed = parseInstallCommand(command);

      respond(
        true,
        {
          parsed: parsed || null,
          success: parsed !== null,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to parse command: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },
};
