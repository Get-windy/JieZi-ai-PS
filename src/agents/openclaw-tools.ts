import type { OpenClawConfig } from "../config/config.js";
import { detectMessageToolExfil } from "../infra/exec-exfil-detect.js";
import { resolvePluginTools } from "../plugins/tools.js";
import type { GatewayMessageChannel } from "../utils/message-channel.js";
import { resolveSessionAgentId } from "./agent-scope.js";
import type { SandboxFsBridge } from "./sandbox/fs-bridge.js";
import {
  createAgentDiscoverTool,
  createAgentInspectTool,
  createAgentStatusTool,
  createAgentCapabilitiesTool,
  createAgentAssignTaskTool,
  createAgentCommunicateTool,
  createTaskReportToSupervisorTool,
  createAgentTeamStatusTool,
} from "./tools/agent-discovery-tools.js";
import {
  createAgentSpawnTool,
  createAgentStartTool,
  createAgentStopTool,
  createAgentRestartTool,
  createAgentConfigureTool,
  createAgentDestroyTool,
  createAgentCloneTool,
} from "./tools/agent-lifecycle-tools.js";
import {
  createAgentCreateTool,
  createAgentUpdateTool,
  createAgentDeleteTool,
} from "./tools/agent-management-tools.js";
import { createAgentsListTool } from "./tools/agents-list-tool.js";
import {
  createApprovalRequestTool,
  createApproveRequestTool,
  createRejectRequestTool,
  createListPendingApprovalsTool,
  createGetApprovalStatusTool,
  createCancelApprovalRequestTool,
} from "./tools/approval-tools.js";
import { createBrowserTool } from "./tools/browser-tool.js";
import { createCanvasTool } from "./tools/canvas-tool.js";
import type { AnyAgentTool } from "./tools/common.js";
import { createCronTool } from "./tools/cron-tool.js";
import {
  createFriendAddTool,
  createFriendRemoveTool,
  createFriendListTool,
} from "./tools/friend-management-tools.js";
import { createGatewayTool } from "./tools/gateway-tool.js";
import {
  createGroupCreateTool,
  createGroupListTool,
  createGroupAddMemberTool,
  createGroupRemoveMemberTool,
  createGroupUpdateMemberRoleTool,
  createGroupDeleteTool,
  createGroupSendTool,
} from "./tools/group-management-tools.js";
import {
  createDeactivateAgentTool,
  createActivateAgentTool,
  createConfigureAgentRoleTool,
  createAssignSupervisorTool,
  createAssignMentorTool,
  createPromoteAgentTool,
  createTransferAgentTool,
} from "./tools/hr-management-tools.js";
import { createImageTool } from "./tools/image-tool.js";
import { createMessageTool } from "./tools/message-tool.js";
import { createNodesTool } from "./tools/nodes-tool.js";
import {
  createOrganizationCreateTool,
  createOrganizationUpdateTool,
  createOrganizationMemberAddTool,
  createOrganizationMemberUpdateTool,
  createOrganizationMemberRemoveTool,
  createOrganizationListTool,
} from "./tools/organization-management-tools.js";
import {
  createOrgDepartmentTool,
  createOrgTeamTool,
  createOrgAssignToDepartmentTool,
  createOrgAssignToTeamTool,
  createOrgSetReportingLineTool,
  createOrgStructureListTool,
} from "./tools/organization-structure-tools.js";
import {
  createPerm_GrantTool,
  createPerm_RevokeTool,
  createPerm_DelegateTool,
  createPerm_CheckTool,
  createPerm_ListTool,
  createPerm_AuditTool,
} from "./tools/permission-management-tools-impl.js";
import {
  createRecruitAgentTool,
  createApproveRecruitTool,
  createRecruitListTool,
} from "./tools/recruit-management-tools.js";
import { createSessionStatusTool } from "./tools/session-status-tool.js";
import { createSessionsHistoryTool } from "./tools/sessions-history-tool.js";
import { createSessionsListTool } from "./tools/sessions-list-tool.js";
import { createSessionsSendTool } from "./tools/sessions-send-tool.js";
import { createSessionsSpawnTool } from "./tools/sessions-spawn-tool.js";
import { createSubagentsTool } from "./tools/subagents-tool.js";
import {
  createTaskCreateTool,
  createTaskListTool,
  createTaskUpdateTool,
  createTaskCompleteTool,
  createTaskDeleteTool,
} from "./tools/task-management-tools.js";
import {
  createTrainAgentTool,
  createTrainingStartTool,
  createTrainingCompleteTool,
  createAssessAgentTool,
  createCreateTrainingCourseTool,
  createAssignTrainingTool,
  createTransferSkillTool,
  createCertifyTrainerTool,
} from "./tools/training-tools.js";
import { createTtsTool } from "./tools/tts-tool.js";
import { createWebFetchTool, createWebSearchTool } from "./tools/web-tools.js";
import { resolveWorkspaceRoot } from "./workspace-dir.js";

