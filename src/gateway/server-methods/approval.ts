// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * 审批流程 Gateway RPC Handlers
 *
 * 架构说明（以上游为准，兼顾本地优秀实践）：
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ approval.create / approve / reject / cancel             │  ← 我们的 Agent 工具层（保留业务语义字段）
 * │         │                  │                            │
 * │         ▼                  ▼                            │
 * │ plugin.approval.request   plugin.approval.resolve       │  ← upstream 实时引擎（ExecApprovalManager）
 * │         │                  │                            │
 * │         ▼                  ▼                            │
 * │       JSONL 审计持久化层（onApprovalEvent 写入）         │  ← 我们的持久化优势
 * │                                                         │
 * │ approval.list / stats / list_pending / get_status       │  ← 纯查询层（读 JSONL + 内存镜像）
 * └─────────────────────────────────────────────────────────┘
 *
 * 关键对抗点修复：
 *  1. approval.create → plugin.approval.request：获得超时、Promise等待、forwarder推送、广播事件
 *  2. approval.approve/reject → plugin.approval.resolve：决策走 ExecApprovalManager，agent 协程真正解除阻塞
 *  3. 持久化通过监听 plugin.approval.requested/resolved 事件写入 JSONL，与实时引擎解耦
 *  4. approval.cancel → plugin.approval.resolve(deny)：统一决策通道
 *  5. approval.get_status → 同时查 JSONL（历史）+ manager 快照（运行中）
 */

import { existsSync } from "node:fs";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import type { PluginApprovalRequestPayload } from "../../../upstream/src/infra/plugin-approvals.js";
import { DEFAULT_PLUGIN_APPROVAL_TIMEOUT_MS } from "../../../upstream/src/infra/plugin-approvals.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import type { ExecApprovalManager } from "../exec-approval-manager.js";

// ===== 模块级单例：由 server.impl.ts 在启动时注入 =====
let _pluginApprovalManager: ExecApprovalManager<PluginApprovalRequestPayload> | null = null;

export function setActivePluginApprovalManager(
  manager: ExecApprovalManager<PluginApprovalRequestPayload>,
): void {
  _pluginApprovalManager = manager;
}

function getPluginApprovalManager(): ExecApprovalManager<PluginApprovalRequestPayload> | null {
  return _pluginApprovalManager;
}

// ===== 数据目录：兼容 OPENCLAW_STATE_DIR 环境变量 =====
const DATA_DIR = (() => {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return join(override, "gateway");
  }
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return join(home, ".config", "openclaw", "gateway");
})();

const APPROVAL_STORE_PATH = join(DATA_DIR, "approvals.jsonl");

// ===== 审计日志数据结构（持久化格式） =====

/**
 * 审批决策值（对齐 upstream ExecApprovalDecision + 我们的业务语义）
 * - allow-once / allow-always / deny → upstream 的实时决策
 * - approved / rejected / cancelled / pending → 我们的业务视图（映射自上面）
 */
type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

/** 持久化审计记录（append-only JSONL） */
interface ApprovalAuditRecord {
  /** plugin.approval.request 返回的 ID（plugin: 前缀） */
  id: string;
  /** 发起人 agent ID */
  requesterId: string;
  requesterName?: string;
  /** 指定审批人（可选，业务层语义） */
  approverId?: string;
  approverName?: string;
  /** 工具名称（业务层语义） */
  toolName: string;
  toolArgs: Record<string, unknown>;
  /** 申请原因 */
  reason: string;
  /** 审批权限等级（1-10） */
  approvalLevel: number;
  /** 当前状态（业务视图） */
  status: ApprovalStatus;
  /** 实时引擎的原始决策值 */
  rawDecision?: string | null;
  /** 审批人（实际操作人） */
  resolvedBy?: string | null;
  approverComment?: string;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  expiresAtMs?: number;
}

// ===== 持久化存储层 =====

