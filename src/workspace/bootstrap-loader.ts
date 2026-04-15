/**
 * Phase 5: 工作空间与文档系统 - Bootstrap 文件加载器
 *
 * 职责:
 * 1. 加载智能助手工作空间的 Bootstrap 文件
 * 2. 加载群组工作空间的 Bootstrap 文件
 * 3. 根据会话类型自动选择和注入 Bootstrap 文件
 * 4. 管理 Bootstrap 文件的优先级和只读属性
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadConfig } from "../../upstream/src/config/config.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import {
  getSkillsSummaryForBootstrap,
  getRelevantReflectionsForBootstrap,
  getToolsCatalogForBootstrap,
} from "../gateway/server-methods/evolve-rpc.js";
import { getGroupsWorkspaceRoot } from "../utils/project-context.js";
import {
  trimMemoryContent,
  archiveMemoryOverflow,
  getMemoryFileConfig,
} from "./file-tools-secure.js";
import { groupWorkspaceManager } from "./group-workspace.js";
import { SessionType, BootstrapFile, WorkspaceBootstrapFile } from "./types.js";
import { workspaceAccessControl } from "./workspace-access-control.js";

/**
 * Bootstrap 文件加载器（单例）
 */
export class BootstrapLoader {
  private static instance: BootstrapLoader;
  private agentWorkspaceRoot: string;
  private cache: Map<string, BootstrapFile[]> = new Map();

  /**
   * MEMORY.md 自动裁剪阈值——改由 file-tools-secure.ts 的 MEMORY_FILE_MAX_CHARS 提供
   * 不再在此类重复定义，保持全局唯一入口
   */

  private constructor() {
    // 默认智能助手工作空间根目录: ~/.openclaw/
    this.agentWorkspaceRoot = path.join(os.homedir(), ".openclaw");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): BootstrapLoader {
    if (!BootstrapLoader.instance) {
      BootstrapLoader.instance = new BootstrapLoader();
    }
    return BootstrapLoader.instance;
  }

