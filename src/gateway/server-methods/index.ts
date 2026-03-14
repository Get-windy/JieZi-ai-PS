/**
 * Gateway Server Methods - 自动聚合注册表
 *
 * 约定：
 *   所有在 server-methods/ 目录下、导出 `xxxHandlers: GatewayRequestHandlers` 的文件
 *   必须在此处 import 并 spread 到 coreGatewayHandlers。
 *
 * 保证机制：
 *   src/gateway/server-methods/handlers-registry.test.ts 会自动扫描目录，
 *   验证所有符合约定的 handler 文件都已被本文件 import，未注册会导致测试失败。
 *
 * 新增 handler 步骤：
 *   1. 在 server-methods/ 下新建文件，导出 `export const xxxHandlers: GatewayRequestHandlers = { ... }`
 *   2. 在本文件 import 并加入 coreGatewayHandlers spread 列表
 *   3. handlers-registry.test.ts 会自动检测并提醒遗漏
 *
 * 注意：需要外部依赖注入的 handler（如 exec-approval.ts 使用工厂函数）
 *   由调用方通过 handleGatewayRequest 的 extraHandlers 参数传入，不在此处注册。
 */

import { agentHandlers } from "./agent.js";
import { agentsManagementHandlers } from "./agents-management.js";
import { agentsHandlers } from "./agents.js";
import { approvalHandlers } from "./approval.js";
import { assessmentHandlers } from "./assessment-rpc.js";
import { browserHandlers } from "./browser.js";
import { channelManagerHandlers } from "./channel-manager.js";
import { channelPoliciesHandlers } from "./channel-policies.js";
import { channelsHandlers } from "./channels.js";
import { chatAggregateHandlers } from "./chat-aggregate.js";
import { chatHandlers } from "./chat.js";
import { configHandlers } from "./config.js";
import { connectHandlers } from "./connect.js";
import { cronHandlers } from "./cron.js";
import { dataScopeHandlers } from "./data-scope-rpc.js";
import { deviceHandlers } from "./devices.js";
import { doctorHandlers } from "./doctor.js";
import { evolveRpc } from "./evolve-rpc.js";
import { execApprovalsHandlers } from "./exec-approvals.js";
import { friendsHandlers } from "./friends-rpc.js";
import { groupsHandlers } from "./groups-rpc.js";
import { healthHandlers } from "./health.js";
import { hrManagementHandlers } from "./hr-management.js";
import { humanAuthHandlers } from "./human-auth.js";
import { knowledgeSinkHandlers } from "./knowledge-sink.js";
import { lifecycleHandlers } from "./lifecycle-rpc.js";
import { logsHandlers } from "./logs.js";
import { meetingsRpc } from "./meetings-rpc.js";
import { memoryRpc } from "./memory-rpc.js";
import { mentorshipHandlers } from "./mentorship-rpc.js";
import { messageQueueHandlers } from "./message-queue-rpc.js";
import { modelsHandlers } from "./models.js";
import { monitorHandlers } from "./monitor-rpc.js";
import { nodeHandlers } from "./nodes.js";
import { organizationChartHandlers } from "./organization-chart.js";
import { organizationHierarchyHandlers } from "./organization-hierarchy-rpc.js";
import { organizationStructureHandlers } from "./organization-structure.js";
import { pairingHandlers } from "./pairing.js";
import { permissionManagementHandlers } from "./permission-management.js";
import { permissionHandlers } from "./permission.js";
import { permissionsManagementHandlers } from "./permissions-management.js";
import { phase5RpcHandlers } from "./phase5-rpc.js";
import { phase6IntegrationHandlers } from "./phase6-integration-rpc.js";
import { phase7AdminHandlers } from "./phase7-admin-rpc.js";
import { policyIntegrationHandlers } from "./policy-integration.js";
import { projectsHandlers } from "./projects-rpc.js";
import { pushHandlers } from "./push.js";
import { reportsHandlers } from "./reports-rpc.js";
import { scenariosHandlers } from "./scenarios-rpc.js";
import { sendHandlers } from "./send.js";
import { sessionsHandlers } from "./sessions.js";
import { skillManagementHandlers } from "./skill-management-rpc.js";
import { skillsHandlers } from "./skills.js";
import { storageHandlers } from "./storage.js";
import { systemHandlers } from "./system.js";
import { talkHandlers } from "./talk.js";
import { tasksRpc } from "./tasks-rpc.js";
import { toolsCatalogHandlers } from "./tools-catalog.js";
import { trainingPlanHandlers } from "./training-plan-rpc.js";
import { trainingHandlers } from "./training.js";
import { ttsHandlers } from "./tts.js";
import type { GatewayRequestHandlers } from "./types.js";
import { updateHandlers } from "./update.js";
import { usageHandlers } from "./usage.js";
import { voicewakeHandlers } from "./voicewake.js";
import { webHandlers } from "./web.js";
import { wizardHandlers } from "./wizard.js";

