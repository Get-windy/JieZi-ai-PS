/**
 * Phase 5: 工作空间与文档系统 - 文件工具安全拦截
 *
 * 职责:
 * 1. 拦截文件读写操作
 * 2. 应用工作空间访问控制
 * 3. 提供安全的文件操作接口
 * 4. 记录文件访问日志
 * 5. Phase 3: 集成权限检查系统
 */

import * as fs from "fs";
import * as path from "path";
import type { PermissionCheckContext } from "../permissions/checker.js";
import { permissionIntegrator } from "../permissions/integration.js";
import { SessionType, WorkspaceResolution } from "./types.js";
import { workspaceAccessControl } from "./workspace-access-control.js";

/**
 * 文件操作结果
 */
export interface FileOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  redirectedPath?: string;
}

/**
 * 文件访问日志
 */
export interface FileAccessLog {
  timestamp: number;
  agentId: string;
  operation: "read" | "write" | "delete";
  filePath: string;
  allowed: boolean;
  reason?: string;
  sessionKey: string;
}

/**
 * 文件工具安全拦截器（单例）
 */
export class FileToolsSecureInterceptor {
  private static instance: FileToolsSecureInterceptor;
  private logs: FileAccessLog[] = [];
  private maxLogs: number = 1000;
  private enableLogging: boolean = true;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): FileToolsSecureInterceptor {
    if (!FileToolsSecureInterceptor.instance) {
      FileToolsSecureInterceptor.instance = new FileToolsSecureInterceptor();
    }
    return FileToolsSecureInterceptor.instance;
  }

  /**
   * 设置日志配置
   */
  public setLoggingConfig(enabled: boolean, maxLogs?: number): void {
    this.enableLogging = enabled;
    if (maxLogs !== undefined) {
      this.maxLogs = maxLogs;
    }
  }

  /**
   * 记录访问日志
   */
  private logAccess(log: FileAccessLog): void {
    if (!this.enableLogging) {
      return;
    }

    this.logs.push(log);

    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * 获取访问日志
   */
  public getAccessLogs(agentId?: string, sessionKey?: string, limit?: number): FileAccessLog[] {
    let logs = [...this.logs];

    if (agentId) {
      logs = logs.filter((log) => log.agentId === agentId);
    }

    if (sessionKey) {
      logs = logs.filter((log) => log.sessionKey === sessionKey);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  /**
   * 清除访问日志
   */
  public clearAccessLogs(): void {
    this.logs = [];
  }

  /**
   * 安全读取文件
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 文件内容或错误
   */
  public async secureReadFile(
    filePath: string,
    workspace: WorkspaceResolution,
  ): Promise<FileOperationResult<string>> {
    const startTime = Date.now();

    // === Phase 3: 权限检查拦截 ===
    if (workspace.agentId) {
      const permissionContext: PermissionCheckContext = {
        subject: {
          type: "user",
          id: workspace.agentId,
          name: workspace.agentId,
        },
        toolName: "file_read",
        toolParams: {
          filePath,
          workspaceRoot: workspace.rootDir,
        },
        sessionId: workspace.sessionKey,
        agentId: workspace.agentId,
        timestamp: startTime,
        metadata: {
          sessionType: workspace.sessionType,
        },
      };

      const permissionResult = await permissionIntegrator.checkToolPermission(permissionContext);

      if (!permissionResult.allowed) {
        // 记录日志
        this.logAccess({
          timestamp: startTime,
          agentId: workspace.agentId,
          operation: "read",
          filePath,
          allowed: false,
          reason: permissionResult.reason || "权限被拒绝",
          sessionKey: workspace.sessionKey,
        });

        if (permissionResult.requiresApproval) {
          // 需要审批
          const approvalRequest = await permissionIntegrator.createApprovalRequest(
            permissionContext,
            permissionResult.approvalId,
          );

          return {
            success: false,
            error: `file_read requires approval. Request ID: ${approvalRequest.id}. Reason: ${permissionResult.reason || "Approval required"}`,
          };
        } else {
          // 直接拒绝
          return {
            success: false,
            error: `file_read permission denied. Reason: ${permissionResult.reason || "Access denied"}`,
          };
        }
      }
    }
    // === 权限检查结束 ===

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "read",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 读取文件
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        success: true,
        data: content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `读取文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param workspace 工作空间解析结果
   * @returns 操作结果
   */
  public async secureWriteFile(
    filePath: string,
    content: string,
    workspace: WorkspaceResolution,
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now();

    // === Phase 3: 权限检查拦截 ===
    if (workspace.agentId) {
      const permissionContext: PermissionCheckContext = {
        subject: {
          type: "user",
          id: workspace.agentId,
          name: workspace.agentId,
        },
        toolName: "file_write",
        toolParams: {
          filePath,
          workspaceRoot: workspace.rootDir,
          contentLength: content.length,
        },
        sessionId: workspace.sessionKey,
        agentId: workspace.agentId,
        timestamp: startTime,
        metadata: {
          sessionType: workspace.sessionType,
        },
      };

      const permissionResult = await permissionIntegrator.checkToolPermission(permissionContext);

      if (!permissionResult.allowed) {
        // 记录日志
        this.logAccess({
          timestamp: startTime,
          agentId: workspace.agentId,
          operation: "write",
          filePath,
          allowed: false,
          reason: permissionResult.reason || "权限被拒绝",
          sessionKey: workspace.sessionKey,
        });

        if (permissionResult.requiresApproval) {
          // 需要审批
          const approvalRequest = await permissionIntegrator.createApprovalRequest(
            permissionContext,
            permissionResult.approvalId,
          );

          return {
            success: false,
            error: `file_write requires approval. Request ID: ${approvalRequest.id}. Reason: ${permissionResult.reason || "Approval required"}`,
          };
        } else {
          // 直接拒绝
          return {
            success: false,
            error: `file_write permission denied. Reason: ${permissionResult.reason || "Access denied"}`,
          };
        }
      }
    }
    // === 权限检查结束 ===

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "write", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "write",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 写入文件
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, "utf-8");
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `写入文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全删除文件
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 操作结果
   */
  public secureDeleteFile(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<void> {
    const startTime = Date.now();

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "delete", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "delete",
      filePath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 删除文件
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `删除文件失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全读取目录
   * @param dirPath 目录路径
   * @param workspace 工作空间解析结果
   * @returns 文件列表或错误
   */
  public secureReadDir(
    dirPath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<string[]> {
    const startTime = Date.now();

    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(dirPath, "read", workspace);

    // 记录日志
    this.logAccess({
      timestamp: startTime,
      agentId: workspace.agentId,
      operation: "read",
      filePath: dirPath,
      allowed: checkResult.allowed,
      reason: checkResult.reason,
      sessionKey: workspace.sessionKey,
    });

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "目录访问被拒绝",
        redirectedPath: checkResult.suggestedPath,
      };
    }

    // 读取目录
    try {
      if (!fs.existsSync(dirPath)) {
        return {
          success: false,
          error: "目录不存在",
        };
      }

      const files = fs.readdirSync(dirPath);
      return {
        success: true,
        data: files,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `读取目录失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 安全检查文件是否存在
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 是否存在或错误
   */
  public secureFileExists(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<boolean> {
    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 检查文件是否存在
    try {
      const exists = fs.existsSync(filePath);
      return {
        success: true,
        data: exists,
      };
    } catch (error) {
      return {
        success: false,
        error: "检查文件失败",
      };
    }
  }

  /**
   * 安全获取文件状态
   * @param filePath 文件路径
   * @param workspace 工作空间解析结果
   * @returns 文件状态或错误
   */
  public secureFileStat(
    filePath: string,
    workspace: WorkspaceResolution,
  ): FileOperationResult<fs.Stats> {
    // 检查访问权限
    const checkResult = workspaceAccessControl.checkFileAccess(filePath, "read", workspace);

    if (!checkResult.allowed) {
      return {
        success: false,
        error: checkResult.reason || "文件访问被拒绝",
      };
    }

    // 获取文件状态
    try {
      const stat = fs.statSync(filePath);
      return {
        success: true,
        data: stat,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `获取文件状态失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 批量安全读取文件
   * @param filePaths 文件路径列表
   * @param workspace 工作空间解析结果
   * @returns 文件内容列表
   */
  public async secureBatchReadFiles(
    filePaths: string[],
    workspace: WorkspaceResolution,
  ): Promise<Map<string, FileOperationResult<string>>> {
    const results = new Map<string, FileOperationResult<string>>();

    for (const filePath of filePaths) {
      results.set(filePath, await this.secureReadFile(filePath, workspace));
    }

    return results;
  }

  /**
   * 获取文件访问统计
   * @param agentId 智能助手ID（可选）
   * @returns 统计信息
   */
  public getAccessStats(agentId?: string): {
    totalAccesses: number;
    allowedAccesses: number;
    deniedAccesses: number;
    operationCounts: {
      read: number;
      write: number;
      delete: number;
    };
  } {
    let logs = this.logs;

    if (agentId) {
      logs = logs.filter((log) => log.agentId === agentId);
    }

    const stats = {
      totalAccesses: logs.length,
      allowedAccesses: logs.filter((log) => log.allowed).length,
      deniedAccesses: logs.filter((log) => !log.allowed).length,
      operationCounts: {
        read: logs.filter((log) => log.operation === "read").length,
        write: logs.filter((log) => log.operation === "write").length,
        delete: logs.filter((log) => log.operation === "delete").length,
      },
    };

    return stats;
  }

  /**
   * 导出访问日志
   * @param outputPath 输出路径（可选）
   * @returns 日志JSON字符串
   */
  public exportAccessLogs(outputPath?: string): string {
    const logsJson = JSON.stringify(this.logs, null, 2);

    if (outputPath) {
      try {
        fs.writeFileSync(outputPath, logsJson, "utf-8");
      } catch (error) {
        console.error("导出日志失败:", error);
      }
    }

    return logsJson;
  }
}

/**
 * 导出单例实例
 */
export const fileToolsSecure = FileToolsSecureInterceptor.getInstance();

/**
 * 便捷函数：安全读取文件
 */
export async function readFileSecure(
  filePath: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): Promise<FileOperationResult<string>> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return await fileToolsSecure.secureReadFile(filePath, workspace);
}

/**
 * 便捷函数：安全写入文件
 */
export async function writeFileSecure(
  filePath: string,
  content: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): Promise<FileOperationResult<void>> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return await fileToolsSecure.secureWriteFile(filePath, content, workspace);
}

/**
 * 便捷函数：安全删除文件
 */
export function deleteFileSecure(
  filePath: string,
  sessionKey: string,
  sessionType: SessionType,
  agentId: string,
  groupId?: string,
): FileOperationResult<void> {
  const workspace = workspaceAccessControl.resolveWorkspace(
    sessionKey,
    sessionType,
    agentId,
    groupId,
  );
  return fileToolsSecure.secureDeleteFile(filePath, workspace);
}
