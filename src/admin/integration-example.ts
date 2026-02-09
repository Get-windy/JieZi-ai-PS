/**
 * Phase 7 与 Phase 3 集成示例
 *
 * 展示如何结合使用权限系统和超级管理员审批系统
 */

import type { AgentPermissionsConfig } from "../config/types.permissions.js";
import type { AdminConfig, SuperAdminRole } from "./types.js";
import { initializePhase7, phase7Integration } from "./phase7-integration.js";

/**
 * 示例：初始化完整的管理员和权限系统
 */
export function initializeAdminAndPermissionSystem() {
  // 1. 配置超级管理员
  const adminConfig: AdminConfig = {
    superAdmins: [
      {
        id: "admin-001",
        userId: "user-001",
        role: "system-admin",
        name: "System Administrator",
        email: "admin@example.com",
        phone: "+1234567890",
        permissions: ["*"], // 所有权限
        isActive: true,
        isOnline: false,
        mfaEnabled: true,
        mfaMethod: "totp",
        createdAt: Date.now(),
        createdBy: "system",
      },
      {
        id: "admin-002",
        userId: "user-002",
        role: "security-admin",
        name: "Security Administrator",
        email: "security@example.com",
        permissions: ["permission.manage", "approval.manage", "audit.view"],
        isActive: true,
        isOnline: false,
        mfaEnabled: true,
        mfaMethod: "totp",
        createdAt: Date.now(),
        createdBy: "admin-001",
      },
    ],
    approvalPolicies: [
      {
        id: "policy-001",
        name: "Agent Deletion Approval",
        description: "智能助手删除需要审批",
        appliesTo: {
          operations: ["agent_delete"],
        },
        approvalConfig: {
          approvers: [
            { type: "user", id: "admin-001", name: "System Admin" },
            { type: "user", id: "admin-002", name: "Security Admin" },
          ],
          requiredApprovals: 1, // 任意一个批准即可
          timeout: 3600, // 1小时超时
          timeoutAction: "reject",
        },
        enabled: true,
        priority: 100,
        createdAt: Date.now(),
        createdBy: "admin-001",
      },
      {
        id: "policy-002",
        name: "Permission Grant Approval",
        description: "权限授予需要审批",
        appliesTo: {
          operations: ["permission_grant"],
        },
        approvalConfig: {
          approvers: [{ type: "user", id: "admin-001", name: "System Admin" }],
          requiredApprovals: 1,
          timeout: 7200,
          timeoutAction: "reject",
        },
        enabled: true,
        priority: 90,
        createdAt: Date.now(),
        createdBy: "admin-001",
      },
    ],
    defaultApprovalConfig: {
      approvers: [{ type: "user", id: "admin-001", name: "System Admin" }],
      requiredApprovals: 1,
      timeout: 3600,
      timeoutAction: "reject",
    },
    sessionTimeout: 3600, // 1小时
    sessionExtensionAllowed: true,
    maxConcurrentSessions: 3,
    requireMfa: true,
    ipWhitelistEnabled: false,
    auditRetentionDays: 90,
    detailedAuditLogging: true,
    notificationChannels: ["email", "slack"],
    emergencyAccessEnabled: true,
    emergencyAccessMaxDuration: 7200, // 2小时
  };

  // 2. 配置通知渠道
  const notificationConfig = {
    email: {
      enabled: true,
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      from: "noreply@example.com",
    },
    slack: {
      enabled: true,
      webhookUrl: "https://hooks.slack.com/services/xxx",
      channel: "#admin-alerts",
    },
  };

  // 3. 初始化 Phase 7
  initializePhase7({
    adminConfig,
    notificationConfig,
  });

  console.log("✅ Admin and Permission System initialized successfully");
}

/**
 * 示例：管理员登录流程
 */
export async function exampleAdminLogin() {
  const result = await phase7Integration.adminLoginWorkflow({
    adminId: "admin-001",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0...",
    mfaCode: "123456",
  });

  if (result.success) {
    console.log("✅ Admin logged in successfully");
    console.log("Session ID:", result.session?.id);
  } else {
    console.error("❌ Login failed:", result.error);
  }

  return result;
}

/**
 * 示例：创建需要审批的操作
 */
export async function exampleCreateApprovalRequest() {
  // 管理员请求删除智能助手
  const request = await phase7Integration.createApprovalRequest({
    requester: { type: "user", id: "admin-002", name: "Security Admin" },
    requestedAction: "agent_delete",
    targetType: "agent",
    targetId: "agent-123",
    title: "Delete Inactive Agent",
    description: "Request to delete agent-123 due to inactivity",
    reason: "Agent has been inactive for 90 days",
    priority: "normal",
  });

  console.log("✅ Approval request created:", request.id);
  console.log("Status:", request.status);
  console.log("Approvers:", request.approvers.map((a) => a.name).join(", "));

  return request;
}

/**
 * 示例：处理审批
 */