/**
 * 将 incoming 中尚未在 base 中注册的 handler 合并进来，已存在的 key 不覆盖。
 * 保证上游/硬编码写入的 handler 优先，本地新增只补充缺失的方法。
 */
function mergeHandlers(
  base: GatewayRequestHandlers,
  ...incoming: GatewayRequestHandlers[]
): GatewayRequestHandlers {
  const result: GatewayRequestHandlers = { ...base };
  for (const handlers of incoming) {
    for (const [key, fn] of Object.entries(handlers)) {
      if (!(key in result)) {
        result[key] = fn;
      }
    }
  }
  return result;
}

/**
 * 硬编码注册表：上游已有或本地已明确声明的 handler，优先级最高。
 * 新增本地 handler 文件时，先在此处 import 并 spread，保证优先级。
 * 如果只想补充（不覆盖上游），将新 handler 加入下方 mergeHandlers 的参数列表。
 */
const hardcodedHandlers: GatewayRequestHandlers = {
  // 连接与基础
  ...connectHandlers,
  ...healthHandlers,
  ...logsHandlers,
  ...voicewakeHandlers,
  ...messageQueueHandlers,
  ...pushHandlers,
  ...sendHandlers,
  ...systemHandlers,
  ...updateHandlers,
  ...storageHandlers,
  ...usageHandlers,

  // 渠道
  ...channelsHandlers,
  ...channelManagerHandlers,
  ...channelPoliciesHandlers,

  // 聊天与会话
  ...chatHandlers,
  ...chatAggregateHandlers,
  ...sessionsHandlers,

  // 配置与向导
  ...configHandlers,
  ...wizardHandlers,
  ...doctorHandlers,

  // 模型与 TTS
  ...modelsHandlers,
  ...talkHandlers,
  ...ttsHandlers,

  // 工具目录与技能
  ...toolsCatalogHandlers,
  ...skillsHandlers,
  ...skillManagementHandlers,

  // 节点与设备
  ...nodeHandlers,
  ...deviceHandlers,

  // 配对与执行审批
  ...pairingHandlers,
  ...execApprovalsHandlers,

  // Agent 管理
  ...agentHandlers,
  ...agentsHandlers,
  ...agentsManagementHandlers,
  ...lifecycleHandlers,

  // 审批流程
  ...approvalHandlers,

  // HR 管理
  ...hrManagementHandlers,

  // 培训
  ...trainingHandlers,
  ...trainingPlanHandlers,
  ...assessmentHandlers,

  // 权限管理
  ...permissionManagementHandlers,
  ...permissionsManagementHandlers,
  ...permissionHandlers,

  // 组织架构
  ...organizationStructureHandlers,
  ...organizationChartHandlers,
  ...organizationHierarchyHandlers,
  ...humanAuthHandlers,

  // 任务管理
  ...tasksRpc,

  // 社交关系
  ...friendsHandlers,
  ...groupsHandlers,
  ...mentorshipHandlers,
  ...projectsHandlers,

  // 工作流 & 场景 & 报告
  ...scenariosHandlers,
  ...reportsHandlers,
  ...monitorHandlers,
  ...dataScopeHandlers,
  ...knowledgeSinkHandlers,
  ...policyIntegrationHandlers,
  ...phase5RpcHandlers,
  ...phase6IntegrationHandlers,
  ...phase7AdminHandlers,

  // 会议
  ...meetingsRpc,

  // 记忆块（主动写入层）
  ...memoryRpc,

  // 自我进化（Reflexion 反思 + Voyager 技能库）
  ...evolveRpc,

  // Web & 浏览器
  ...webHandlers,
  ...browserHandlers,

  // 网关
  ...cronHandlers,
};

/**
 * 核心 Gateway Handler 注册表。
 *
 * 构建规则：
 *   1. hardcodedHandlers（上游 + 已明确引入）优先
 *   2. 本地新增 handler 文件通过 mergeHandlers 追加，已存在的 key 自动跳过
 *
 * 新增本地 handler 文件步骤：
 *   - 若要覆盖上游：在上方 hardcodedHandlers 中 import 并 spread
 *   - 若只补充缺失：在下方 mergeHandlers 追加参数
 */
export const coreGatewayHandlers: GatewayRequestHandlers = mergeHandlers(
  hardcodedHandlers,
  // 在此追加本地新增的 handler（已在 hardcodedHandlers 中的 key 会自动跳过）
);
