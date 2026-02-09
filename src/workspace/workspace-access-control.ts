/**
 * Phase 5: 工作空间与文档系统 - 工作空间访问控制
 *
 * 职责:
 * 1. 解析工作空间类型和路径
 * 2. 实施文件访问控制
 * 3. 拦截和重定向文件操作
 * 4. 管理访问权限
 */

import * as os from "os";
import * as path from "path";
import { groupWorkspaceManager } from "./group-workspace";
import {
  SessionType,
  WorkspaceType,
  WorkspaceResolution,
  WorkspaceAccessControl,
  FileAccessCheckResult,
  FileAccessPermissions,
} from "./types";

/**
 * 工作空间访问控制管理器（单例）
 */
export class WorkspaceAccessControlManager {
  private static instance: WorkspaceAccessControlManager;
  private agentWorkspaceRoot: string;

  private constructor() {
    // 默认智能助手工作空间根目录: ~/.openclaw/
    this.agentWorkspaceRoot = path.join(os.homedir(), ".openclaw");
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): WorkspaceAccessControlManager {
    if (!WorkspaceAccessControlManager.instance) {
      WorkspaceAccessControlManager.instance = new WorkspaceAccessControlManager();
    }
    return WorkspaceAccessControlManager.instance;
  }

  /**
   * 设置智能助手工作空间根目录
   */
  public setAgentWorkspaceRoot(rootDir: string): void {
    this.agentWorkspaceRoot = rootDir;
  }

  /**
   * 解析工作空间
   * @param sessionKey 会话唯一标识
   * @param sessionType 会话类型
   * @param agentId 智能助手ID
   * @param groupId 群组ID（如果是群组会话）
   * @returns 工作空间解析结果
   */
  public resolveWorkspace(
    sessionKey: string,
    sessionType: SessionType,
    agentId: string,
    groupId?: string,
  ): WorkspaceResolution {
    // 根据会话类型确定工作空间类型
    const workspaceType: WorkspaceType = this.getWorkspaceType(sessionType);
    let rootDir: string;
    let accessControl: WorkspaceAccessControl;

    if (workspaceType === "group" && groupId) {
      // 群组工作空间
      const workspace = groupWorkspaceManager.ensureGroupWorkspace(groupId, groupId, agentId);
      rootDir = workspace.dir;
      accessControl = this.buildGroupAccessControl(groupId, agentId);
    } else {
      // 智能助手个人工作空间
      rootDir = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);
      accessControl = this.buildAgentAccessControl(agentId);
    }

