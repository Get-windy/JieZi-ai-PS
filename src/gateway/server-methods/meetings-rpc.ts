/**
 * Meetings RPC Handlers
 *
 * 提供会议系统相关的RPC方法（P2.4）：
 * 
 * 会议管理操作：
 * - meeting.create - 创建会议
 * - meeting.update - 更新会议
 * - meeting.cancel - 取消会议
 * - meeting.invite.respond - 响应会议邀请
 * - meeting.start - 开始会议
 * - meeting.end - 结束会议
 * 
 * 会议交互操作：
 * - meeting.message.send - 会议中发送消息
 * - meeting.agenda.next - 进入下一个议题
 * - meeting.decision.record - 记录决策
 * - meeting.actionitem.create - 创建行动项
 * - meeting.notes.generate - 生成会议纪要
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import * as storage from "../../tasks/storage.js";
import { checkMeetingAccess, checkMeetingModifyAccess } from "../../tasks/permissions.js";
import type {
  Meeting,
  MeetingType,
  MeetingStatus,
  MeetingResponse,
  MeetingParticipant,
  MeetingAgendaItem,
  MeetingDecision,
  MeetingActionItem,
  MeetingMessage,
  MeetingSummary,
  CreateMeetingRequest,
  UpdateMeetingRequest,
  MeetingFilter,
  TaskPriority,
} from "../../tasks/types.js";
import type { MemberType } from "../../organization/types.js";

/**
 * 会议 RPC 方法注册
 */
