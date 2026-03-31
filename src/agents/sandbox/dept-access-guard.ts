/**
 * 部门访问守卫（对抗层）
 *
 * 防进攻2：Agent 必须真实属于某部门才能获得该部门的沙箱配置。
 * 防止 Agent 通过伪造 departmentId 参数来获得其他部门的文件系统/网络访问权限。
 *
 * 验证链：
 *   agentId ∈ dept.memberIds ∨ agentId ∈ dept.members[].id
 *   → 通过 → 允许使用部门沙箱配置
 *   → 拒绝 → 返回全局基础配置（不报错，静默降级）
 */

import { organizationStorage } from "../../organization/storage.js";

// ============================================================================
// 类型定义
// ============================================================================

export type DeptMembershipResult =
  | { isMember: true; departmentId: string; role: string }
  | { isMember: false; reason: string };

// ============================================================================
// 核心验证函数
// ============================================================================

/**
 * 验证 agentId 是否是指定部门的成员
 *
 * @param agentId Agent ID
 * @param departmentId 部门 ID
 * @returns 成员验证结果
 */
export async function verifyAgentDeptMembership(
  agentId: string,
  departmentId: string,
): Promise<DeptMembershipResult> {
  if (!agentId || !departmentId) {
    return { isMember: false, reason: "agentId or departmentId is empty" };
  }

  const dept = await organizationStorage.getOrganization(departmentId);
  if (!dept) {
    return { isMember: false, reason: `Department ${departmentId} does not exist` };
  }

  // 检查 memberIds（简单列表）
  if (dept.memberIds.includes(agentId)) {
    return { isMember: true, departmentId, role: "member" };
  }

  // 检查 members（详细成员列表，含角色）
  if (dept.members) {
    const member = dept.members.find((m) => m.id === agentId);
    if (member) {
      return { isMember: true, departmentId, role: member.role };
    }
  }

  // 检查 managerId（部门负责人也算成员）
  if (dept.managerId === agentId) {
    return { isMember: true, departmentId, role: "manager" };
  }

  return {
    isMember: false,
    reason: `Agent ${agentId} is not a member of department ${departmentId} (${dept.name})`,
  };
}

/**
 * 根据 agentId 在所有部门中查找其所属部门
 *
 * 用于 resolveSandboxContext 时自动推断 departmentId：
 * 如果 Agent 只属于一个部门，自动使用该部门的沙箱配置。
 * 如果属于多个部门，返回第一个配置了 sandboxConfig 的部门。
 *
 * @param agentId Agent ID
 * @returns 最匹配的部门 ID，或 null（无匹配）
 */
export async function resolveAgentDepartment(agentId: string): Promise<string | null> {
  if (!agentId) return null;

  const allOrgs = await organizationStorage.listOrganizations({ type: "department" });

  const memberDepts: { deptId: string; hasSandboxConfig: boolean }[] = [];

  for (const org of allOrgs) {
    const isMember =
      org.memberIds.includes(agentId) ||
      (org.members?.some((m) => m.id === agentId) ?? false) ||
      org.managerId === agentId;

    if (isMember) {
      memberDepts.push({
        deptId: org.id,
        hasSandboxConfig: !!(org.sandboxConfig?.enabled !== false && org.sandboxConfig),
      });
    }
  }

  if (memberDepts.length === 0) return null;

  // 优先返回配置了 sandboxConfig 的部门
  const withSandbox = memberDepts.find((d) => d.hasSandboxConfig);
  if (withSandbox) return withSandbox.deptId;

  // 否则返回第一个部门
  return memberDepts[0]?.deptId ?? null;
}

/**
 * 安全地解析部门 ID（结合成员验证）
 *
 * 如果提供了 departmentId 但 Agent 不是成员，返回 null（静默降级）。
 * 如果没有提供 departmentId，自动推断。
 *
 * 这是 resolveSandboxConfigWithDept 调用前的门卫，
 * 保证 departmentId 传入前已经过验证（防进攻2）。
 *
 * @param agentId Agent ID
 * @param requestedDeptId 请求的部门 ID（可选）
 * @returns 验证后的部门 ID，或 null
 */
export async function guardedResolveDeptId(
  agentId: string,
  requestedDeptId?: string | null,
): Promise<string | null> {
  if (!agentId) return null;

  if (requestedDeptId) {
    // 显式指定了部门，进行成员验证
    const result = await verifyAgentDeptMembership(agentId, requestedDeptId);
    if (result.isMember) {
      return requestedDeptId;
    }
    // 防进攻2：验证失败，静默降级，记录警告
    console.warn(
      `[DeptAccessGuard] Agent ${agentId} requested dept sandbox ${requestedDeptId} ` +
        `but is not a member. Falling back to base config. Reason: ${result.reason}`,
    );
    return null;
  }

  // 没有显式指定部门，自动推断
  return resolveAgentDepartment(agentId);
}

// ============================================================================
// 跨部门通信守卫（用于消息路由层）
// ============================================================================

/**
 * 检查从 sourceDeptId 到 targetDeptId 的通信是否被允许
 *
 * 通信允许的条件（任一满足）：
 * 1. source 和 target 是同一部门
 * 2. target 部门的 crossDeptBindMounts 中包含 source 部门（跨部门协调通道）
 * 3. target 是 source 的上级部门（向上汇报）
 * 4. source 是 target 的上级部门（向下调度，如董事会）
 *
 * @param sourceDeptId 消息发出方部门 ID
 * @param targetDeptId 消息接收方部门 ID
 * @returns { allowed: boolean; reason?: string }
 */
export async function checkCrossDeptCommunication(
  sourceDeptId: string,
  targetDeptId: string,
): Promise<{ allowed: boolean; channel?: string; reason?: string }> {
  if (sourceDeptId === targetDeptId) {
    return { allowed: true, channel: "same-dept" };
  }

  const [sourceDept, targetDept] = await Promise.all([
    organizationStorage.getOrganization(sourceDeptId),
    organizationStorage.getOrganization(targetDeptId),
  ]);

  if (!sourceDept || !targetDept) {
    return {
      allowed: false,
      reason: `One or both departments not found: ${sourceDeptId}, ${targetDeptId}`,
    };
  }

  // 条件4：source 是 target 的上级（如董事会下发指令）
  if (targetDept.parentId === sourceDeptId) {
    return { allowed: true, channel: "parent-to-child" };
  }

  // 条件3：target 是 source 的上级（向上汇报）
  if (sourceDept.parentId === targetDeptId) {
    return { allowed: true, channel: "child-to-parent" };
  }

  // 条件2：target 配置了对 source 的跨部门挂载（单向通道）
  if (targetDept.sandboxConfig?.crossDeptBindMounts) {
    const hasMount = targetDept.sandboxConfig.crossDeptBindMounts.some(
      (m) => m.sourceDeptId === sourceDeptId,
    );
    if (hasMount) {
      return { allowed: true, channel: "cross-dept-mount" };
    }
  }

  return {
    allowed: false,
    reason:
      `Cross-dept communication from ${sourceDept.name} to ${targetDept.name} ` +
      `is not authorized. No parent-child or configured cross-dept channel exists.`,
  };
}
