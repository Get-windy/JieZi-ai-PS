/**
 * Phase 5: 工作空间与文档系统 - 集成测试
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Message } from "./types";
import { phase5Integration, initializePhase5, phase5HealthCheck } from "./phase5-integration";

describe("Phase 5 Integration Tests", () => {
  const testWorkspaceRoot = path.join(os.tmpdir(), "openclaw-test-phase5");
  const testAgentId = "test-agent-001";
  const testGroupId = "test-group-001";
  const testSessionKey = "test-session-001";

  beforeAll(async () => {
    // 初始化 Phase 5
    await initializePhase5({
      agentWorkspaceRoot: testWorkspaceRoot,
      enableFileAccessLog: true,
      maxLogEntries: 100,
      groups: {
        workspace: {
          root: path.join(testWorkspaceRoot, "groups"),
          enabled: true,
        },
        defaults: {
          memberPermissions: {
            canRead: true,
            canWrite: true,
            canDelete: false,
          },
          enableKnowledgeSedimentation: true,
        },
        groups: [
          {
            id: testGroupId,
            name: "Test Group",
            description: "A test group for integration testing",
            admins: [testAgentId],
            members: [testAgentId],
          },
        ],
      },
    });
  });

  afterAll(() => {
    // 清理测试数据
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }

    // 关闭 Phase 5
    phase5Integration.shutdown();
  });

  describe("初始化测试", () => {
    it("应该成功初始化 Phase 5", () => {
      expect(phase5Integration.isInitialized()).toBe(true);
    });

    it("应该通过健康检查", () => {
      const health = phase5HealthCheck();
      expect(health.healthy).toBe(true);
      expect(health.components.groupWorkspaceManager).toBe(true);
      expect(health.components.workspaceAccessControl).toBe(true);
      expect(health.components.bootstrapLoader).toBe(true);
      expect(health.components.knowledgeSedimentation).toBe(true);
      expect(health.components.fileToolsSecure).toBe(true);
    });
  });

  describe("群组工作空间测试", () => {
    it("应该创建群组工作空间", () => {
      const workspace = phase5Integration.createGroup(
        "test-group-002",
        "Test Group 2",
        testAgentId,
      );

      expect(workspace).toBeDefined();
      expect(workspace.groupId).toBe("test-group-002");
      expect(workspace.groupName).toBe("Test Group 2");
      expect(workspace.createdBy).toBe(testAgentId);
    });

    it("应该添加群组成员", () => {
      const success = phase5Integration.addGroupMember(testGroupId, "test-agent-002", testAgentId);

      expect(success).toBe(true);

      const members = phase5Integration.getGroupMembers(testGroupId);
      expect(members).toContain("test-agent-002");
    });

    it("应该移除群组成员", () => {
      // 先添加成员
      phase5Integration.addGroupMember(testGroupId, "test-agent-003", testAgentId);

      // 然后移除
      const success = phase5Integration.removeGroupMember(
        testGroupId,
        "test-agent-003",
        testAgentId,
      );

      expect(success).toBe(true);

      const members = phase5Integration.getGroupMembers(testGroupId);
      expect(members).not.toContain("test-agent-003");
    });

    it("应该获取所有群组", () => {
      const groups = phase5Integration.getAllGroups();
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.some((g) => g.groupId === testGroupId)).toBe(true);
    });
  });

  describe("工作空间解析测试", () => {
    it("应该解析个人工作空间", () => {
      const workspace = phase5Integration.resolveWorkspace(testSessionKey, "dm", testAgentId);

      expect(workspace.type).toBe("agent");
      expect(workspace.agentId).toBe(testAgentId);
      expect(workspace.accessControl).toBeDefined();
    });

    it("应该解析群组工作空间", () => {
      const workspace = phase5Integration.resolveWorkspace(
        testSessionKey,
        "group",
        testAgentId,
        testGroupId,
      );

      expect(workspace.type).toBe("group");
      expect(workspace.agentId).toBe(testAgentId);
      expect(workspace.groupId).toBe(testGroupId);
      expect(workspace.accessControl).toBeDefined();
    });
  });

  describe("Bootstrap 文件加载测试", () => {
    it("应该为个人会话加载 Bootstrap 文件", () => {
      // 创建测试文件
      const agentWorkspace = path.join(testWorkspaceRoot, `workspace-${testAgentId}`);
      if (!fs.existsSync(agentWorkspace)) {
        fs.mkdirSync(agentWorkspace, { recursive: true });
      }

      fs.writeFileSync(
        path.join(agentWorkspace, "AGENTS.md"),
        "# Test Agent\n\nThis is a test agent.",
        "utf-8",
      );

      const files = phase5Integration.loadBootstrapForSession(testSessionKey, "dm", testAgentId);

      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.path.includes("AGENTS.md"))).toBe(true);
    });

    it("应该为群组会话加载 Bootstrap 文件", () => {
      const files = phase5Integration.loadBootstrapForSession(
        testSessionKey,
        "group",
        testAgentId,
        testGroupId,
      );

      expect(files).toBeDefined();
      // 群组 Bootstrap 文件应该包含群组信息
      expect(files.some((f) => f.path.includes("GROUP_INFO.md"))).toBe(true);
    });
  });

  describe("文件访问控制测试", () => {
    it("应该允许在个人工作空间读取文件", () => {
      const agentWorkspace = path.join(testWorkspaceRoot, `workspace-${testAgentId}`);
      const testFilePath = path.join(agentWorkspace, "test-file.txt");

      // 创建测试文件
      if (!fs.existsSync(agentWorkspace)) {
        fs.mkdirSync(agentWorkspace, { recursive: true });
      }
      fs.writeFileSync(testFilePath, "Test content", "utf-8");

      const result = phase5Integration.readFileSecure(
        testFilePath,
        testSessionKey,
        "dm",
        testAgentId,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe("Test content");
    });

    it("应该允许在个人工作空间写入文件", () => {
      const agentWorkspace = path.join(testWorkspaceRoot, `workspace-${testAgentId}`);
      const testFilePath = path.join(agentWorkspace, "test-write.txt");

      const result = phase5Integration.writeFileSecure(
        testFilePath,
        "New content",
        testSessionKey,
        "dm",
        testAgentId,
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(testFilePath)).toBe(true);
      expect(fs.readFileSync(testFilePath, "utf-8")).toBe("New content");
    });

    it("应该获取文件访问统计", () => {
      const stats = phase5Integration.getFileAccessStats(testAgentId);

      expect(stats).toBeDefined();
      expect(stats.totalAccesses).toBeGreaterThan(0);
    });
  });

  describe("知识沉淀测试", () => {
    it("应该手动沉淀知识", () => {
      const messages: Message[] = [
        {
          id: "msg-001",
          senderId: testAgentId,
          content: "我们需要决定使用哪个架构方案",
          timestamp: Date.now(),
          metadata: { importance: "high", keywords: ["决定", "架构"] },
        },
        {
          id: "msg-002",
          senderId: "test-agent-002",
          content: "我建议使用微服务架构",
          timestamp: Date.now() + 1000,
          metadata: { importance: "medium" },
        },
        {
          id: "msg-003",
          senderId: testAgentId,
          content: "同意，我们就采用微服务架构",
          timestamp: Date.now() + 2000,
          metadata: { importance: "high" },
        },
      ];

      const result = phase5Integration.manualSedimentKnowledge(
        testGroupId,
        messages,
        "decision",
        "架构决策-微服务",
      );

      expect(result).toBeDefined();
      expect(result.category).toBe("decision");
      expect(result.title).toBe("架构决策-微服务");
      expect(result.participants).toContain(testAgentId);
      expect(result.messageCount).toBe(3);
      expect(fs.existsSync(result.documentPath)).toBe(true);
    });

    it("应该搜索知识文档", () => {
      const documents = phase5Integration.searchKnowledge(testGroupId, "架构");

      expect(documents).toBeDefined();
      expect(documents.length).toBeGreaterThan(0);
    });

    it("应该获取知识文档列表", () => {
      const documents = phase5Integration.getKnowledgeDocuments(testGroupId, "decision");

      expect(documents).toBeDefined();
      expect(documents.length).toBeGreaterThan(0);
    });
  });

  describe("缓存管理测试", () => {
    it("应该清除缓存", () => {
      // 先加载 Bootstrap 文件（会缓存）
      phase5Integration.loadBootstrapForSession(testSessionKey, "dm", testAgentId);

      // 清除缓存
      phase5Integration.clearCache();

      // 再次加载应该重新读取
      const files = phase5Integration.loadBootstrapForSession(testSessionKey, "dm", testAgentId);

      expect(files).toBeDefined();
    });
  });

  describe("配置重载测试", () => {
    it("应该重新加载配置", async () => {
      await phase5Integration.reloadConfig({
        agentWorkspaceRoot: testWorkspaceRoot,
        enableFileAccessLog: false,
      });

      expect(phase5Integration.isInitialized()).toBe(true);
    });
  });

  describe("错误处理测试", () => {
    it("应该处理不存在的群组", () => {
      expect(() => {
        phase5Integration.getGroupMembers("non-existent-group");
      }).not.toThrow();
    });

    it("应该处理无权限的文件访问", () => {
      // 尝试访问其他用户的私密文件
      const otherAgentWorkspace = path.join(testWorkspaceRoot, "workspace-other-agent");
      const privateFile = path.join(otherAgentWorkspace, "MEMORY.md");

      if (!fs.existsSync(otherAgentWorkspace)) {
        fs.mkdirSync(otherAgentWorkspace, { recursive: true });
      }
      fs.writeFileSync(privateFile, "Private content", "utf-8");

      // 在群组会话中尝试访问
      const result = phase5Integration.readFileSecure(
        privateFile,
        testSessionKey,
        "group",
        testAgentId,
        testGroupId,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