export const meetingsRpc: GatewayRequestHandlers = {
  /**
   * meeting.create - 创建会议
   */
  "meeting.create": async ({ params, respond }) => {
    try {
      const title = params?.title ? String(params.title) : "";
      const description = params?.description
        ? String(params.description)
        : undefined;
      const organizerId = params?.organizerId
        ? String(params.organizerId)
        : "system";
      const organizerType = params?.organizerType
        ? (String(params.organizerType) as MemberType)
        : "human";
      const participantIds = params?.participantIds
        ? (params.participantIds as string[])
        : [];
      const type = params?.type
        ? (String(params.type) as MeetingType)
        : "other";
      const scheduledAt = params?.scheduledAt ? Number(params.scheduledAt) : 0;
      const duration = params?.duration ? Number(params.duration) : 60;
      const agenda = params?.agenda ? (params.agenda as any[]) : [];
      const organizationId = params?.organizationId
        ? String(params.organizationId)
        : undefined;
      const teamId = params?.teamId ? String(params.teamId) : undefined;
      const projectId = params?.projectId ? String(params.projectId) : undefined;

      // 验证参数
      if (!title || title.length < 1 || title.length > 200) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议标题必须为1-200个字符"),
        );
        return;
      }

      if (!scheduledAt || scheduledAt < Date.now()) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议时间必须在未来"),
        );
        return;
      }

      if (participantIds.length < 1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "至少需要一名参会者"),
        );
        return;
      }

      // 验证会议类型
      if (
        !["standup", "review", "planning", "brainstorm", "decision", "other"].includes(
          type,
        )
      ) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "无效的会议类型"),
        );
        return;
      }

      // 验证组织/团队/项目（简化版，实际应该调用组织管理模块）
      // 在实际环境中，这里应该查询组织管理系统确认组织者的权限

      // 生成会议ID
      const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      // 创建参会者列表
      // 在实际环境中，类型应该从用户/智能助手注册信息中获取
      const participants: MeetingParticipant[] = participantIds.map((participantId) => ({
        id: participantId,
        type: "agent" as MemberType, // 默认为agent，实际应从系统查询
        role: participantId === organizerId ? "organizer" : "attendee",
        response: "no-response" as MeetingResponse,
      }));

      // 创建议程列表
      const agendaItems: MeetingAgendaItem[] = agenda.map((item, index) => ({
        id: `agenda-${index}-${Date.now()}`,
        topic: String(item.topic || ""),
        description: item.description ? String(item.description) : undefined,
        duration: item.duration ? Number(item.duration) : 10,
        presenter: item.presenter ? String(item.presenter) : undefined,
        status: "pending" as const,
      }));

      // 创建会议对象
      const newMeeting: Meeting = {
        id: meetingId,
        title,
        description,
        organizerId,
        organizerType,
        participants,
        type,
        status: "scheduled",
        scheduledAt,
        duration,
        organizationId,
        teamId,
        projectId,
        agenda: agendaItems,
        decisions: [],
        actionItems: [],
        createdAt: Date.now(),
      };

      // 存储到数据库
      await storage.createMeeting(newMeeting);
      
      // 发送会议邀请通知
      for (const participant of participants) {
        if (participant.id !== organizerId) {
          console.log(`[Meeting Notification] Invitation sent to ${participant.id} for meeting ${meetingId}`);
          // 实际环境中应该调用通知系统发送会议邀请
        }
      }

      respond(true, newMeeting, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create meeting: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.update - 更新会议
   */
  "meeting.update": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const title = params?.title ? String(params.title) : undefined;
      const description = params?.description
        ? String(params.description)
        : undefined;
      const scheduledAt = params?.scheduledAt
        ? Number(params.scheduledAt)
        : undefined;
      const duration = params?.duration ? Number(params.duration) : undefined;
      const agenda = params?.agenda ? (params.agenda as any[]) : undefined;

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 权限检查 - 需要组织者权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkMeetingModifyAccess(
          meeting.organizerId,
          meeting.organizationId,
          meeting.teamId,
          requesterId,
          undefined,
          undefined
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.PERMISSION_DENIED, permCheck.reason || "无权限修改此会议")
          );
          return;
        }
      }
      
      // 验证会议状态（只能更新未开始的会议）
      if (meeting.status !== "scheduled") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `只能更新scheduled状态的会议，当前状态: ${meeting.status}`)
        );
        return;
      }
      
      // 更新会议信息
      const updatedMeeting = await storage.updateMeeting(meetingId, {
        title,
        description,
        scheduledAt,
        duration,
        agenda: agenda ? agenda.map((item: any, index: number) => ({
          id: `agenda-${index}-${Date.now()}`,
          topic: String(item.topic || ""),
          description: item.description ? String(item.description) : undefined,
          duration: item.duration ? Number(item.duration) : 10,
          presenter: item.presenter ? String(item.presenter) : undefined,
          status: "pending" as const,
        })) : undefined,
      });
      
      // 通知参会者会议变更
      for (const participant of meeting.participants) {
        console.log(`[Meeting Notification] Meeting ${meetingId} updated, notifying ${participant.id}`);
        // 实际环境中应该通知所有参会者
      }

      respond(true, updatedMeeting, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to update meeting: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.cancel - 取消会议
   */
  "meeting.cancel": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const cancelReason = params?.cancelReason
        ? String(params.cancelReason)
        : "";

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 权限检查 - 需要组织者或管理员权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkMeetingModifyAccess(
          meeting.organizerId,
          meeting.organizationId,
          meeting.teamId,
          requesterId,
          undefined,
          undefined
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.PERMISSION_DENIED, permCheck.reason || "无权限取消此会议")
          );
          return;
        }
      }
      
      // 更新会议状态为 cancelled
      await storage.updateMeeting(meetingId, {
        status: "cancelled",
        cancelledAt: Date.now(),
        cancelReason,
      });
      
      // 通知所有参会者会议取消
      for (const participant of meeting.participants) {
        console.log(`[Meeting Notification] Meeting ${meetingId} cancelled, notifying ${participant.id}`);
        // 实际环境中应该通知所有参会者
      }

      const result = {
        meetingId,
        status: "cancelled" as MeetingStatus,
        cancelReason,
        cancelledAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to cancel meeting: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.invite.respond - 响应会议邀请
   */
  "meeting.invite.respond": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const participantId = params?.participantId
        ? String(params.participantId)
        : "";
      const response = params?.response
        ? (String(params.response) as MeetingResponse)
        : ("no-response" as MeetingResponse);

      if (!meetingId || !participantId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 验证响应类型
      if (!["accepted", "declined", "tentative"].includes(response)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "无效的响应类型"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 验证参会者在参会者列表中
      const participant = meeting.participants.find(p => p.id === participantId);
      if (!participant) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "不在参会者列表中"),
        );
        return;
      }
      
      // 更新参会者响应状态
      participant.response = response;
      participant.respondedAt = Date.now();
      await storage.updateMeeting(meetingId, { participants: meeting.participants });
      
      // 通知组织者
      console.log(`[Meeting Notification] ${participantId} responded ${response} to meeting ${meetingId}`);
      // 实际环境中应该通知会议组织者

      const result = {
        meetingId,
        participantId,
        response,
        respondedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to respond to meeting invite: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.start - 开始会议
   */
  "meeting.start": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 权限检查 - 需要组织者权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkMeetingModifyAccess(
          meeting.organizerId,
          meeting.organizationId,
          meeting.teamId,
          requesterId,
          undefined,
          undefined
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.PERMISSION_DENIED, permCheck.reason || "无权限开始此会议")
          );
          return;
        }
      }
      
      // 验证会议状态（只能开始scheduled状态的会议）
      if (meeting.status !== "scheduled") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `只能开始scheduled状态的会议，当前状态: ${meeting.status}`),
        );
        return;
      }
      
      // 更新会议状态为 in-progress，记录实际开始时间
      await storage.updateMeeting(meetingId, {
        status: "in-progress",
        startedAt: Date.now(),
      });
      
      // 通知所有参会者会议开始
      for (const participant of meeting.participants) {
        console.log(`[Meeting Notification] Meeting ${meetingId} started, notifying ${participant.id}`);
        // 实际环境中应该通知所有参会者
      }

      const result = {
        meetingId,
        status: "in-progress" as MeetingStatus,
        startedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to start meeting: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.end - 结束会议
   */
  "meeting.end": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 权限检查 - 需要组织者权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkMeetingModifyAccess(
          meeting.organizerId,
          meeting.organizationId,
          meeting.teamId,
          requesterId,
          undefined,
          undefined
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.PERMISSION_DENIED, permCheck.reason || "无权限结束此会议")
          );
          return;
        }
      }
      
      // 验证会议状态（只能结束in-progress状态的会议）
      if (meeting.status !== "in-progress") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `只能结束in-progress状态的会议，当前状态: ${meeting.status}`),
        );
        return;
      }
      
      // 更新会议状态为 completed，记录实际结束时间
      await storage.updateMeeting(meetingId, {
        status: "completed",
        endedAt: Date.now(),
      });
      
      // 触发生成会议纪要（异步处理）
      console.log(`[Meeting Notification] Meeting ${meetingId} ended, will generate notes`);
      // 实际环境中应该触发异步任务生成会议纪要

      const result = {
        meetingId,
        status: "completed" as MeetingStatus,
        endedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to end meeting: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.message.send - 会议中发送消息
   */
  "meeting.message.send": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const senderId = params?.senderId ? String(params.senderId) : "";
      const senderType = params?.senderType
        ? (String(params.senderType) as MemberType)
        : "human";
      const content = params?.content ? String(params.content) : "";
      const messageType = params?.messageType
        ? String(params.messageType)
        : "text";
      const replyToMessageId = params?.replyToMessageId
        ? String(params.replyToMessageId)
        : undefined;

      if (!meetingId || !senderId || !content) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 验证消息类型
      if (
        !["text", "decision", "action-item", "poll", "file"].includes(messageType)
      ) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "无效的消息类型"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 验证发送者是参会者
      const isParticipant = meeting.participants.some(p => p.id === senderId);
      if (!isParticipant && senderId !== meeting.organizerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.PERMISSION_DENIED, "不在参会者列表中"),
        );
        return;
      }
      
      // 验证会议正在进行中
      if (meeting.status !== "in-progress") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议未在进行中"),
        );
        return;
      }
      
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newMessage: MeetingMessage = {
        id: messageId,
        meetingId,
        senderId,
        senderType,
        content,
        messageType: messageType as
          | "text"
          | "decision"
          | "action-item"
          | "poll"
          | "file",
        replyToMessageId,
        createdAt: Date.now(),
      };
      
      // 添加消息到会议
      await storage.addMeetingMessage(newMessage);
      
      // 实时推送消息给所有参会者
      for (const participant of meeting.participants) {
        if (participant.id !== senderId) {
          console.log(`[Meeting Realtime] Broadcasting message to ${participant.id}`);
          // 实际环境中应该通过WebSocket实时推送消息
        }
      }

      respond(true, newMessage, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to send meeting message: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.agenda.next - 进入下一个议题
   */
  "meeting.agenda.next": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 权限检查 - 需要组织者或facilitator权限
      const requesterId = params?.requesterId ? String(params.requesterId) : undefined;
      if (requesterId) {
        const permCheck = checkMeetingModifyAccess(
          meeting.organizerId,
          meeting.organizationId,
          meeting.teamId,
          requesterId,
          undefined,
          undefined
        );
        if (!permCheck.allowed) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.PERMISSION_DENIED, permCheck.reason || "无权限切换议题")
          );
          return;
        }
      }
      
      // 验证会议正在进行中
      if (meeting.status !== "in-progress") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议未在进行中"),
        );
        return;
      }
      
      // 完成当前议题，进入下一个议题
      const currentIndex = meeting.currentAgendaIndex || 0;
      if (currentIndex < meeting.agenda.length) {
        meeting.agenda[currentIndex].status = "completed";
        meeting.agenda[currentIndex].completedAt = Date.now();
      }
      
      const nextIndex = currentIndex + 1;
      if (nextIndex < meeting.agenda.length) {
        meeting.agenda[nextIndex].status = "in-progress";
        meeting.agenda[nextIndex].startedAt = Date.now();
      }
      
      await storage.updateMeeting(meetingId, {
        agenda: meeting.agenda,
        currentAgendaIndex: nextIndex,
      });
      
      // 通知所有参会者议题变更
      for (const participant of meeting.participants) {
        console.log(`[Meeting Realtime] Agenda changed for ${participant.id}`);
        // 实际环境中应该通过WebSocket实时通知参会者
      }

      const result = {
        meetingId,
        previousAgendaIndex: currentIndex,
        currentAgendaIndex: nextIndex,
        updatedAt: Date.now(),
      };

      respond(true, result, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to move to next agenda: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.decision.record - 记录决策
   */
  "meeting.decision.record": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const content = params?.content ? String(params.content) : "";
      const proposedBy = params?.proposedBy ? String(params.proposedBy) : "";
      const approvedBy = params?.approvedBy
        ? (params.approvedBy as string[])
        : undefined;
      const agendaItemId = params?.agendaItemId
        ? String(params.agendaItemId)
        : undefined;
      const impact = params?.impact
        ? (String(params.impact) as "high" | "medium" | "low")
        : undefined;

      if (!meetingId || !content || !proposedBy) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 验证会议正在进行中
      if (meeting.status !== "in-progress") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议未在进行中"),
        );
        return;
      }
      
      const decisionId = `decision-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newDecision: MeetingDecision = {
        id: decisionId,
        meetingId,
        content,
        proposedBy,
        approvedBy,
        agendaItemId,
        impact,
        createdAt: Date.now(),
      };
      
      // 添加决策记录
      await storage.addMeetingDecision(newDecision);
      
      // 通知相关人员
      for (const participant of meeting.participants) {
        console.log(`[Meeting Notification] Decision recorded in meeting ${meetingId}, notifying ${participant.id}`);
        // 实际环境中应该通知所有参会者
      }

      respond(true, newDecision, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to record decision: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.actionitem.create - 创建行动项
   */
  "meeting.actionitem.create": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const description = params?.description ? String(params.description) : "";
      const assigneeId = params?.assigneeId ? String(params.assigneeId) : "";
      const assigneeType = params?.assigneeType
        ? (String(params.assigneeType) as MemberType)
        : "agent";
      const dueDate = params?.dueDate ? Number(params.dueDate) : undefined;
      const priority = params?.priority
        ? (String(params.priority) as TaskPriority)
        : "medium";
      const agendaItemId = params?.agendaItemId
        ? String(params.agendaItemId)
        : undefined;

      if (!meetingId || !description || !assigneeId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少必需参数"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 验证被分配者在参会者列表中
      const isParticipant = meeting.participants.some(p => p.id === assigneeId);
      if (!isParticipant && assigneeId !== meeting.organizerId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "被分配者不在参会者列表中"),
        );
        return;
      }
      
      const actionItemId = `action-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

      const newActionItem: MeetingActionItem = {
        id: actionItemId,
        meetingId,
        description,
        assigneeId,
        assigneeType,
        dueDate,
        priority,
        status: "pending",
        agendaItemId,
        createdAt: Date.now(),
      };
      
      // 创建行动项
      await storage.addMeetingActionItem(newActionItem);
      
      // 通知被分配者
      console.log(`[Meeting Notification] Action item assigned to ${assigneeId} in meeting ${meetingId}`);
      // 实际环境中应该通知被分配者
      
      // 可选：自动转换为任务
      // 实际环境中可以考虑将action item自动创建为任务，方便跟踪执行

      respond(true, newActionItem, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create action item: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },

  /**
   * meeting.notes.generate - 生成会议纪要
   */
  "meeting.notes.generate": async ({ params, respond }) => {
    try {
      const meetingId = params?.meetingId ? String(params.meetingId) : "";
      const generatedBy = params?.generatedBy
        ? String(params.generatedBy)
        : "system";

      if (!meetingId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议ID不能为空"),
        );
        return;
      }

      // 从数据库获取会议
      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, "会议不存在"),
        );
        return;
      }
      
      // 验证会议已结束
      if (meeting.status !== "completed") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "会议尚未结束"),
        );
        return;
      }
      
      // 分析会议内容
      const messages = await storage.getMeetingMessages(meetingId);
      
      // 使用AI生成会议摘要
      // 这里应该集成AI服务，分析会议消息和决策，生成智能摘要
      const aiSummary = await generateAIMeetingSummary(meeting, messages);
      
      // 生成会议纪要
      // 计算实际会议时长
      const actualDuration = meeting.endedAt && meeting.startedAt
        ? Math.round((meeting.endedAt - meeting.startedAt) / (1000 * 60))
        : meeting.duration;
      
      const summary: MeetingSummary = {
        meetingId,
        title: meeting.title,
        date: meeting.scheduledAt,
        duration: actualDuration,
        attendees: meeting.participants.map(p => ({
          id: p.id,
          type: p.type,
          attended: p.response === "accepted",
        })),
        summary: aiSummary.summary,
        keyPoints: aiSummary.keyPoints,
        agendaReview: meeting.agenda.map(item => ({
          topic: item.topic,
          completed: item.status === "completed",
          notes: item.notes,
        })),
        decisions: meeting.decisions,
        actionItems: meeting.actionItems,
        generatedAt: Date.now(),
        generatedBy,
      };
      
      // 保存会议纪要（添加到会议对象中）
      await storage.updateMeeting(meetingId, { summary });
      console.log(`[Meeting] Notes generated for meeting ${meetingId}`);
      
      // 分发会议纪要给所有参会者
      for (const attendee of summary.attendees) {
        if (attendee.attended) {
          console.log(`[Meeting Notification] Sending meeting notes to ${attendee.id}`);
          // 实际环境中应该通过邮件或系统通知发送纪要
        }
      }

      respond(true, summary, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to generate meeting notes: ${String(err instanceof Error ? err.message : err)}`,
        ),
      );
    }
  },
};

/**
 * AI生成会议摘要辅助函数
 * 
 * 在实际环境中，这里应该集成真正的AI服务（如OpenAI、Claude等）
 * 分析会议消息、决策和议题，生成智能摘要
 */
async function generateAIMeetingSummary(
  meeting: Meeting,
  messages: MeetingMessage[]
): Promise<{ summary: string; keyPoints: string[] }> {
  // 简化版本：基于会议数据生成摘要
  // 实际环境中应该调用AI API进行深度分析
  
  const messageCount = messages.length;
  const decisionCount = meeting.decisions.length;
  const actionItemCount = meeting.actionItems.length;
  const participantCount = meeting.participants.length;
  
  // 生成基本摘要
  const summaryParts = [
    `本次${getMeetingTypeName(meeting.type)}会议共有${participantCount}位参与者`,
    `进行了${messageCount}次讨论`,
  ];
  
  if (decisionCount > 0) {
    summaryParts.push(`做出了${decisionCount}项决策`);
  }
  
  if (actionItemCount > 0) {
    summaryParts.push(`创建了${actionItemCount}个行动项`);
  }
  
  const summary = summaryParts.join("，") + "。";
  
  // 提取关键要点
  const keyPoints: string[] = [];
  
  // 从议题中提取要点
  const completedAgenda = meeting.agenda.filter(a => a.status === "completed");
  if (completedAgenda.length > 0) {
    keyPoints.push(`完成了${completedAgenda.length}/${meeting.agenda.length}项议题讨论`);
  }
  
  // 从决策中提取要点
  meeting.decisions.forEach((decision, index) => {
    if (index < 3) { // 最多提取3个决策
      keyPoints.push(`决策${index + 1}: ${decision.content.substring(0, 50)}${decision.content.length > 50 ? "..." : ""}`);
    }
  });
  
  // 从行动项中提取要点
  if (actionItemCount > 0) {
    const highPriorityActions = meeting.actionItems.filter(a => a.priority === "high" || a.priority === "urgent").length;
    if (highPriorityActions > 0) {
      keyPoints.push(`分配了${highPriorityActions}个高优先级行动项`);
    } else {
      keyPoints.push(`分配了${actionItemCount}个行动项待执行`);
    }
  }
  
  // 如果没有提取到要点，添加默认要点
  if (keyPoints.length === 0) {
    keyPoints.push("会议按议程顺利进行");
    keyPoints.push("参与者进行了充分讨论");
    keyPoints.push("会议目标基本达成");
  }
  
  return { summary, keyPoints };
}

/**
 * 获取会议类型名称
 */
function getMeetingTypeName(type: MeetingType): string {
  const typeNames: Record<MeetingType, string> = {
    "standup": "站会",
    "review": "评审",
    "planning": "计划",
    "brainstorm": "头脑风暴",
    "decision": "决策",
    "other": "常规",
  };
  return typeNames[type] || "会议";
}