const approvalCache = new Map<string, ApprovalAuditRecord>();
let storeLoaded = false;

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadApprovalStore(): Promise<void> {
  if (storeLoaded) {
    return;
  }
  storeLoaded = true;
  try {
    if (!existsSync(APPROVAL_STORE_PATH)) {
      return;
    }
    const content = await readFile(APPROVAL_STORE_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const record = JSON.parse(trimmed) as ApprovalAuditRecord;
        if (record?.id) {
          approvalCache.set(record.id, record);
        }
      } catch {
        // 跳过损坏行
      }
    }
  } catch (err) {
    console.warn("[Approval] Failed to load approval store:", err);
  }
}

async function persistRecord(record: ApprovalAuditRecord): Promise<void> {
  try {
    await ensureDataDir();
    await appendFile(APPROVAL_STORE_PATH, JSON.stringify(record) + "\n", "utf-8");
  } catch (err) {
    console.error("[Approval] Failed to persist record:", err);
  }
}

async function upsertRecord(record: ApprovalAuditRecord): Promise<void> {
  await loadApprovalStore();
  approvalCache.set(record.id, record);
  await persistRecord(record);
}

/**
 * 将 upstream 决策值映射为业务状态
 */
function decisionToStatus(decision: string | null | undefined): Exclude<ApprovalStatus, "pending"> {
  if (decision === "allow-once" || decision === "allow-always") {
    return "approved";
  }
  if (decision === "deny") {
    return "rejected";
  }
  return "expired";
}

/**
 * 供外部（server.impl.ts / 事件监听）调用：
 * 当 plugin.approval.requested 事件发生时，将请求写入审计日志。
 */
export async function onApprovalRequested(params: {
  id: string;
  request: PluginApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
  /** 额外的业务层字段，由 approval.create 调用时附带 */
  meta?: {
    requesterId?: string;
    requesterName?: string;
    approverId?: string;
    approverName?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    reason?: string;
    approvalLevel?: number;
  };
}): Promise<void> {
  const meta = params.meta ?? {};
  const record: ApprovalAuditRecord = {
    id: params.id,
    requesterId: meta.requesterId ?? params.request.agentId ?? "unknown",
    requesterName: meta.requesterName,
    approverId: meta.approverId,
    approverName: meta.approverName,
    toolName: meta.toolName ?? params.request.toolName ?? params.request.title ?? "unknown",
    toolArgs: meta.toolArgs ?? {},
    reason: meta.reason ?? params.request.description ?? "",
    approvalLevel: meta.approvalLevel ?? 5,
    status: "pending",
    createdAt: params.createdAtMs,
    updatedAt: params.createdAtMs,
    expiresAtMs: params.expiresAtMs,
  };
  await upsertRecord(record);
}

/**
 * 供外部（server.impl.ts / 事件监听）调用：
 * 当 plugin.approval.resolved 事件发生时，更新审计日志。
 */
export async function onApprovalResolved(params: {
  id: string;
  decision: string | null;
  resolvedBy?: string | null;
  ts: number;
  request?: PluginApprovalRequestPayload;
}): Promise<void> {
  await loadApprovalStore();
  const existing = approvalCache.get(params.id);
  const now = params.ts;
  const status = decisionToStatus(params.decision);
  const updated: ApprovalAuditRecord = {
    ...(existing ?? {
      id: params.id,
      requesterId: params.request?.agentId ?? "unknown",
      toolName: params.request?.toolName ?? params.request?.title ?? "unknown",
      toolArgs: {},
      reason: params.request?.description ?? "",
      approvalLevel: 5,
      createdAt: now,
      expiresAtMs: now,
    }),
    status,
    rawDecision: params.decision,
    resolvedBy: params.resolvedBy,
    updatedAt: now,
    ...(status === "approved" ? { approvedAt: now } : {}),
    ...(status === "rejected" ? { rejectedAt: now } : {}),
  };
  await upsertRecord(updated);
}

// ===== Gateway RPC Handlers =====

