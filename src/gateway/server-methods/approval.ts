// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * 审批流程 Gateway RPC Handlers
 *
 * 提供审批请求的创建、审批、查询功能
 * 使用 JSONL 持久化存储（与 PermissionMiddleware 共享历史日志体系）
 */

import { existsSync } from "node:fs";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// 数据目录：兼容 OPENCLAW_STATE_DIR 环境变量
const DATA_DIR = (() => {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return join(override, "gateway");
  }
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return join(home, ".config", "openclaw", "gateway");
})();

const APPROVAL_STORE_PATH = join(DATA_DIR, "approvals.jsonl");

/**
 * 审批请求状态
 */
type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

/**
 * 审批请求（持久化格式）
 */
interface ApprovalRequest {
  id: string;
  requesterId: string;
  requesterName?: string;
  approverId?: string;
  approverName?: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  reason: string;
  status: ApprovalStatus;
  approvalLevel: number; // 1-10，数字越大需要的权限越高
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  approverComment?: string;
}

// ===== 持久化存储层 =====

/** 内存缓存（进程内快速查询） */
const approvalCache = new Map<string, ApprovalRequest>();
let storeLoaded = false;

/** 确保数据目录存在 */
async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * 从 JSONL 文件加载所有审批记录到内存缓存
 * 每个 ID 只保留最新版本（状态覆盖）
 */
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
        const record = JSON.parse(trimmed) as ApprovalRequest;
        if (record?.id) {
          approvalCache.set(record.id, record);
        }
      } catch {
        // 跳过损坏行
      }
    }
    console.log(`[Approval] Loaded ${approvalCache.size} approval records from store`);
  } catch (err) {
    console.warn("[Approval] Failed to load approval store:", err);
  }
}

/**
 * 将单条审批记录追加写入 JSONL 文件
 * JSONL 采用 append-only，最新状态追加在文件末尾；读取时以最后一条为准
 */
async function persistApproval(request: ApprovalRequest): Promise<void> {
  try {
    await ensureDataDir();
    const line = JSON.stringify(request) + "\n";
    await appendFile(APPROVAL_STORE_PATH, line, "utf-8");
  } catch (err) {
    console.error("[Approval] Failed to persist approval:", err);
  }
}

/** 获取全量缓存（确保已加载） */
async function getApprovalById(id: string): Promise<ApprovalRequest | undefined> {
  await loadApprovalStore();
  return approvalCache.get(id);
}

/** 保存并持久化 */
async function saveApproval(request: ApprovalRequest): Promise<void> {
  await loadApprovalStore();
  approvalCache.set(request.id, request);
  await persistApproval(request);
}

/**
 * 生成审批请求ID
 */
function generateApprovalId(): string {
  return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const approvalHandlers: GatewayRequestHandlers = {
  /**
   * approval.create - 创建审批请求
   */
  "approval.create": async ({ params, respond }) => {
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

      if (!requesterId || !toolName) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "requesterId and toolName are required"),
        );
        return;
      }

      const approvalId = generateApprovalId();
      const now = Date.now();

      const request: ApprovalRequest = {
        id: approvalId,
        requesterId,
        requesterName,
        approverId,
        approverName,
        toolName,
        toolArgs,
        reason,
        status: "pending",
        approvalLevel,
        createdAt: now,
        updatedAt: now,
      };

      await saveApproval(request);

      console.log(
        `[Approval] Created request ${approvalId} from ${requesterName || requesterId} for ${toolName}`,
      );

      respond(true, {
        success: true,
        approvalId,
        message: `Approval request created: ${approvalId}`,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.approve - 批准审批请求
   */
  "approval.approve": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = normalizeAgentId(String(params.approverId || ""));
      const comment = String(params.comment || "");

      if (!approvalId || !approverId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and approverId are required"),
        );
        return;
      }

      const request = await getApprovalById(approvalId);
      if (!request) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`),
        );
        return;
      }

      if (request.status !== "pending") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Approval request ${approvalId} is already ${request.status}`,
          ),
        );
        return;
      }

      const now = Date.now();
      const updated: ApprovalRequest = {
        ...request,
        status: "approved",
        updatedAt: now,
        approvedAt: now,
        approverId,
        approverComment: comment,
      };

      await saveApproval(updated);

      console.log(`[Approval] Approved ${approvalId} by ${approverId}`);

      respond(true, {
        success: true,
        message: `Approval request ${approvalId} approved`,
        request: updated,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.reject - 拒绝审批请求
   */
  "approval.reject": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");
      const approverId = normalizeAgentId(String(params.approverId || ""));
      const comment = String(params.comment || "");

      if (!approvalId || !approverId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approvalId and approverId are required"),
        );
        return;
      }

      const request = await getApprovalById(approvalId);
      if (!request) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`),
        );
        return;
      }

      if (request.status !== "pending") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Approval request ${approvalId} is already ${request.status}`,
          ),
        );
        return;
      }

      const now = Date.now();
      const updated: ApprovalRequest = {
        ...request,
        status: "rejected",
        updatedAt: now,
        rejectedAt: now,
        approverId,
        approverComment: comment,
      };

      await saveApproval(updated);

      console.log(`[Approval] Rejected ${approvalId} by ${approverId}`);

      respond(true, {
        success: true,
        message: `Approval request ${approvalId} rejected`,
        request: updated,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.list_pending - 列出待审批请求
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

      respond(true, {
        success: true,
        total: pending.length,
        requests: pending,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.get_status - 获取审批状态
   */
  "approval.get_status": async ({ params, respond }) => {
    try {
      const approvalId = String(params.approvalId || "");

      if (!approvalId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approvalId is required"));
        return;
      }

      const request = await getApprovalById(approvalId);
      if (!request) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`),
        );
        return;
      }

      respond(true, {
        success: true,
        request,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },

  /**
   * approval.cancel - 取消审批请求
   */
  "approval.cancel": async ({ params, respond }) => {
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

      const request = await getApprovalById(approvalId);
      if (!request) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Approval request ${approvalId} not found`),
        );
        return;
      }

      if (request.requesterId !== requesterId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Only the requester can cancel the request"),
        );
        return;
      }

      if (request.status !== "pending") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Approval request ${approvalId} is already ${request.status}`,
          ),
        );
        return;
      }

      const updated: ApprovalRequest = {
        ...request,
        status: "cancelled",
        updatedAt: Date.now(),
      };

      await saveApproval(updated);

      console.log(`[Approval] Cancelled ${approvalId} by ${requesterId}`);

      respond(true, {
        success: true,
        message: `Approval request ${approvalId} cancelled`,
        request: updated,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