export function createOpenClawTools(options?: {
  sandboxBrowserBridgeUrl?: string;
  allowHostBrowserControl?: boolean;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  /** Delivery target (e.g. telegram:group:123:topic:456) for topic/thread routing. */
  agentTo?: string;
  /** Thread/topic identifier for routing replies to the originating thread. */
  agentThreadId?: string | number;
  /** Group id for channel-level tool policy inheritance. */
  agentGroupId?: string | null;
  /** Group channel label for channel-level tool policy inheritance. */
  agentGroupChannel?: string | null;
  /** Group space label for channel-level tool policy inheritance. */
  agentGroupSpace?: string | null;
  agentDir?: string;
  sandboxRoot?: string;
  sandboxFsBridge?: SandboxFsBridge;
  workspaceDir?: string;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  pluginToolAllowlist?: string[];
  /** Current channel ID for auto-threading (Slack). */
  currentChannelId?: string;
  /** Current thread timestamp for auto-threading (Slack). */
  currentThreadTs?: string;
  /** Current inbound message id for action fallbacks (e.g. Telegram react). */
  currentMessageId?: string | number;
  /** Reply-to mode for Slack auto-threading. */
  replyToMode?: "off" | "first" | "all";
  /** Mutable ref to track if a reply was sent (for "first" mode). */
  hasRepliedRef?: { value: boolean };
  /** If true, the model has native vision capability */
  modelHasVision?: boolean;
  /** Explicit agent ID override for cron/hook sessions. */
  requesterAgentIdOverride?: string;
  /** Require explicit message targets (no implicit last-route sends). */
  requireExplicitMessageTarget?: boolean;
  /** If true, omit the message tool from the tool list. */
  disableMessageTool?: boolean;
  /** Trusted sender id from inbound context (not tool args). */
  requesterSenderId?: string | null;
  /** Whether the requesting sender is an owner. */
  senderIsOwner?: boolean;
  /** Session ID for plugin tool context. */
  sessionId?: string;
}): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  const imageTool = options?.agentDir?.trim()
    ? createImageTool({
        config: options?.config,
        agentDir: options.agentDir,
        workspaceDir,
        sandbox:
          options?.sandboxRoot && options?.sandboxFsBridge
            ? { root: options.sandboxRoot, bridge: options.sandboxFsBridge }
            : undefined,
        modelHasVision: options?.modelHasVision,
      })
    : null;
  const webSearchTool = createWebSearchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
  });
  const webFetchTool = createWebFetchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
  });
  const rawMessageTool = options?.disableMessageTool
    ? null
    : createMessageTool({
        agentAccountId: options?.agentAccountId,
        agentSessionKey: options?.agentSessionKey,
        config: options?.config,
        currentChannelId: options?.currentChannelId,
        currentChannelProvider: options?.agentChannel,
        currentThreadTs: options?.currentThreadTs,
        currentMessageId: options?.currentMessageId,
        replyToMode: options?.replyToMode,
        hasRepliedRef: options?.hasRepliedRef,
        sandboxRoot: options?.sandboxRoot,
        requireExplicitTarget: options?.requireExplicitMessageTarget,
        requesterSenderId: options?.requesterSenderId ?? undefined,
      });
  // Wrap message tool to block outbound exfiltration of sensitive content.
  const messageTool = rawMessageTool
    ? {
        ...rawMessageTool,
        execute: async (toolCallId: string, args: unknown, signal?: AbortSignal) => {
          const argsObj = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
          const exfil = detectMessageToolExfil(argsObj);
          if (exfil.detected) {
            throw new Error(
              `message tool denied: attempt to send sensitive data via external channel. ${exfil.reasons.join("; ")}`,
            );
          }
          return rawMessageTool.execute(toolCallId, args, signal);
        },
      }
    : null;
  const tools: AnyAgentTool[] = [
    createBrowserTool({
      sandboxBridgeUrl: options?.sandboxBrowserBridgeUrl,
      allowHostControl: options?.allowHostBrowserControl,
    }),
    createCanvasTool({ config: options?.config }),
    createNodesTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createCronTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    ...(messageTool ? [messageTool] : []),
    createTtsTool({
      agentChannel: options?.agentChannel,
      config: options?.config,
    }),
    createGatewayTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createAgentsListTool({
      agentSessionKey: options?.agentSessionKey,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSessionsListTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsHistoryTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSendTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSpawnTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      agentTo: options?.agentTo,
      agentThreadId: options?.agentThreadId,
      agentGroupId: options?.agentGroupId,
      agentGroupChannel: options?.agentGroupChannel,
      agentGroupSpace: options?.agentGroupSpace,
      sandboxed: options?.sandboxed,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSubagentsTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    createSessionStatusTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    ...(webSearchTool ? [webSearchTool] : []),
    ...(webFetchTool ? [webFetchTool] : []),
    ...(imageTool ? [imageTool] : []),
    createAgentCreateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentUpdateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentDeleteTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createFriendAddTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createFriendRemoveTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createFriendListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupCreateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupAddMemberTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupRemoveMemberTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupUpdateMemberRoleTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupDeleteTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGroupSendTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationCreateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationUpdateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationMemberAddTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationMemberUpdateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationMemberRemoveTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrganizationListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createRecruitAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createApproveRecruitTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createRecruitListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskCreateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskUpdateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskCompleteTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskDeleteTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentDiscoverTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentInspectTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentStatusTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentCapabilitiesTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentAssignTaskTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentCommunicateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTaskReportToSupervisorTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentTeamStatusTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentSpawnTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentStartTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentStopTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentRestartTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentConfigureTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentDestroyTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAgentCloneTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    // HR管理工具
    createDeactivateAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createActivateAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createConfigureAgentRoleTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAssignSupervisorTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAssignMentorTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPromoteAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTransferAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    // 审批流程工具
    createApprovalRequestTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createApproveRequestTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createRejectRequestTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createListPendingApprovalsTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createGetApprovalStatusTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createCancelApprovalRequestTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    // 培训系统工具
    createTrainAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTrainingStartTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTrainingCompleteTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAssessAgentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createCreateTrainingCourseTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createAssignTrainingTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createTransferSkillTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createCertifyTrainerTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    // 权限管理工具
    createPerm_GrantTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPerm_RevokeTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPerm_DelegateTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPerm_CheckTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPerm_ListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createPerm_AuditTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    // 组织架构工具
    createOrgDepartmentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrgTeamTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrgAssignToDepartmentTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrgAssignToTeamTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrgSetReportingLineTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
    createOrgStructureListTool({
      currentAgentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
    }),
  ];

  const pluginTools = resolvePluginTools({
    context: {
      config: options?.config,
      workspaceDir,
      agentDir: options?.agentDir,
      agentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
      sessionKey: options?.agentSessionKey,
      sessionId: options?.sessionId,
      messageChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      sandboxed: options?.sandboxed,
    },
    existingToolNames: new Set(tools.map((tool) => tool.name)),
    toolAllowlist: options?.pluginToolAllowlist,
  });

  return [...tools, ...pluginTools];
}