  /**
   * 设置智能助手工作空间根目录
   */
  public setAgentWorkspaceRoot(rootDir: string): void {
    this.agentWorkspaceRoot = rootDir;
    this.clearCache();
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * 加载 Bootstrap 文件
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @param useCache 是否使用缓存
   * @returns Bootstrap 文件列表
   */
  public loadBootstrapFiles(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
    useCache: boolean = true,
  ): BootstrapFile[] {
    // 检查缓存
    const cacheKey = this.getCacheKey(sessionKey, sessionType, agentId, groupId);
    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 解析工作空间
    const workspace = workspaceAccessControl.resolveWorkspace(
      sessionKey,
      sessionType,
      agentId,
      groupId,
    );

    let files: BootstrapFile[] = [];

    // 根据工作空间类型加载文件
    if (workspace.type === "agent") {
      files = this.loadAgentBootstrapFiles(agentId);
    } else if (workspace.type === "group" && groupId) {
      files = this.loadGroupBootstrapFilesWithAgent(groupId, agentId);
    }

    // 按优先级排序
    files.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // 缓存结果
    if (useCache) {
      this.cache.set(cacheKey, files);
    }

    return files;
  }

  /**
   * 生成系统路径声明块，追加到 AGENTS.md 内容末尾，
   * 让 Agent 启动后立即知道自己的 agentId、个人工作空间路径、项目工作空间根路径，
   * 彻底消除 Agent 猜错路径的可能。
   */
  private buildSystemPathDeclaration(agentId: string, workspaceDir: string): string {
    const groupsRoot = getGroupsWorkspaceRoot();
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    return [
      "",
      "---",
      "## 🗂️ 系统路径声明（系统自动注入，每次启动更新，禁止手动修改此区块）",
      "",
      `- **我的 Agent ID**：\`${agentId}\``,
      `- **我的个人工作空间**：\`${workspaceDir}\``,
      `  - 个人记忆文件：\`${path.join(workspaceDir, "MEMORY.md")}\``,
      `  - 每日日志目录：\`${path.join(workspaceDir, "memory", "YYYY-MM-DD.md")}\``,
      `  - 技能目录：\`${path.join(workspaceDir, "skills")}\``,
      `- **项目工作空间根目录**：\`${groupsRoot}\``,
      `  - 每个项目的工作空间：\`${groupsRoot}\\{projectId}\`（存放记忆、文档、决策）`,
      `  - 项目共享记忆：\`${groupsRoot}\\{projectId}\\SHARED_MEMORY.md\``,
      `  - 项目配置文件：\`${groupsRoot}\\{projectId}\\PROJECT_CONFIG.json\``,
      `  ⚠️  **项目工作空间 ≠ 代码目录**：实际代码存放在 PROJECT_CONFIG.json 的 codeDir 字段所指向的路径，`,
      `     例如 \`I:\\AI-Ready\`，与工作空间路径完全不同，必须用 project_list 工具获取后才能使用。`,
      "",
      "**操作要求**：",
      "- 写文件时必须使用上述绝对路径，禁止猜测或使用相对路径",
      "- 代码文件必须写入项目的 codeDir 路径（从 project_list 返回结果中读取），不得写入工作空间目录",
      "- 读取项目记忆前必须先用 `project_list` 工具获取真实 projectId，再拼接路径",
      "- 本区块由系统在每次会话启动时自动注入，内容以本次为准",
      "",
      "**启动自检三步（每次会话必须执行）**：",
      "1. 确认路径：核对以上「我的个人工作空间」路径与本机实际一致，若不一致立即告知用户",
      "2. 查询项目：调用 `project_list` 获取当前真实项目列表，重点记录每个项目的 codeDir（代码目录）和 workspacePath（文档/记忆目录），两者不同",
      "3. 校验层级：写入 MEMORY.md 前判断内容是否属于个人认知（✅）或项目成果（❌ → 应写 SHARED_MEMORY.md）；写代码时确认用的是 codeDir 而非 workspacePath",
      "",
      `*注入时间：${now}*`,
      "---",
    ].join("\n");
  }

  /**
   * 加载智能助手工作空间的 Bootstrap 文件
   * @param agentId 智能助手ID
   * @returns Bootstrap 文件列表
   */
  public loadAgentBootstrapFiles(agentId: string): WorkspaceBootstrapFile[] {
    // 优先读取 openclaw.json 中该 agent 配置的 workspace 字段（自定义路径）
    // 与 resolveAgentWorkspaceDir 保持一致：配置 > 默认值（~/.openclaw/workspace-{id}）
    // 这样即使 agentWorkspaceRoot 是上游默认值，也能正确找到实际工作空间
    let workspaceDir: string;
    try {
      const cfg = loadConfig();
      workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    } catch {
      // loadConfig 失败时回退到旧逻辑，使用 defaults.workspace/{id} 格式减少旧路径污染
      workspaceDir = path.join(this.agentWorkspaceRoot, `${agentId}`);
    }
    const files: WorkspaceBootstrapFile[] = [];

    // 确保工作空间存在
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    // 1. AGENTS.md (优先级: 1)
    const agentsPath = path.join(workspaceDir, "AGENTS.md");
    if (fs.existsSync(agentsPath)) {
      // 追加系统路径声明，让 Agent 每次启动都知道正确路径，不依赖人工配置
      const rawContent = fs.readFileSync(agentsPath, "utf-8");
      // 移除上次注入的旧路径声明区块（避免重复累积）
      const cleanContent = rawContent
        .replace(/\n---\n## 🗂️ 系统路径声明[\s\S]*?---\n?$/, "")
        .trimEnd();
      const contentWithPaths =
        cleanContent + this.buildSystemPathDeclaration(agentId, workspaceDir);
      files.push({
        type: "agents",
        path: agentsPath,
        content: contentWithPaths,
        readonly: false,
        priority: 1,
      });
    }

    // 2. SOUL.md (优先级: 2)
    const soulPath = path.join(workspaceDir, "SOUL.md");
    if (fs.existsSync(soulPath)) {
      files.push({
        type: "soul",
        path: soulPath,
        content: fs.readFileSync(soulPath, "utf-8"),
        readonly: false,
        priority: 2,
      });
    }

    // 3. TOOLS.md (优先级: 3)
    const toolsPath = path.join(workspaceDir, "TOOLS.md");
    if (fs.existsSync(toolsPath)) {
      files.push({
        type: "tools",
        path: toolsPath,
        content: fs.readFileSync(toolsPath, "utf-8"),
        readonly: false,
        priority: 3,
      });
    }

    // 4. IDENTITY.md (优先级: 4)
    const identityPath = path.join(workspaceDir, "IDENTITY.md");
    if (fs.existsSync(identityPath)) {
      files.push({
        type: "identity",
        path: identityPath,
        content: fs.readFileSync(identityPath, "utf-8"),
        readonly: false,
        priority: 4,
      });
    }

    // 5. USER.md (优先级: 5)
    const userPath = path.join(workspaceDir, "USER.md");
    if (fs.existsSync(userPath)) {
      files.push({
        type: "user",
        path: userPath,
        content: fs.readFileSync(userPath, "utf-8"),
        readonly: false,
        priority: 5,
      });
    }

    // 6. MEMORY.md 等记忆型文件（优先级: 6）
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    if (fs.existsSync(memoryPath)) {
      let memoryContent = fs.readFileSync(memoryPath, "utf-8");
      // 加载时检查是否需要归档：超限则归档旧内容，主文件保留索引+最新内容
      const archResult = archiveMemoryOverflow(memoryContent, memoryPath);
      if (archResult.archived) {
        try {
          const archiveDir = path.dirname(archResult.archiveFilePath);
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }
          fs.appendFileSync(archResult.archiveFilePath, archResult.archiveContent, "utf-8");
          fs.writeFileSync(memoryPath, archResult.newMainContent, "utf-8");
          memoryContent = archResult.newMainContent;
          console.log(
            `[BootstrapLoader] MEMORY.md 加载时归档转移: ${archResult.originalLength} → 主文件 ${memoryContent.length} 字符，归档: ${archResult.archiveFilePath}`,
          );
        } catch (err) {
          console.warn(`[BootstrapLoader] MEMORY.md 归档写入失败 (仅内存使用原内容):`, err);
        }
      }
      files.push({
        type: "memory",
        path: memoryPath,
        content: memoryContent,
        readonly: false,
        priority: 6,
      });
    }

    // 7. skills/ 目录下的技能文件 (优先级: 7+)
    const skillsDir = path.join(workspaceDir, "skills");
    if (fs.existsSync(skillsDir)) {
      const skillFiles = this.loadSkillFiles(skillsDir);
      files.push(...skillFiles);
    }

    // 8. P0：技能目录摘要块（优先级: 50）
    // 业界实践（Letta / Claude Code Skills）：启动时注入技能目录摘要（只有名称+描述）
    // Agent 根据当前任务按需调用 agent_skill_list 获取具体内容，避免全量加载占用 context
    const skillsSummary = getSkillsSummaryForBootstrap(agentId);
    if (skillsSummary.length > 0) {
      const categoryLabels: Record<string, string> = {
        workflow: "流程",
        code: "代码",
        strategy: "策略",
        template: "模板",
      };
      const skillLines = skillsSummary.map((s) => {
        const cat = categoryLabels[s.category] ?? s.category;
        const triggers =
          s.triggers.length > 0 ? `（触发词: ${s.triggers.slice(0, 4).join(", ")}）` : "";
        return `- **${s.name}** [${cat}]${triggers}: ${s.description}`;
      });
      const skillsBlock = [
        "## 🛠️ 技能库摘要（系统自动注入，按需调用 agent_skill_list 获取详情）",
        "",
        `共 ${skillsSummary.length} 个可用技能，开始复杂任务前先用 \`agent_skill_list\` 检索相关技能，避免重复发明轮子。`,
        "",
        ...skillLines,
      ].join("\n");
      files.push({
        type: "custom",
        path: path.join(workspaceDir, "_skills_summary.virtual"),
        content: skillsBlock,
        readonly: true,
        priority: 50,
      });
    }

    // 9. P1：相关反思注入块（优先级: 51）
    // 业界实践（Reflexion / MemOS）：启动时按任务相似度自动检索最相关历史反思
    // 无 contextHint 时返回最近 3 条（防止 Agent 先前反思能展示就完全看不到）
    const reflections = getRelevantReflectionsForBootstrap(agentId, "", { limit: 3 });
    if (reflections.length > 0) {
      const outcomeLabels: Record<string, string> = {
        success: "✅ 成功",
        partial: "⚠️ 部分完成",
        failure: "❌ 失败",
      };
      const refLines = reflections.map((r, i) => {
        const label = outcomeLabels[r.outcome] ?? r.outcome;
        const lessonsStr = r.lessons.length > 0 ? `\n  教训: ${r.lessons.join("; ")}` : "";
        return [
          `${i + 1}. ${label} 「${r.taskSummary}」`,
          `  ${r.reflection.slice(0, 200)}${r.reflection.length > 200 ? "..." : ""}${lessonsStr}`,
        ].join("\n");
      });
      const reflectBlock = [
        "## 💡 近期反思摘要（系统自动注入，执行关联任务前可调用 agent_reflect 查看详情）",
        "",
        "这些是你最近的任务反思，开始相似任务前请先回顾，防止重躈覆辙：",
        "",
        ...refLines,
      ].join("\n");
      files.push({
        type: "custom",
        path: path.join(workspaceDir, "_reflections_summary.virtual"),
        content: reflectBlock,
        readonly: true,
        priority: 51,
      });
    }

    // 10. P2：工具目录摘要块（优先级: 52）
    // 业界实践（RAG-MCP / Anthropic）：启动时注入工具目录（name + 首句描述），
    // 当工具数超过 15 个时尤为重要，帮助 Agent 快速定位工具，减少幻觉调用。
    // 此处使用静态分组注入，不依赖运行时工具实例（bootstrap 与工具列表解耦）。
    // 若需基于运行时工具列表动态生成，可调用 BootstrapLoader.buildToolsCatalogBlock(tools, workspaceDir)。
    const staticToolGroups: Array<{ group: string; tools: string[] }> = [
      {
        group: "📋 任务管理",
        tools: [
          "task_create",
          "task_list",
          "task_get",
          "task_update",
          "task_complete",
          "task_delete",
          "task_subtask_create",
          "task_worklog_add",
        ],
      },
      { group: "📁 项目管理", tools: ["project_create", "project_list", "project_update_status"] },
      {
        group: "🤖 Agent 管理",
        tools: [
          "agents_list",
          "agent_discover",
          "agent_inspect",
          "agent_status",
          "agent_capabilities",
          "agent_assign_task",
          "agent_communicate",
          "agent_spawn",
          "agent_start",
          "agent_stop",
          "agent_restart",
          "agent_configure",
          "agent_clone",
          "agent_create",
          "agent_update",
          "agent_delete",
        ],
      },
      {
        group: "💬 会话管理",
        tools: [
          "sessions_list",
          "sessions_send",
          "sessions_history",
          "sessions_spawn",
          "session_status",
          "subagents",
        ],
      },
      {
        group: "📨 消息通信",
        tools: [
          "message",
          "group_create",
          "group_list",
          "group_add_member",
          "group_remove_member",
          "group_send",
          "friend_add",
          "friend_remove",
          "friend_list",
        ],
      },
      {
        group: "🏢 组织 HR",
        tools: [
          "organization_create",
          "organization_list",
          "org_department",
          "org_team",
          "recruit_agent",
          "deactivate_agent",
          "activate_agent",
          "promote_agent",
          "transfer_agent",
          "train_agent",
          "training_start",
          "training_complete",
          "assess_agent",
        ],
      },
      { group: "📂 文件系统", tools: ["read", "write", "edit", "apply_patch"] },
      { group: "⚙️ 执行运行", tools: ["exec", "bash", "process"] },
      {
        group: "🧠 进化记忆",
        tools: [
          "agent_reflect",
          "agent_skill_list",
          "agent_skill_save",
          "memory_save",
          "memory_search",
          "memory_get",
        ],
      },
      { group: "🔄 自动化", tools: ["cron", "gateway", "nodes"] },
      { group: "🌐 互联网", tools: ["web_search", "web_fetch", "browser"] },
      { group: "🎨 媒体创作", tools: ["image", "tts", "canvas"] },
      {
        group: "🔐 权限审批",
        tools: [
          "perm_grant",
          "perm_revoke",
          "perm_check",
          "perm_list",
          "approve_request",
          "reject_request",
          "list_pending_approvals",
        ],
      },
    ];
    const toolCatalogLines: string[] = [
      "## 🔧 工具目录（系统自动注入，按分组速查可用工具名称）",
      "",
      "> 直接用工具名调用，系统会提示参数。不确定参数时先调用再看错误提示。",
      "",
    ];
    for (const g of staticToolGroups) {
      toolCatalogLines.push(`**${g.group}**: ${g.tools.map((t) => `\`${t}\``).join(" · ")}`);
    }
    files.push({
      type: "custom",
      path: path.join(workspaceDir, "_tools_catalog.virtual"),
      content: toolCatalogLines.join("\n"),
      readonly: true,
      priority: 52,
    });

    return files;
  }

  /**
   * 加载群组工作空间的 Bootstrap 文件（包含智能助手的专业知识）
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @returns Bootstrap 文件列表
   */
  public loadGroupBootstrapFilesWithAgent(groupId: string, agentId: string): BootstrapFile[] {
    const files: BootstrapFile[] = [];

    // 1. 加载群组 Bootstrap 文件
    const groupFiles = groupWorkspaceManager.loadGroupBootstrapFiles(groupId);
    files.push(...groupFiles);

    // 2. 加载智能助手的专业知识文件（在群组中只读）
    const agentKnowledgeFiles = this.loadAgentKnowledgeFilesForGroup(agentId);
    files.push(...agentKnowledgeFiles);

    return files;
  }

  /**
   * 加载智能助手在群组中可见的专业知识文件
   * @param agentId 智能助手ID
   * @returns Bootstrap 文件列表（只读）
   */
  private loadAgentKnowledgeFilesForGroup(agentId: string): WorkspaceBootstrapFile[] {
    let workspaceDir: string;
    try {
      const cfg = loadConfig();
      workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    } catch {
      workspaceDir = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);
    }
    const files: WorkspaceBootstrapFile[] = [];

    // 在群组中可以读取的专业知识文件
    const knowledgeFiles = [
      { path: "AGENTS.md", type: "agents" as const, priority: 10 },
      { path: "TOOLS.md", type: "tools" as const, priority: 11 },
      { path: "IDENTITY.md", type: "identity" as const, priority: 12 },
    ];

    for (const { path: fileName, type, priority } of knowledgeFiles) {
      const filePath = path.join(workspaceDir, fileName);
      if (fs.existsSync(filePath)) {
        files.push({
          type,
          path: filePath,
          content: fs.readFileSync(filePath, "utf-8"),
          readonly: true, // 在群组中只读
          priority,
        });
      }
    }

    // 加载 skills/ 目录（在群组中只读）
    const skillsDir = path.join(workspaceDir, "skills");
    if (fs.existsSync(skillsDir)) {
      const skillFiles = this.loadSkillFiles(skillsDir, true);
      files.push(...skillFiles);
    }

    return files;
  }

  /**
   * 加载技能文件
   * @param skillsDir 技能目录
   * @param readonly 是否只读
   * @returns 技能文件列表
   */
  private loadSkillFiles(skillsDir: string, readonly: boolean = false): WorkspaceBootstrapFile[] {
    const files: WorkspaceBootstrapFile[] = [];
    let priority = readonly ? 20 : 7;

    const loadDir = (dir: string): void => {
      if (!fs.existsSync(dir)) {
        return;
      }

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          loadDir(fullPath);
        } else if (item.endsWith(".md") || item.endsWith(".txt")) {
          files.push({
            type: "skill",
            path: fullPath,
            content: fs.readFileSync(fullPath, "utf-8"),
            readonly,
            priority: priority++,
          });
        }
      }
    };

    loadDir(skillsDir);
    return files;
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ): string {
    return `${sessionKey}:${sessionType}:${agentId}:${groupId || "none"}`;
  }

  /**
   * 获取 Bootstrap 文件的摘要信息
   * @param files Bootstrap 文件列表
   * @returns 摘要字符串
   */
  public getBootstrapSummary(files: BootstrapFile[]): string {
    const lines: string[] = [];
    lines.push("# Bootstrap 文件加载摘要\n");
    lines.push(`总计: ${files.length} 个文件\n`);

    files.forEach((file, index) => {
      const readonly = file.readonly ? "[只读]" : "[可写]";
      const priority = file.priority !== undefined ? `[优先级:${file.priority}]` : "";
      lines.push(`${index + 1}. ${readonly} ${priority} ${path.basename(file.path)}`);
    });

    return lines.join("\n");
  }

  /**
   * 验证 Bootstrap 文件
   * @param files Bootstrap 文件列表
   * @returns 验证结果
   */
  public validateBootstrapFiles(files: BootstrapFile[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const file of files) {
      // 检查文件路径
      if (!file.path) {
        errors.push(`文件缺少路径信息`);
        continue;
      }

      // 检查文件是否存在
      if (!fs.existsSync(file.path)) {
        errors.push(`文件不存在: ${file.path}`);
        continue;
      }

      // 检查内容是否为空
      if (!file.content || file.content.trim().length === 0) {
        errors.push(`文件内容为空: ${file.path}`);
      }

      // 检查优先级
      if (file.priority !== undefined && file.priority < 0) {
        errors.push(`文件优先级无效: ${file.path} (priority: ${file.priority})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 按类型过滤 Bootstrap 文件
   * @param files Bootstrap 文件列表
   * @param types 类型列表
   * @returns 过滤后的文件列表
   */
  public filterByType<T extends BootstrapFile>(files: T[], types: string[]): T[] {
    return files.filter((file) => {
      const asTyped = file as T & { type?: string };
      return typeof asTyped.type === "string" && types.includes(asTyped.type);
    });
  }

  /**
   * 合并 Bootstrap 文件内容为单一文本
   * @param files Bootstrap 文件列表
   * @param separator 分隔符
   * @returns 合并后的内容
   */
  public mergeBootstrapContent(files: BootstrapFile[], separator: string = "\n\n---\n\n"): string {
    return files
      .map((file) => {
        const header = `<!-- ${path.basename(file.path)} ${file.readonly ? "[只读]" : ""} -->`;
        return `${header}\n\n${file.content}`;
      })
      .join(separator);
  }

  /**
   * 保存 Bootstrap 文件
   * @param file Bootstrap 文件
   * @param content 新内容
   * @returns 是否成功
   */
  public saveBootstrapFile(file: BootstrapFile, content: string): boolean {
    if (file.readonly) {
      console.error(`无法保存只读文件: ${file.path}`);
      return false;
    }

    try {
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 对所有记忆型文件统一处理：
      //   MEMORY.md / SHARED_MEMORY.md → 归档转移（零丢失）
      //   其他（SOUL/IDENTITY/USER/AGENTS）→ 裁剪并警告
      let finalContent = content;
      const memCfg = getMemoryFileConfig(file.path);
      if (memCfg) {
        if (memCfg.archivable) {
          const archResult = archiveMemoryOverflow(content, file.path);
          if (archResult.archived) {
            try {
              const archiveDir = path.dirname(archResult.archiveFilePath);
              if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
              }
              fs.appendFileSync(archResult.archiveFilePath, archResult.archiveContent, "utf-8");
              finalContent = archResult.newMainContent;
              console.log(
                `[BootstrapLoader] saveBootstrapFile 归档转移: ${path.basename(file.path)} ${archResult.originalLength} → ${finalContent.length} 字符，归档: ${archResult.archiveFilePath}`,
              );
            } catch (err) {
              console.warn(`[BootstrapLoader] saveBootstrapFile 归档失败，保持原内容:`, err);
              finalContent = content;
            }
          }
        } else {
          const result = trimMemoryContent(content, file.path);
          if (result.trimmed) {
            finalContent = result.content;
            console.warn(
              `[BootstrapLoader] saveBootstrapFile 裁剪警告: ${path.basename(file.path)} ${result.originalLength} → ${finalContent.length} 字符`,
            );
          }
        }
      }

      fs.writeFileSync(file.path, finalContent, "utf-8");
      file.content = finalContent;
      return true;
    } catch (error) {
      console.error(`保存文件失败: ${file.path}`, error);
      return false;
    }
  }

  /**
   * 创建新的 Bootstrap 文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param type 文件类型
   * @param priority 优先级
   * @returns 创建的文件对象，失败返回 null
   */
  public createBootstrapFile(
    filePath: string,
    content: string,
    type: string,
    priority?: number,
  ): BootstrapFile | null {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(filePath, content, "utf-8");

      // 清除缓存
      this.clearCache();

      return {
        path: filePath,
        content,
        readonly: false,
        priority,
      };
    } catch (error) {
      console.error(`创建文件失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 删除 Bootstrap 文件
   * @param file Bootstrap 文件
   * @returns 是否成功
   */
  public deleteBootstrapFile(file: BootstrapFile): boolean {
    // 检查只读属性
    if (file.readonly) {
      console.error(`无法删除只读文件: ${file.path}`);
      return false;
    }

    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      // 清除缓存
      this.clearCache();

      return true;
    } catch (error) {
      console.error(`删除文件失败: ${file.path}`, error);
      return false;
    }
  }

  /**
   * 构建工具目录摘要块（供外部调用，注入 bootstrap context）
   *
   * 业界实践（RAG-MCP）：Agent 启动时注入工具目录（name + 首句描述），
   * 减少「工具不知道存在」的幻觉，同时不把完整 schema 全部塞入 context。
   * 当工具数超过 15 个（Anthropic 推荐上限）时尤为重要。
   *
   * @param tools - 当前会话已构建的工具列表（经过 policy 过滤后）
   * @param workspaceDir - 当前 agent 工作空间路径（用于生成虚拟文件路径）
   * @returns WorkspaceBootstrapFile | null（无工具时返回 null）
   */
  public static buildToolsCatalogBlock(
    tools: Array<{ name: string; description?: string }>,
    workspaceDir: string,
  ): WorkspaceBootstrapFile | null {
    if (tools.length === 0) {
      return null;
    }

    const catalog = getToolsCatalogForBootstrap(tools);
    if (catalog.length === 0) {
      return null;
    }

    const totalCount = tools.length;
    const lines: string[] = [
      `## 🔧 工具目录（系统自动注入，共 ${totalCount} 个可用工具，按分组列出名称+简介）`,
      "",
      `> 工具数量较多时 Agent 容易遗漏或混淆工具。本摘要帮助你快速定位工具，`,
      `> 详细参数请直接调用对应工具名，系统会提示参数格式。`,
    ];

    if (totalCount > 15) {
      lines.push(
        `> ⚠️ 当前共 ${totalCount} 个工具（超过业界推荐的 15 个上限），优先使用熟悉分组，避免幻觉调用。`,
      );
    }
    lines.push("");

    for (const group of catalog) {
      lines.push(`### ${group.group}`);
      for (const t of group.tools) {
        const descPart = t.desc ? ` — ${t.desc}` : "";
        lines.push(`- \`${t.name}\`${descPart}`);
      }
      lines.push("");
    }

    return {
      type: "custom",
      path: path.join(workspaceDir, "_tools_catalog.virtual"),
      content: lines.join("\n"),
      readonly: true,
      priority: 52,
    };
  }

  /**
   * 重新加载 Bootstrap 文件
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns Bootstrap 文件列表
   */
  public reloadBootstrapFiles(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ): BootstrapFile[] {
    // 清除缓存并重新加载
    return this.loadBootstrapFiles(sessionKey, sessionType, agentId, groupId, false);
  }
}

/**
 * 导出单例实例
 */
export const bootstrapLoader = BootstrapLoader.getInstance();
