/**
 * Phase 5: 工作空间与文档系统 - 群组工作空间管理
 * 
 * 职责:
 * 1. 创建和管理群组工作空间
 * 2. 管理群组成员
 * 3. 加载群组 Bootstrap 文件
 * 4. 管理群组权限
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  GroupWorkspace,
  GroupBootstrapFile,
  GroupMemberPermissions,
  WorkspaceStats,
} from './types.js';

/**
 * 群组工作空间管理器（单例）
 */
export class GroupWorkspaceManager {
  private static instance: GroupWorkspaceManager;
  private workspaces: Map<string, GroupWorkspace> = new Map();
  private rootDir: string;

  private constructor() {
    // 默认群组工作空间根目录: ~/.openclaw/groups/
    this.rootDir = path.join(os.homedir(), '.openclaw', 'groups');
    this.ensureRootDir();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): GroupWorkspaceManager {
    if (!GroupWorkspaceManager.instance) {
      GroupWorkspaceManager.instance = new GroupWorkspaceManager();
    }
    return GroupWorkspaceManager.instance;
  }

  /**
   * 设置群组工作空间根目录
   */
  public setRootDir(rootDir: string): void {
    this.rootDir = rootDir;
    this.ensureRootDir();
  }

  /**
   * 确保根目录存在
   */
  private ensureRootDir(): void {
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  /**
   * 确保群组工作空间存在
   * @param groupId 群组ID
   * @param groupName 群组名称
   * @param creatorId 创建者ID
   * @returns 群组工作空间对象
   */
  public ensureGroupWorkspace(
    groupId: string,
    groupName: string,
    creatorId: string
  ): GroupWorkspace {
    // 检查缓存
    if (this.workspaces.has(groupId)) {
      return this.workspaces.get(groupId)!;
    }

    const groupDir = path.join(this.rootDir, groupId);
    
    // 检查目录是否已存在
    if (fs.existsSync(groupDir)) {
      return this.loadExistingWorkspace(groupId);
    }

    // 创建新的群组工作空间
    return this.createNewWorkspace(groupId, groupName, creatorId);
  }

  /**
   * 加载已存在的群组工作空间
   */
  private loadExistingWorkspace(groupId: string): GroupWorkspace {
    const groupDir = path.join(this.rootDir, groupId);
    const groupInfoPath = path.join(groupDir, 'GROUP_INFO.md');

    // 读取 GROUP_INFO.md 获取群组信息
    let groupName = groupId;
    let createdAt = Date.now();
    let createdBy = 'system';
    let members: string[] = [];
    let admins: string[] = [];

    if (fs.existsSync(groupInfoPath)) {
      const content = fs.readFileSync(groupInfoPath, 'utf-8');
      const nameMatch = content.match(/## 群组名称\s*\n\s*(.+)/);
      const createdAtMatch = content.match(/## 创建时间\s*\n\s*(\d+)/);
      const createdByMatch = content.match(/## 创建者\s*\n\s*(.+)/);
      const membersMatch = content.match(/## 成员列表\s*\n([\s\S]*?)(?=\n##|$)/);
      const adminsMatch = content.match(/## 管理员\s*\n([\s\S]*?)(?=\n##|$)/);

      if (nameMatch) groupName = nameMatch[1].trim();
      if (createdAtMatch) createdAt = parseInt(createdAtMatch[1]);
      if (createdByMatch) createdBy = createdByMatch[1].trim();
      if (membersMatch) {
        members = membersMatch[1]
          .split('\n')
          .map(line => line.trim().replace(/^-\s*/, ''))
          .filter(line => line.length > 0);
      }
      if (adminsMatch) {
        admins = adminsMatch[1]
          .split('\n')
          .map(line => line.trim().replace(/^-\s*/, ''))
          .filter(line => line.length > 0);
      }
    }

    const workspace: GroupWorkspace = {
      groupId,
      groupName,
      dir: groupDir,
      groupInfoPath: path.join(groupDir, 'GROUP_INFO.md'),
      membersPath: path.join(groupDir, 'MEMBERS.md'),
      sharedMemoryPath: path.join(groupDir, 'SHARED_MEMORY.md'),
      rulesPath: path.join(groupDir, 'RULES.md'),
      sharedDir: path.join(groupDir, 'shared'),
      historyDir: path.join(groupDir, 'history'),
      meetingNotesDir: path.join(groupDir, 'meeting-notes'),
      decisionsDir: path.join(groupDir, 'decisions'),
      members,
      admins,
      createdAt,
      createdBy,
    };

    this.workspaces.set(groupId, workspace);
    return workspace;
  }

  /**
   * 创建新的群组工作空间
   */
  private createNewWorkspace(
    groupId: string,
    groupName: string,
    creatorId: string
  ): GroupWorkspace {
    const groupDir = path.join(this.rootDir, groupId);
    const now = Date.now();

    // 创建目录结构
    fs.mkdirSync(groupDir, { recursive: true });
    fs.mkdirSync(path.join(groupDir, 'shared'), { recursive: true });
    fs.mkdirSync(path.join(groupDir, 'history'), { recursive: true });
    fs.mkdirSync(path.join(groupDir, 'meeting-notes'), { recursive: true });
    fs.mkdirSync(path.join(groupDir, 'decisions'), { recursive: true });

    const workspace: GroupWorkspace = {
      groupId,
      groupName,
      dir: groupDir,
      groupInfoPath: path.join(groupDir, 'GROUP_INFO.md'),
      membersPath: path.join(groupDir, 'MEMBERS.md'),
      sharedMemoryPath: path.join(groupDir, 'SHARED_MEMORY.md'),
      rulesPath: path.join(groupDir, 'RULES.md'),
      sharedDir: path.join(groupDir, 'shared'),
      historyDir: path.join(groupDir, 'history'),
      meetingNotesDir: path.join(groupDir, 'meeting-notes'),
      decisionsDir: path.join(groupDir, 'decisions'),
      members: [creatorId],
      admins: [creatorId],
      createdAt: now,
      createdBy: creatorId,
    };

    // 创建初始文件
    this.createGroupInfoFile(workspace);
    this.createMembersFile(workspace);
    this.createSharedMemoryFile(workspace);
    this.createRulesFile(workspace);

    this.workspaces.set(groupId, workspace);
    return workspace;
  }

  /**
   * 创建 GROUP_INFO.md
   */
  private createGroupInfoFile(workspace: GroupWorkspace): void {
    const content = `# 群组信息

## 群组名称
${workspace.groupName}

## 群组ID
${workspace.groupId}

## 创建时间
${workspace.createdAt}

## 创建者
${workspace.createdBy}

## 成员列表
${workspace.members.map((m: string) => `- ${m}`).join('\n')}

## 管理员
${workspace.admins?.map((a: string) => `- ${a}`).join('\n') || '- ' + workspace.createdBy}

## 目录结构
- \`shared/\`: 共享文档目录
- \`history/\`: 历史记录目录
- \`meeting-notes/\`: 会议纪要目录
- \`decisions/\`: 决策记录目录
`;

    fs.writeFileSync(workspace.groupInfoPath, content, 'utf-8');
  }

  /**
   * 创建 MEMBERS.md
   */
  private createMembersFile(workspace: GroupWorkspace): void {
    const content = `# 群组成员

## 成员列表

${workspace.members.map((m: string) => `### ${m}
- 加入时间: ${workspace.createdAt}
- 权限: ${workspace.admins?.includes(m) ? '管理员' : '普通成员'}`).join('\n\n')}
`;

    fs.writeFileSync(workspace.membersPath, content, 'utf-8');
  }

  /**
   * 创建 SHARED_MEMORY.md
   */
  private createSharedMemoryFile(workspace: GroupWorkspace): void {
    const content = `# 群组共享记忆

## 群组介绍
${workspace.groupName} 的共享知识库。

## 重要信息
（此处记录群组的共享知识和重要信息）

## 常用链接
（此处记录常用的链接和资源）
`;

    fs.writeFileSync(workspace.sharedMemoryPath, content, 'utf-8');
  }

  /**
   * 创建 RULES.md
   */
  private createRulesFile(workspace: GroupWorkspace): void {
    const content = `# 群组规则

## 基本规则
1. 尊重所有成员
2. 保护群组隐私
3. 遵守使用规范

## 权限说明
- **管理员**: 可以管理成员、修改群组信息、管理权限
- **普通成员**: 可以查看和编辑共享文档、参与讨论

## 文件访问规则
- **可读取**: 所有成员可以读取共享文档
- **可写入**: 所有成员可以写入共享文档
- **私密文件隔离**: 成员的私密记忆文件（MEMORY.md）在群组中不可访问
`;

    fs.writeFileSync(workspace.rulesPath, content, 'utf-8');
  }

  /**
   * 加载群组 Bootstrap 文件
   * @param groupId 群组ID
   * @returns Bootstrap 文件列表
   */
  public loadGroupBootstrapFiles(groupId: string): GroupBootstrapFile[] {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      throw new Error(`群组工作空间不存在: ${groupId}`);
    }

    const files: GroupBootstrapFile[] = [];

    // 1. GROUP_INFO.md (优先级: 1)
    if (fs.existsSync(workspace.groupInfoPath)) {
      files.push({
        type: 'group-info',
        path: workspace.groupInfoPath,
        content: fs.readFileSync(workspace.groupInfoPath, 'utf-8'),
        readonly: true,
        priority: 1,
      });
    }

    // 2. MEMBERS.md (优先级: 2)
    if (fs.existsSync(workspace.membersPath)) {
      files.push({
        type: 'members',
        path: workspace.membersPath,
        content: fs.readFileSync(workspace.membersPath, 'utf-8'),
        readonly: true,
        priority: 2,
      });
    }

    // 3. SHARED_MEMORY.md (优先级: 3)
    if (fs.existsSync(workspace.sharedMemoryPath)) {
      files.push({
        type: 'shared-memory',
        path: workspace.sharedMemoryPath,
        content: fs.readFileSync(workspace.sharedMemoryPath, 'utf-8'),
        readonly: false,
        priority: 3,
      });
    }

    // 4. RULES.md (优先级: 4)
    if (fs.existsSync(workspace.rulesPath)) {
      files.push({
        type: 'rules',
        path: workspace.rulesPath,
        content: fs.readFileSync(workspace.rulesPath, 'utf-8'),
        readonly: true,
        priority: 4,
      });
    }

    // 按优先级排序
    files.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    return files;
  }

  /**
   * 检查智能助手是否可以访问群组工作空间
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @returns 是否可以访问
   */
  public canAccessGroupWorkspace(groupId: string, agentId: string): boolean {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return false;
    }
    return workspace.members.includes(agentId);
  }

  /**
   * 获取群组成员列表
   * @param groupId 群组ID
   * @returns 成员ID列表
   */
  public getGroupMembers(groupId: string): string[] {
    const workspace = this.workspaces.get(groupId);
    return workspace?.members || [];
  }

  /**
   * 获取群组管理员列表
   * @param groupId 群组ID
   * @returns 管理员ID列表
   */
  public getGroupAdmins(groupId: string): string[] {
    const workspace = this.workspaces.get(groupId);
    return workspace?.admins || [];
  }

  /**
   * 添加群组成员
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public addGroupMember(groupId: string, agentId: string, operatorId: string): boolean {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return false;
    }

    // 检查操作者是否为管理员
    if (!workspace.admins?.includes(operatorId)) {
      return false;
    }

    // 检查成员是否已存在
    if (workspace.members.includes(agentId)) {
      return true;
    }

    // 添加成员
    workspace.members.push(agentId);
    workspace.updatedAt = Date.now();
    workspace.updatedBy = operatorId;

    // 更新文件
    this.createGroupInfoFile(workspace);
    this.createMembersFile(workspace);

    return true;
  }

  /**
   * 移除群组成员
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public removeGroupMember(groupId: string, agentId: string, operatorId: string): boolean {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return false;
    }

    // 检查操作者是否为管理员
    if (!workspace.admins?.includes(operatorId)) {
      return false;
    }

    // 不能移除创建者
    if (agentId === workspace.createdBy) {
      return false;
    }

    // 移除成员
    const index = workspace.members.indexOf(agentId);
    if (index === -1) {
      return true;
    }

    workspace.members.splice(index, 1);

    // 同时移除管理员权限（如果有）
    if (workspace.admins) {
      const adminIndex = workspace.admins.indexOf(agentId);
      if (adminIndex !== -1) {
        workspace.admins.splice(adminIndex, 1);
      }
    }

    workspace.updatedAt = Date.now();
    workspace.updatedBy = operatorId;

    // 更新文件
    this.createGroupInfoFile(workspace);
    this.createMembersFile(workspace);

    return true;
  }

  /**
   * 更新群组信息
   * @param groupId 群组ID
   * @param groupName 新的群组名称
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public updateGroupInfo(groupId: string, groupName: string, operatorId: string): boolean {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return false;
    }

    // 检查操作者是否为管理员
    if (!workspace.admins?.includes(operatorId)) {
      return false;
    }

    workspace.groupName = groupName;
    workspace.updatedAt = Date.now();
    workspace.updatedBy = operatorId;

    // 更新文件
    this.createGroupInfoFile(workspace);

    return true;
  }

  /**
   * 获取成员权限
   * @param groupId 群组ID
   * @param agentId 智能助手ID
   * @returns 成员权限
   */
  public getMemberPermissions(groupId: string, agentId: string): GroupMemberPermissions {
    const workspace = this.workspaces.get(groupId);
    const isAdmin = workspace?.admins?.includes(agentId) || false;
    const isMember = workspace?.members.includes(agentId) || false;

    return {
      isAdmin,
      canRead: isMember,
      canWrite: isMember,
      canDelete: isAdmin,
      canInvite: isAdmin,
      canKick: isAdmin,
    };
  }

  /**
   * 获取工作空间统计信息
   * @param groupId 群组ID
   * @returns 统计信息
   */
  public getWorkspaceStats(groupId: string): WorkspaceStats | null {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return null;
    }

    let totalFiles = 0;
    let totalSize = 0;
    let lastModified = workspace.createdAt;

    const countFilesInDir = (dir: string): void => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          countFilesInDir(fullPath);
        } else {
          totalFiles++;
          totalSize += stat.size;
          if (stat.mtimeMs > lastModified) {
            lastModified = stat.mtimeMs;
          }
        }
      }
    };

    countFilesInDir(workspace.dir);

    return {
      totalFiles,
      totalSize,
      lastModified,
      memberCount: workspace.members.length,
    };
  }

  /**
   * 获取所有群组工作空间
   * @returns 群组工作空间列表
   */
  public getAllWorkspaces(): GroupWorkspace[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * 删除群组工作空间
   * @param groupId 群组ID
   * @param operatorId 操作者ID
   * @returns 是否成功
   */
  public deleteGroupWorkspace(groupId: string, operatorId: string): boolean {
    const workspace = this.workspaces.get(groupId);
    if (!workspace) {
      return false;
    }

    // 只有创建者可以删除群组
    if (operatorId !== workspace.createdBy) {
      return false;
    }

    // 删除目录
    if (fs.existsSync(workspace.dir)) {
      fs.rmSync(workspace.dir, { recursive: true, force: true });
    }

    // 从缓存中移除
    this.workspaces.delete(groupId);

    return true;
  }
}

/**
 * 导出单例实例
 */
export const groupWorkspaceManager = GroupWorkspaceManager.getInstance();
