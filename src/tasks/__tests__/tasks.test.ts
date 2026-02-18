/**
 * Tasks系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as storage from "../storage.js";
import type { Task, Meeting, TaskStatus, TaskPriority } from "../types.js";

describe("Tasks Storage", () => {
  beforeEach(() => {
    storage.clearCache();
  });

  describe("Task CRUD Operations", () => {
    it("should create and retrieve a task", async () => {
      const task: Task = {
        id: "test-task-1",
        title: "Test Task",
        description: "This is a test task",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "medium",
        timeTracking: {
          timeSpent: 0,
          lastActivityAt: Date.now(),
        },
        createdAt: Date.now(),
      };

      await storage.createTask(task);
      const retrieved = await storage.getTask(task.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe(task.title);
      expect(retrieved?.status).toBe("todo");
    });

    it("should update a task", async () => {
      const task: Task = {
        id: "test-task-2",
        title: "Task to Update",
        description: "Description",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "low",
        timeTracking: {
          timeSpent: 0,
          lastActivityAt: Date.now(),
        },
        createdAt: Date.now(),
      };

      await storage.createTask(task);
      await storage.updateTask(task.id, { status: "in-progress", priority: "high" });
      
      const updated = await storage.getTask(task.id);
      expect(updated?.status).toBe("in-progress");
      expect(updated?.priority).toBe("high");
    });

    it("should delete a task", async () => {
      const task: Task = {
        id: "test-task-3",
        title: "Task to Delete",
        description: "Description",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "medium",
        timeTracking: {
          timeSpent: 0,
          lastActivityAt: Date.now(),
        },
        createdAt: Date.now(),
      };

      await storage.createTask(task);
      const deleted = await storage.deleteTask(task.id);
      
      expect(deleted).toBe(true);
      const retrieved = await storage.getTask(task.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("Task Filtering", () => {
    beforeEach(async () => {
      // 创建测试数据
      const tasks: Task[] = [
        {
          id: "task-filter-1",
          title: "High Priority Task",
          description: "Description",
          creatorId: "user-1",
          creatorType: "human",
          assignees: [{ id: "agent-1", type: "agent", role: "owner", assignedAt: Date.now(), assignedBy: "user-1" }],
          status: "todo",
          priority: "high",
          organizationId: "org-1",
          timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
          createdAt: Date.now(),
        },
        {
          id: "task-filter-2",
          title: "In Progress Task",
          description: "Description",
          creatorId: "user-1",
          creatorType: "human",
          assignees: [{ id: "agent-2", type: "agent", role: "assignee", assignedAt: Date.now(), assignedBy: "user-1" }],
          status: "in-progress",
          priority: "medium",
          organizationId: "org-1",
          timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
          createdAt: Date.now(),
        },
        {
          id: "task-filter-3",
          title: "Completed Task",
          description: "Description",
          creatorId: "user-2",
          creatorType: "human",
          assignees: [],
          status: "done",
          priority: "low",
          organizationId: "org-2",
          timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
          createdAt: Date.now(),
        },
      ];

      for (const task of tasks) {
        await storage.createTask(task);
      }
    });

    it("should filter by status", async () => {
      const tasks = await storage.listTasks({ status: "todo" });
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.every(t => t.status === "todo")).toBe(true);
    });

    it("should filter by priority", async () => {
      const tasks = await storage.listTasks({ priority: "high" });
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.every(t => t.priority === "high")).toBe(true);
    });

    it("should filter by assignee", async () => {
      const tasks = await storage.listTasks({ assigneeId: "agent-1" });
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.every(t => t.assignees.some(a => a.id === "agent-1"))).toBe(true);
    });

    it("should filter by organization", async () => {
      const tasks = await storage.listTasks({ organizationId: "org-1" });
      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks.every(t => t.organizationId === "org-1")).toBe(true);
    });
  });

  describe("Task Comments", () => {
    const taskId = "task-comments-test";

    beforeEach(async () => {
      const task: Task = {
        id: taskId,
        title: "Task with Comments",
        description: "Description",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "medium",
        timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
        createdAt: Date.now(),
      };
      await storage.createTask(task);
    });

    it("should add and retrieve comments", async () => {
      const comment = {
        id: "comment-1",
        taskId,
        authorId: "user-1",
        authorType: "human" as const,
        content: "This is a test comment",
        createdAt: Date.now(),
      };

      await storage.addTaskComment(comment);
      const comments = await storage.getTaskComments(taskId);
      
      expect(comments.length).toBe(1);
      expect(comments[0].content).toBe(comment.content);
    });
  });

  describe("Task Dependencies", () => {
    it("should detect circular dependencies", async () => {
      // 创建任务
      const task1: Task = {
        id: "dep-task-1",
        title: "Task 1",
        description: "Description",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "medium",
        timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
        createdAt: Date.now(),
      };
      const task2: Task = {
        id: "dep-task-2",
        title: "Task 2",
        description: "Description",
        creatorId: "user-1",
        creatorType: "human",
        assignees: [],
        status: "todo",
        priority: "medium",
        timeTracking: { timeSpent: 0, lastActivityAt: Date.now() },
        createdAt: Date.now(),
      };

      await storage.createTask(task1);
      await storage.createTask(task2);

      // 添加依赖：task1 -> task2
      await storage.addTaskDependency({
        id: "dep-1",
        taskId: "dep-task-1",
        dependsOnTaskId: "dep-task-2",
        dependencyType: "blocks",
        createdAt: Date.now(),
        createdBy: "user-1",
      });

      // 检测循环：task2 -> task1 会形成循环
      const hasCircular = await storage.checkCircularDependency("dep-task-2", "dep-task-1");
      expect(hasCircular).toBe(true);
    });
  });
});

describe("Meetings Storage", () => {
  beforeEach(() => {
    storage.clearCache();
  });

  describe("Meeting CRUD Operations", () => {
    it("should create and retrieve a meeting", async () => {
      const meeting: Meeting = {
        id: "meeting-1",
        title: "Test Meeting",
        description: "This is a test meeting",
        organizerId: "user-1",
        organizerType: "human",
        participants: [],
        type: "standup",
        status: "scheduled",
        scheduledAt: Date.now() + 3600000,
        duration: 30,
        agenda: [],
        decisions: [],
        actionItems: [],
        createdAt: Date.now(),
      };

      await storage.createMeeting(meeting);
      const retrieved = await storage.getMeeting(meeting.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe(meeting.title);
      expect(retrieved?.status).toBe("scheduled");
    });

    it("should update meeting status", async () => {
      const meeting: Meeting = {
        id: "meeting-2",
        title: "Meeting to Update",
        description: "Description",
        organizerId: "user-1",
        organizerType: "human",
        participants: [],
        type: "review",
        status: "scheduled",
        scheduledAt: Date.now() + 3600000,
        duration: 60,
        agenda: [],
        decisions: [],
        actionItems: [],
        createdAt: Date.now(),
      };

      await storage.createMeeting(meeting);
      await storage.updateMeeting(meeting.id, { status: "in-progress", startedAt: Date.now() });
      
      const updated = await storage.getMeeting(meeting.id);
      expect(updated?.status).toBe("in-progress");
      expect(updated?.startedAt).toBeDefined();
    });

    it("should add meeting decisions", async () => {
      const meeting: Meeting = {
        id: "meeting-3",
        title: "Meeting with Decisions",
        description: "Description",
        organizerId: "user-1",
        organizerType: "human",
        participants: [],
        type: "decision",
        status: "in-progress",
        scheduledAt: Date.now(),
        duration: 45,
        agenda: [],
        decisions: [],
        actionItems: [],
        createdAt: Date.now(),
      };

      await storage.createMeeting(meeting);
      
      const decision = {
        id: "decision-1",
        meetingId: meeting.id,
        content: "We decided to proceed with option A",
        proposedBy: "user-1",
        createdAt: Date.now(),
      };

      await storage.addMeetingDecision(decision);
      const updated = await storage.getMeeting(meeting.id);
      
      expect(updated?.decisions.length).toBe(1);
      expect(updated?.decisions[0].content).toBe(decision.content);
    });

    it("should add meeting action items", async () => {
      const meeting: Meeting = {
        id: "meeting-4",
        title: "Meeting with Action Items",
        description: "Description",
        organizerId: "user-1",
        organizerType: "human",
        participants: [],
        type: "planning",
        status: "in-progress",
        scheduledAt: Date.now(),
        duration: 45,
        agenda: [],
        decisions: [],
        actionItems: [],
        createdAt: Date.now(),
      };

      await storage.createMeeting(meeting);
      
      const actionItem = {
        id: "action-1",
        meetingId: meeting.id,
        description: "Complete the documentation",
        assigneeId: "user-2",
        assigneeType: "human" as const,
        priority: "high" as const,
        status: "pending" as const,
        createdAt: Date.now(),
      };

      await storage.addMeetingActionItem(actionItem);
      const updated = await storage.getMeeting(meeting.id);
      
      expect(updated?.actionItems.length).toBe(1);
      expect(updated?.actionItems[0].description).toBe(actionItem.description);
    });
  });

  describe("Meeting Filtering", () => {
    beforeEach(async () => {
      const now = Date.now();
      const meetings: Meeting[] = [
        {
          id: "meeting-filter-1",
          title: "Upcoming Standup",
          organizerId: "user-1",
          organizerType: "human",
          participants: [{ id: "user-2", type: "human", role: "attendee", response: "accepted" }],
          type: "standup",
          status: "scheduled",
          scheduledAt: now + 3600000,
          duration: 15,
          organizationId: "org-1",
          agenda: [],
          decisions: [],
          actionItems: [],
          createdAt: now,
        },
        {
          id: "meeting-filter-2",
          title: "Completed Review",
          organizerId: "user-1",
          organizerType: "human",
          participants: [],
          type: "review",
          status: "completed",
          scheduledAt: now - 86400000,
          duration: 60,
          organizationId: "org-1",
          startedAt: now - 86400000,
          endedAt: now - 82800000,
          agenda: [],
          decisions: [],
          actionItems: [],
          createdAt: now - 86400000,
        },
      ];

      for (const meeting of meetings) {
        await storage.createMeeting(meeting);
      }
    });

    it("should filter by status", async () => {
      const meetings = await storage.listMeetings({ status: "scheduled" });
      expect(meetings.length).toBeGreaterThanOrEqual(1);
      expect(meetings.every(m => m.status === "scheduled")).toBe(true);
    });

    it("should filter by type", async () => {
      const meetings = await storage.listMeetings({ type: "standup" });
      expect(meetings.length).toBeGreaterThanOrEqual(1);
      expect(meetings.every(m => m.type === "standup")).toBe(true);
    });

    it("should filter by participant", async () => {
      const meetings = await storage.listMeetings({ participantId: "user-2" });
      expect(meetings.length).toBeGreaterThanOrEqual(1);
      expect(meetings.every(m => m.participants.some(p => p.id === "user-2"))).toBe(true);
    });

    it("should filter by organization", async () => {
      const meetings = await storage.listMeetings({ organizationId: "org-1" });
      expect(meetings.length).toBeGreaterThanOrEqual(2);
      expect(meetings.every(m => m.organizationId === "org-1")).toBe(true);
    });
  });
});
