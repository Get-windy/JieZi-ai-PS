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
import { groupWorkspaceManager } from "./group-workspace";
import {
  SessionType,
  BootstrapFile,
  WorkspaceBootstrapFile,
  GroupBootstrapFile,
  WorkspaceResolution,
} from "./types";
import { workspaceAccessControl } from "./workspace-access-control";

/**
 * Bootstrap 文件加载器（单例）
 */
export class BootstrapLoader {
  private static instance: BootstrapLoader;
  private agentWorkspaceRoot: string;
  private cache: Map<string, BootstrapFile[]> = new Map();

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
   * 加载智能助手工作空间的 Bootstrap 文件
   * @param agentId 智能助手ID
   * @returns Bootstrap 文件列表
   */
  public loadAgentBootstrapFiles(agentId: string): WorkspaceBootstrapFile[] {
    const workspaceDir = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);
    const files: WorkspaceBootstrapFile[] = [];

    // 确保工作空间存在
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    // 1. AGENTS.md (优先级: 1)
    const agentsPath = path.join(workspaceDir, "AGENTS.md");
    if (fs.existsSync(agentsPath)) {
      files.push({
        type: "agents",
        path: agentsPath,
        content: fs.readFileSync(agentsPath, "utf-8"),
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

    // 6. MEMORY.md (优先级: 6)
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    if (fs.existsSync(memoryPath)) {
      files.push({
        type: "memory",
        path: memoryPath,
        content: fs.readFileSync(memoryPath, "utf-8"),
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
    const workspaceDir = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);
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
      if (!fs.existsSync(dir)) return;

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
      const fileType = (file as any).type;
      return types.includes(fileType);
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
    // 检查只读属性
    if (file.readonly) {
      console.error(`无法保存只读文件: ${file.path}`);
      return false;
    }

    try {
      // 确保目录存在
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(file.path, content, "utf-8");

      // 更新缓存中的内容
      file.content = content;

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