    return {
      type: workspaceType,
      rootDir,
      sessionKey,
      sessionType,
      agentId,
      groupId,
      accessControl,
    };
  }

  /**
   * 根据会话类型判断工作空间类型
   */
  private getWorkspaceType(sessionType: SessionType): WorkspaceType {
    switch (sessionType) {
      case "group":
      case "channel":
        return "group";
      case "dm":
      case "main":
      default:
        return "agent";
    }
  }

  /**
   * 构建智能助手工作空间的访问控制配置
   */
  private buildAgentAccessControl(agentId: string): WorkspaceAccessControl {
    const workspaceRoot = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);

    return {
      // 允许访问的路径（相对于工作空间根目录）
      allowedPaths: [
        "**/*", // 允许访问所有文件
      ],
      // 禁止访问的路径
      blockedPaths: [],
      // 默认权限：全部允许
      defaultPermissions: {
        canRead: true,
        canWrite: true,
        canDelete: true,
      },
    };
  }

  /**
   * 构建群组工作空间的访问控制配置
   */
  private buildGroupAccessControl(groupId: string, agentId: string): WorkspaceAccessControl {
    const isAdmin = groupWorkspaceManager.getGroupAdmins(groupId).includes(agentId);
    const isMember = groupWorkspaceManager.getGroupMembers(groupId).includes(agentId);

    if (!isMember) {
      // 非成员：完全禁止访问
      return {
        allowedPaths: [],
        blockedPaths: ["**/*"],
        defaultPermissions: {
          canRead: false,
          canWrite: false,
          canDelete: false,
        },
      };
    }

    // 成员：可以访问群组文件，但不能访问其他智能助手的工作空间
    return {
      // 允许访问的路径
      allowedPaths: [
        "GROUP_INFO.md",
        "MEMBERS.md",
        "SHARED_MEMORY.md",
        "RULES.md",
        "shared/**/*",
        "history/**/*",
        "meeting-notes/**/*",
        "decisions/**/*",
      ],
      // 禁止访问的路径
      blockedPaths: [
        // 禁止访问其他智能助手的工作空间
        `${this.agentWorkspaceRoot}/workspace-*`,
        // 排除自己的工作空间
        `!${this.agentWorkspaceRoot}/workspace-${agentId}`,
      ],
      // 默认权限
      defaultPermissions: {
        canRead: true,
        canWrite: !isAdmin, // 普通成员可写
        canDelete: isAdmin, // 只有管理员可删除
      },
    };
  }

  /**
   * 检查文件访问权限
   * @param filePath 文件路径（绝对路径）
   * @param operation 操作类型
   * @param workspace 工作空间解析结果
   * @returns 访问检查结果
   */
  public checkFileAccess(
    filePath: string,
    operation: "read" | "write" | "delete",
    workspace: WorkspaceResolution,
  ): FileAccessCheckResult {
    const { type, rootDir, accessControl, agentId } = workspace;

    // 规范化文件路径
    const normalizedPath = path.normalize(filePath);
    const relativePath = this.getRelativePath(normalizedPath, rootDir);

    // 1. 检查是否在工作空间根目录内
    if (!relativePath) {
      return this.checkCrossWorkspaceAccess(normalizedPath, workspace);
    }

    // 2. 检查黑名单
    if (this.isPathBlocked(relativePath, accessControl.blockedPaths)) {
      return {
        allowed: false,
        reason: `文件 ${relativePath} 在黑名单中，禁止访问`,
      };
    }

    // 3. 检查白名单
    if (!this.isPathAllowed(relativePath, accessControl.allowedPaths)) {
      return {
        allowed: false,
        reason: `文件 ${relativePath} 不在白名单中，禁止访问`,
      };
    }

    // 4. 检查操作权限
    const permissions = accessControl.defaultPermissions;
    if (operation === "read" && !permissions.canRead) {
      return {
        allowed: false,
        reason: `没有读取权限: ${relativePath}`,
      };
    }
    if (operation === "write" && !permissions.canWrite) {
      return {
        allowed: false,
        reason: `没有写入权限: ${relativePath}`,
      };
    }
    if (operation === "delete" && !permissions.canDelete) {
      return {
        allowed: false,
        reason: `没有删除权限: ${relativePath}`,
      };
    }

    // 5. 群组工作空间特殊规则：禁止访问其他成员的私密文件
    if (type === "group") {
      if (this.isPrivateFile(relativePath)) {
        return {
          allowed: false,
          reason: `私密文件禁止在群组中访问: ${relativePath}`,
          suggestedPath: this.suggestSharedPath(relativePath, rootDir),
        };
      }
    }

    // 全部检查通过
    return {
      allowed: true,
    };
  }

  /**
   * 检查跨工作空间访问
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 访问检查结果
   */
  private checkCrossWorkspaceAccess(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileAccessCheckResult {
    const { agentId, type, rootDir } = workspace;

    // 如果在智能助手工作空间根目录下
    if (filePath.startsWith(this.agentWorkspaceRoot)) {
      // 检查是否访问自己的工作空间
      const myWorkspaceDir = path.join(this.agentWorkspaceRoot, `workspace-${agentId}`);
      if (filePath.startsWith(myWorkspaceDir)) {
        // 在群组中访问自己的工作空间
        if (type === "group") {
          const relativePath = this.getRelativePath(filePath, myWorkspaceDir);
          if (relativePath && this.isPrivateFile(relativePath)) {
            return {
              allowed: false,
              reason: `在群组中禁止访问个人私密文件: ${relativePath}`,
              suggestedPath: path.join(rootDir, "shared", path.basename(filePath)),
            };
          }
          // 可以访问自己的专业知识文件
          return { allowed: true };
        }
        // 在个人会话中访问自己的工作空间
        return { allowed: true };
      }

      // 访问其他智能助手的工作空间：禁止
      return {
        allowed: false,
        reason: `禁止访问其他智能助手的工作空间`,
      };
    }

    // 访问系统其他位置的文件：根据默认权限
    // 这里我们允许访问，但建议使用工作空间内的文件
    return {
      allowed: true,
      suggestedPath: path.join(rootDir, "shared", path.basename(filePath)),
    };
  }

  /**
   * 获取相对路径
   * @param filePath 绝对路径
   * @param rootDir 根目录
   * @returns 相对路径（如果文件在根目录内），否则返回 null
   */
  private getRelativePath(filePath: string, rootDir: string): string | null {
    const normalized = path.normalize(filePath);
    const normalizedRoot = path.normalize(rootDir);

    if (normalized.startsWith(normalizedRoot)) {
      return path.relative(normalizedRoot, normalized);
    }

    return null;
  }

  /**
   * 检查路径是否被黑名单阻止
   * @param relativePath 相对路径
   * @param blockedPaths 黑名单模式列表
   * @returns 是否被阻止
   */
  private isPathBlocked(relativePath: string, blockedPaths: string[]): boolean {
    return this.matchPaths(relativePath, blockedPaths);
  }

  /**
   * 检查路径是否在白名单中
   * @param relativePath 相对路径
   * @param allowedPaths 白名单模式列表
   * @returns 是否允许
   */
  private isPathAllowed(relativePath: string, allowedPaths: string[]): boolean {
    return this.matchPaths(relativePath, allowedPaths);
  }

  /**
   * 匹配路径模式（支持通配符）
   * @param relativePath 相对路径
   * @param patterns 模式列表
   * @returns 是否匹配
   */
  private matchPaths(relativePath: string, patterns: string[]): boolean {
    const normalized = path.normalize(relativePath).replace(/\\/g, "/");

    for (const pattern of patterns) {
      if (this.matchPattern(normalized, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 匹配单个模式
   * @param filePath 文件路径
   * @param pattern 模式（支持 * 和 **）
   * @returns 是否匹配
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    // 转换为正则表达式
    const regexPattern = normalizedPattern
      .replace(/\*\*/g, "___DOUBLE_STAR___")
      .replace(/\*/g, "[^/]*")
      .replace(/___DOUBLE_STAR___/g, ".*")
      .replace(/\?/g, "[^/]");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * 判断是否为私密文件
   * @param relativePath 相对路径
   * @returns 是否为私密文件
   */
  private isPrivateFile(relativePath: string): boolean {
    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const privatePatterns = ["MEMORY.md", "memory/**/*", ".private/**/*"];

    return this.matchPaths(normalized, privatePatterns);
  }

  /**
   * 建议使用共享路径
   * @param originalPath 原始路径
   * @param rootDir 根目录
   * @returns 建议的共享路径
   */
  private suggestSharedPath(originalPath: string, rootDir: string): string {
    const basename = path.basename(originalPath);
    return path.join(rootDir, "shared", basename);
  }

  /**
   * 拦截文件操作并重定向
   * @param filePath 原始文件路径
   * @param operation 操作类型
   * @param workspace 工作空间解析结果
   * @returns 重定向后的文件路径，如果不允许则返回 null
   */
  public interceptFileOperation(
    filePath: string,
    operation: "read" | "write" | "delete",
    workspace: WorkspaceResolution,
  ): string | null {
    const checkResult = this.checkFileAccess(filePath, operation, workspace);

    if (checkResult.allowed) {
      return filePath;
    }

    // 如果有建议路径，返回建议路径
    if (checkResult.suggestedPath) {
      console.warn(`文件访问被拦截: ${checkResult.reason}`);
      console.warn(`建议使用路径: ${checkResult.suggestedPath}`);
      return checkResult.suggestedPath;
    }

    // 完全禁止
    console.error(`文件访问被拒绝: ${checkResult.reason}`);
    return null;
  }

  /**
   * 获取工作空间的文件权限
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 文件权限
   */
  public getFilePermissions(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileAccessPermissions {
    const readCheck = this.checkFileAccess(filePath, "read", workspace);
    const writeCheck = this.checkFileAccess(filePath, "write", workspace);
    const deleteCheck = this.checkFileAccess(filePath, "delete", workspace);

    return {
      canRead: readCheck.allowed,
      canWrite: writeCheck.allowed,
      canDelete: deleteCheck.allowed,
    };
  }

  /**
   * 验证工作空间配置
   * @param accessControl 访问控制配置
   * @returns 是否有效
   */
  public validateAccessControl(accessControl: WorkspaceAccessControl): boolean {
    // 检查白名单和黑名单是否有冲突
    if (!accessControl.allowedPaths || accessControl.allowedPaths.length === 0) {
      console.warn("访问控制配置警告: allowedPaths 为空");
      return false;
    }

    // 检查默认权限
    if (!accessControl.defaultPermissions) {
      console.warn("访问控制配置警告: defaultPermissions 未定义");
      return false;
    }

    return true;
  }
}

/**
 * 导出单例实例
 */
export const workspaceAccessControl = WorkspaceAccessControlManager.getInstance();