export const approvalHandlers: GatewayRequestHandlers = {
  /**
   * approval.create - 创建审批请求
   *
   * 桥接到 plugin.approval.request，获得：
   * - ExecApprovalManager 的 Promise 等待语义（agent 协程真正挂起）
   * - 超时自动 deny
   * - forwarder 跨渠道推送（Telegram/Discord bot 按钮）
   * - 广播事件（plugin.approval.requested）
   *
   * 额外保留的业务字段（toolName/toolArgs/reason/approvalLevel/approverId）
   * 通过 description 字段携带，并在 onApprovalRequested 写入审计日志。
   */
  "approval.create": async ({ params, respond, context }) => {
    const manager = getPluginApprovalManager();
    if (!manager) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "approval manager not ready"));
      return;
    }

    try {
      const requesterId = normalizeAgentId(String(params.requesterId || ""));
      const requesterName = String(params.requesterName || "");
      const approverId = params.approverId
        ? normalizeAgentId(String(params.approverId))
        : undefined;
      const approverName = params.approverName ? String(params.approverName) : undefined;
      const toolName = String(params.toolName || "");
      const toolArgs = (params.toolArgs as Record<string, unknown>) || {};
      const reason = String(params.reason || "");
      const approvalLevel = typeof params.approvalLevel === "number" ? params.approvalLevel : 5;
      const timeoutMs =
        typeof params.timeoutMs === "number"
          ? params.timeoutMs
          : DEFAULT_PLUGIN_APPROVAL_TIMEOUT_MS;

      if (!requesterId || !toolName) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "requesterId and toolName are required"),
        );
        return;
      }

      // 构造 plugin.approval.request 的 payload
      const pluginRequest: PluginApprovalRequestPayload = {
        pluginId: null,
        title: toolName,
        description: `[${requesterId}] ${reason}\n\nArgs: ${JSON.stringify(toolArgs)}`,
        severity: approvalLevel >= 8 ? "critical" : approvalLevel >= 5 ? "warning" : "info",
        toolName,
        toolCallId: null,
        agentId: requesterId,
        sessionKey: null,
        turnSourceChannel: null,
        turnSourceTo: approverId ?? null,
        turnSourceAccountId: null,
        turnSourceThreadId: null,
      };

      // 使用 plugin: 前缀 ID（与 exec: 区分，/approve 路由可识别）
      const { randomUUID } = await import("node:crypto");
      const approvalId = `plugin:${randomUUID()}`;
      const record = manager.create(pluginRequest, timeoutMs, approvalId);

      let decisionPromise: Promise<string | null>;
      try {
        decisionPromise = manager.register(record, timeoutMs);
      } catch (err) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `registration failed: ${String(err)}`),
        );
        return;
      }

      // 广播事件（前端实时感知）
      context.broadcast(
        "plugin.approval.requested",
        {
          id: record.id,
          request: record.request,
          createdAtMs: record.createdAtMs,
          expiresAtMs: record.expiresAtMs,
        },
        { dropIfSlow: true },
      );

      // 写入审计日志（携带业务字段）
      void onApprovalRequested({
        id: record.id,
        request: record.request,
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
        meta: {
          requesterId,
          requesterName,
          approverId,
          approverName,
          toolName,
          toolArgs,
          reason,
          approvalLevel,
        },
      }).catch((err) => console.error("[Approval] audit write failed:", err));

      // 立即返回 accepted（twoPhase 模式），agent 可通过 approval.get_status 轮询或等待事件
      respond(true, {
        success: true,
        approvalId: record.id,
        status: "pending",
        createdAtMs: record.createdAtMs,
        expiresAtMs: record.expiresAtMs,
        message: `Approval request submitted: ${record.id}`,
      });

      // 后台等待决策，决策完成后写审计日志
      void decisionPromise
        .then((decision) => {
          void onApprovalResolved({
            id: record.id,
            decision,
            resolvedBy: null,
            ts: Date.now(),
            request: record.request,
          }).catch((err) => console.error("[Approval] audit resolve failed:", err));
        })
        .catch(() => {});
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.approve - 批准审批请求
   *
   * 桥接到 plugin.approval.resolve(allow-once)，解除 agent 协程阻塞。
   */
  "approval.approve": async ({ params, respond, context }) => {
    const manager = getPluginApprovalManager();
    if (!manager) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "approval manager not ready"));
      return;
    }
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = String(params.approverId || "");
      const comment = String(params.comment || "");

      if (!approvalId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId is required"));
        return;
      }

      const resolvedId = manager.lookupPendingId(approvalId);
      if (resolvedId.kind === "none") {
        // 可能已过期，仍尝试更新 JSONL 状态（幂等处理）
        await loadApprovalStore();
        const cached = approvalCache.get(approvalId);
        if (!cached || cached.status !== "pending") {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Approval ${approvalId} not found or already resolved`,
            ),
          );
          return;
        }
      }

      if (resolvedId.kind === "ambiguous") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "ambiguous approval id, use full id"),
        );
        return;
      }

      const targetId = resolvedId.kind !== "none" ? resolvedId.id : approvalId;
      const snapshot = manager.getSnapshot(targetId);
      const ok = manager.resolve(targetId, "allow-once", approverId || null);

      if (ok) {
        context.broadcast(
          "plugin.approval.resolved",
          {
            id: targetId,
            decision: "allow-once",
            resolvedBy: approverId,
            ts: Date.now(),
            request: snapshot?.request,
          },
          { dropIfSlow: true },
        );
      }

      // 更新审计日志
      await onApprovalResolved({
        id: targetId,
        decision: "allow-once",
        resolvedBy: approverId || null,
        ts: Date.now(),
        request: snapshot?.request,
      });

      // 写入审批人注释
      if (comment) {
        await loadApprovalStore();
        const cached = approvalCache.get(targetId);
        if (cached) {
          cached.approverComment = comment;
          await persistRecord(cached);
        }
      }

      respond(true, { success: true, message: `Approval ${targetId} approved`, ok });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.reject - 拒绝审批请求
   *
   * 桥接到 plugin.approval.resolve(deny)。
   */
  "approval.reject": async ({ params, respond, context }) => {
    const manager = getPluginApprovalManager();
    if (!manager) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "approval manager not ready"));
      return;
    }
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = String(params.approverId || "");
      const comment = String(params.comment || "");

      if (!approvalId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId is required"));
        return;
      }

      const resolvedId = manager.lookupPendingId(approvalId);
      if (resolvedId.kind === "none") {
        await loadApprovalStore();
        const cached = approvalCache.get(approvalId);
        if (!cached || cached.status !== "pending") {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Approval ${approvalId} not found or already resolved`,
            ),
          );
          return;
        }
      }

      if (resolvedId.kind === "ambiguous") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "ambiguous approval id, use full id"),
        );
        return;
      }

      const targetId = resolvedId.kind !== "none" ? resolvedId.id : approvalId;
      const snapshot = manager.getSnapshot(targetId);
      const ok = manager.resolve(targetId, "deny", approverId || null);

      if (ok) {
        context.broadcast(
          "plugin.approval.resolved",
          {
            id: targetId,
            decision: "deny",
            resolvedBy: approverId,
            ts: Date.now(),
            request: snapshot?.request,
          },
          { dropIfSlow: true },
        );
      }

      const now = Date.now();
      await onApprovalResolved({
        id: targetId,
        decision: "deny",
        resolvedBy: approverId || null,
        ts: now,
        request: snapshot?.request,
      });

      if (comment) {
        await loadApprovalStore();
        const cached = approvalCache.get(targetId);
        if (cached) {
          cached.approverComment = comment;
          await persistRecord(cached);
        }
      }

      respond(true, { success: true, message: `Approval ${targetId} rejected`, ok });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.cancel - 取消审批请求（只有发起人可操作）
   *
   * 桥接到 plugin.approval.resolve(deny)，语义上等同于发起人撤回。
   */
  "approval.cancel": async ({ params, respond, context }) => {
    const manager = getPluginApprovalManager();
    if (!manager) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "approval manager not ready"));
      return;
    }
    try {
      const approvalId = String(params.approvalId || "");
      const requesterId = normalizeAgentId(String(params.requesterId || ""));

      if (!approvalId || !requesterId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and requesterId are required"),
        );
        return;
      }

      // 校验发起人身份（从审计日志）
      await loadApprovalStore();
      const cached = approvalCache.get(approvalId);
      if (cached && cached.requesterId !== requesterId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Only the requester can cancel the request"),
        );
        return;
      }

      const resolvedId = manager.lookupPendingId(approvalId);
      const targetId =
        resolvedId.kind !== "none" && resolvedId.kind !== "ambiguous" ? resolvedId.id : approvalId;

      const snapshot = manager.getSnapshot(targetId);
      const ok = manager.resolve(targetId, "deny", `cancelled-by:${requesterId}`);

      if (ok) {
        context.broadcast(
          "plugin.approval.resolved",
          {
            id: targetId,
            decision: "deny",
            resolvedBy: requesterId,
            ts: Date.now(),
            request: snapshot?.request,
          },
          { dropIfSlow: true },
        );
      }

      // 写入取消状态（覆盖 rejected → cancelled）
      const now = Date.now();
      const existing = approvalCache.get(targetId);
      if (existing) {
        const cancelRecord: ApprovalAuditRecord = {
          ...existing,
          status: "cancelled",
          rawDecision: "deny",
          resolvedBy: requesterId,
          updatedAt: now,
          rejectedAt: now,
        };
        await upsertRecord(cancelRecord);
      }

      respond(true, { success: true, message: `Approval ${targetId} cancelled`, ok });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.get_status - 获取审批状态
   *
   * 同时查询运行中快照（ExecApprovalManager）和审计日志（JSONL），
   * 返回最新状态。
   */
  "approval.get_status": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      if (!approvalId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId is required"));
        return;
      }

      await loadApprovalStore();
      const cached = approvalCache.get(approvalId);

      // 同时检查运行中快照
      const manager = getPluginApprovalManager();
      const snapshot = manager?.getSnapshot(approvalId) ?? null;

      if (!cached && !snapshot) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Approval ${approvalId} not found`),
        );
        return;
      }

      respond(true, {
        success: true,
        request: cached ?? null,
        liveSnapshot: snapshot
          ? {
              id: snapshot.id,
              decision: snapshot.decision ?? null,
              resolvedAtMs: snapshot.resolvedAtMs ?? null,
              expiresAtMs: snapshot.expiresAtMs,
            }
          : null,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.list - 全量查询审批记录（支持 status 过滤、分页）
   */
  "approval.list": async ({ params, respond }) => {
    try {
      await loadApprovalStore();
      const statusFilter = params.status ? String(params.status) : "all";
      const limit = typeof params.limit === "number" ? params.limit : 100;
      const offset = typeof params.offset === "number" ? params.offset : 0;

      let results = Array.from(approvalCache.values());
      if (statusFilter !== "all") {
        results = results.filter((r) => r.status === statusFilter);
      }
      results = results.toSorted((a, b) => b.createdAt - a.createdAt);
      const total = results.length;
      respond(true, { success: true, total, requests: results.slice(offset, offset + limit) });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.list_pending - 列出待审批请求（支持按审批人过滤）
   */
  "approval.list_pending": async ({ params, respond }) => {
    try {
      await loadApprovalStore();
      const approverId = params.approverId
        ? normalizeAgentId(String(params.approverId))
        : undefined;

      const pending = Array.from(approvalCache.values())
        .filter((req) => {
          if (req.status !== "pending") {
            return false;
          }
          if (approverId && req.approverId && req.approverId !== approverId) {
            return false;
          }
          return true;
        })
        .toSorted((a, b) => b.createdAt - a.createdAt);

      respond(true, { success: true, total: pending.length, requests: pending });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.stats - 审批统计
   */
  "approval.stats": async ({ respond }) => {
    try {
      await loadApprovalStore();
      const all = Array.from(approvalCache.values());
      const byStatus = (s: ApprovalStatus) => all.filter((r) => r.status === s).length;
      const processed = all.filter((r) => r.approvedAt ?? r.rejectedAt);
      const avgApprovalTime =
        processed.length > 0
          ? processed.reduce((sum, r) => {
              const endAt = r.approvedAt ?? r.rejectedAt ?? r.updatedAt;
              return sum + (endAt - r.createdAt);
            }, 0) / processed.length
          : 0;

      respond(true, {
        success: true,
        pending: byStatus("pending"),
        approved: byStatus("approved"),
        rejected: byStatus("rejected"),
        cancelled: byStatus("cancelled"),
        expired: byStatus("expired"),
        avgApprovalTime,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
