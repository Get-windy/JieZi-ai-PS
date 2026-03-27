/**
 * Workspace Hygiene RPC Methods
 *
 * 提供工作空间卫生检查的 RPC 接口：
 *   - workspace.hygiene.run   — 立即执行一次完整自检，返回报告
 *   - workspace.hygiene.status — 获取最近一次缓存的自检报告（5分钟内有效）
 */

import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { triggerHygieneNow } from "../../cron/memory-hygiene-scheduler.js";
import { runAndCacheHygiene, getCachedHygieneReport } from "../../workspace/workspace-hygiene.js";

export const workspaceHygieneHandlers: GatewayRequestHandlers = {
  /**
   * 立即触发一次完整工作空间自检，返回检查报告
   *
   * 可选参数：
   *   - groupsRoot: string  — 覆盖默认 groups 根目录路径（调试用）
   */
  "workspace.hygiene.run": async ({ params, respond }) => {
    try {
      const groupsRoot = params?.groupsRoot
        ? String(params.groupsRoot as string | number | boolean | null | undefined).trim()
        : undefined;
      const report = groupsRoot ? runAndCacheHygiene(groupsRoot) : await triggerHygieneNow();
      respond(true, report, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Workspace hygiene check failed: ${String(error)}`),
      );
    }
  },

  /**
   * 获取最近一次缓存的自检报告
   *
   * 若 5 分钟内没有执行过自检，则立即执行一次并返回结果
   */
  "workspace.hygiene.status": async ({ respond }) => {
    try {
      const cached = getCachedHygieneReport();
      if (cached) {
        respond(true, { ...cached, fromCache: true }, undefined);
      } else {
        // 缓存已过期，立即执行一次
        const fresh = runAndCacheHygiene();
        respond(true, { ...fresh, fromCache: false }, undefined);
      }
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get hygiene status: ${String(error)}`),
      );
    }
  },
};