export async function exampleProcessApproval(requestId: string) {
  // 系统管理员批准请求
  const result = await phase7Integration.processApprovalDecision({
    requestId,
    approver: { type: "user", id: "admin-001", name: "System Admin" },
    decision: "approve",
    comment: "Approved. Inactivity confirmed.",
    timestamp: Date.now(),
  });

  console.log("✅ Approval processed");
  console.log("Final status:", result.status);

  if (result.status === "approved") {
    console.log("🎉 Request approved! Operation can proceed.");
  }

  return result;
}

/**
 * 示例：紧急访问请求
 */
export async function exampleEmergencyAccess() {
  const admin = phase7Integration.getSuperAdmin("admin-002");
  if (!admin) {
    throw new Error("Admin not found");
  }

  // 创建紧急访问请求
  const request = phase7Integration.createEmergencyAccessRequest({
    requester: admin,
    emergencyType: "system-outage",
    description: "Critical system outage requires immediate access to production database",
    severity: "critical",
    requestedPermissions: ["database.admin", "system.restart"],
    duration: 3600, // 1小时
  });

  console.log("🚨 Emergency access request created:", request.id);
  console.log("Status:", request.status);

  // 系统管理员授予紧急访问
  const granted = phase7Integration.grantEmergencyAccess(request.id, "admin-001");
  console.log("✅ Emergency access granted");
  console.log("Expires at:", new Date(granted.expiresAt!).toISOString());

  return granted;
}

/**
 * 示例：查看待审批请求
 */
export function exampleViewPendingApprovals(approverId: string) {
  const pending = phase7Integration.getPendingApprovals(approverId);

  console.log(`\n📋 Pending approvals for ${approverId}:`);
  console.log(`Total: ${pending.length}`);

  for (const request of pending) {
    console.log(`\n- Request ID: ${request.id}`);
    console.log(`  Title: ${request.title}`);
    console.log(`  Priority: ${request.priority}`);
    console.log(`  Requester: ${request.requester.name}`);
    console.log(`  Action: ${request.requestedAction}`);
    console.log(`  Created: ${new Date(request.createdAt).toISOString()}`);
  }

  return pending;
}

/**
 * 示例：查看审批统计
 */
export function exampleViewApprovalStatistics() {
  const stats = phase7Integration.getApprovalStatistics({
    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 最近7天
    endTime: Date.now(),
  });

  console.log("\n📊 Approval Statistics (Last 7 Days):");
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Pending: ${stats.pendingRequests}`);
  console.log(`Approved: ${stats.approvedRequests}`);
  console.log(`Rejected: ${stats.rejectedRequests}`);
  console.log(
    `Average Approval Time: ${(stats.averageApprovalTime / 1000 / 60).toFixed(2)} minutes`,
  );

  console.log("\nBy Priority:");
  for (const [priority, count] of Object.entries(stats.byPriority)) {
    console.log(`  ${priority}: ${count}`);
  }

  console.log("\nBy Operation Type:");
  for (const [type, count] of Object.entries(stats.byOperationType)) {
    console.log(`  ${type}: ${count}`);
  }

  return stats;
}

/**
 * 示例：完整的管理员工作流
 */
export async function exampleCompleteAdminWorkflow() {
  console.log("🚀 Starting complete admin workflow...\n");

  // 1. 初始化系统
  initializeAdminAndPermissionSystem();
  console.log("");

  // 2. 管理员登录
  const loginResult = await exampleAdminLogin();
  if (!loginResult.success) {
    throw new Error("Login failed");
  }
  console.log("");

  // 3. 创建审批请求
  const approvalRequest = await exampleCreateApprovalRequest();
  console.log("");

  // 4. 查看待审批
  exampleViewPendingApprovals("admin-001");
  console.log("");

  // 5. 处理审批
  await exampleProcessApproval(approvalRequest.id);
  console.log("");

  // 6. 查看统计
  exampleViewApprovalStatistics();
  console.log("");

  // 7. 健康检查
  const health = phase7Integration.healthCheck();
  console.log("🏥 System Health:");
  console.log(`Initialized: ${health.initialized}`);
  console.log(`Active Admins: ${health.statistics.activeAdmins}`);
  console.log(`Online Admins: ${health.statistics.onlineAdmins}`);
  console.log(`Pending Approvals: ${health.statistics.pendingApprovals}`);

  console.log("\n✅ Complete admin workflow finished successfully!");
}

/**
 * 示例：与 Phase 3 权限系统集成
 */
export function exampleIntegrationWithPhase3() {
  // Phase 7 的超级管理员可以覆盖 Phase 3 的权限检查结果

  // 场景：普通用户被拒绝访问某个工具，但可以通过审批流程获得临时权限

  console.log("📝 Integration with Phase 3 Permission System:");
  console.log("");
  console.log("1. User requests access to restricted tool");
  console.log("2. Phase 3 denies access (no permission)");
  console.log("3. User submits approval request to Phase 7");
  console.log("4. Super admin reviews and approves");
  console.log("5. Phase 7 grants temporary permission");
  console.log("6. Phase 3 now allows access (with Phase 7 override)");
  console.log("7. After expiry, Phase 7 revokes override");
  console.log("8. Phase 3 returns to default behavior");
  console.log("");
  console.log("✅ This creates a complete permission lifecycle management system!");
}

// 如果直接运行此文件，执行完整示例
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleCompleteAdminWorkflow().catch(console.error);
}
