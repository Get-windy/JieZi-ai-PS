/**
 * 人类身份鉴权 Gateway RPC 方法
 */

import type { GatewayRequestHandlers } from "./types.js";
import { HumanAuthenticationManager } from "../../auth/human-authentication.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const authManager = HumanAuthenticationManager.getInstance();

export const humanAuthHandlers: GatewayRequestHandlers = {
  /**
   * 用户注册
   */
  "humanAuth.register": async ({ params, respond }) => {
    try {
      const username = String(params?.username ?? "").trim();
      const email = String(params?.email ?? "").trim();
      const password = String(params?.password ?? "").trim();
      const type = String(params?.type ?? "member").trim() as any;

      if (!username || !email || !password) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "username, email and password are required"),
        );
        return;
      }

      const user = await authManager.registerUser({
        username,
        email,
        password,
        type,
        fullName: params?.fullName ? String(params.fullName) : undefined,
        phone: params?.phone ? String(params.phone) : undefined,
      });

      respond(true, { user }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to register user: ${String(error)}`),
      );
    }
  },

  /**
   * 用户登录
   */
  "humanAuth.login": async ({ params, respond }) => {
    try {
      const username = String(params?.username ?? "").trim();
      const password = String(params?.password ?? "").trim();

      if (!username || !password) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "username and password are required"),
        );
        return;
      }

      const result = await authManager.login({
        username,
        password,
        ipAddress: params?.ipAddress ? String(params.ipAddress) : undefined,
        userAgent: params?.userAgent ? String(params.userAgent) : undefined,
      });

      if (!result.success) {
        respond(false, result, errorShape(ErrorCodes.UNAUTHORIZED, result.error || "Login failed"));
        return;
      }

      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to login: ${String(error)}`),
      );
    }
  },

  /**
   * 验证 MFA
   */
  "humanAuth.verifyMFA": async ({ params, respond }) => {
    try {
      const challengeId = String(params?.challengeId ?? "").trim();
      const code = String(params?.code ?? "").trim();

      if (!challengeId || !code) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "challengeId and code are required"),
        );
        return;
      }

      const result = await authManager.verifyMFA(challengeId, code);

      if (!result.success) {
        respond(
          false,
          result,
          errorShape(ErrorCodes.UNAUTHORIZED, result.error || "MFA verification failed"),
        );
        return;
      }

      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to verify MFA: ${String(error)}`),
      );
    }
  },

  /**
   * 注销
   */
  "humanAuth.logout": async ({ params, respond }) => {
    try {
      const sessionToken = String(params?.sessionToken ?? "").trim();

      if (!sessionToken) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionToken is required"),
        );
        return;
      }

      await authManager.logout(sessionToken);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to logout: ${String(error)}`),
      );
    }
  },

  /**
   * 验证会话
   */
  "humanAuth.validateSession": async ({ params, respond }) => {
    try {
      const sessionToken = String(params?.sessionToken ?? "").trim();

      if (!sessionToken) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionToken is required"),
        );
        return;
      }

      const session = await authManager.validateSession(sessionToken);

      if (!session) {
        respond(false, { valid: false }, errorShape(ErrorCodes.UNAUTHORIZED, "Invalid session"));
        return;
      }

      const user = authManager.getUser(session.userId);
      respond(true, { valid: true, session, user }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to validate session: ${String(error)}`),
      );
    }
  },

  /**
   * 获取当前用户信息
   */
  "humanAuth.getCurrentUser": async ({ params, respond }) => {
    try {
      const sessionToken = String(params?.sessionToken ?? "").trim();

      if (!sessionToken) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sessionToken is required"),
        );
        return;
      }

      const session = await authManager.validateSession(sessionToken);

      if (!session) {
        respond(false, undefined, errorShape(ErrorCodes.UNAUTHORIZED, "Invalid session"));
        return;
      }

      const user = authManager.getUser(session.userId);

      if (!user) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "User not found"));
        return;
      }

      respond(true, { user }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get current user: ${String(error)}`),
      );
    }
  },

  /**
   * 列出所有用户
   */
  "humanAuth.listUsers": async ({ params, respond }) => {
    try {
      const users = authManager.listUsers();
      respond(true, { users, total: users.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list users: ${String(error)}`),
      );
    }
  },

  /**
   * 启用 MFA
   */
  "humanAuth.enableMFA": async ({ params, respond }) => {
    try {
      const userId = String(params?.userId ?? "").trim();

      if (!userId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "userId is required"));
        return;
      }

      const result = await authManager.enableMFA(userId);
      respond(true, result, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to enable MFA: ${String(error)}`),
      );
    }
  },

  /**
   * 禁用 MFA
   */
  "humanAuth.disableMFA": async ({ params, respond }) => {
    try {
      const userId = String(params?.userId ?? "").trim();

      if (!userId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "userId is required"));
        return;
      }

      await authManager.disableMFA(userId);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to disable MFA: ${String(error)}`),
      );
    }
  },

  /**
   * 更新用户
   */
  "humanAuth.updateUser": async ({ params, respond }) => {
    try {
      const userId = String(params?.userId ?? "").trim();

      if (!userId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "userId is required"));
        return;
      }

      const updates: any = {};
      if (params?.email) updates.email = String(params.email);
      if (params?.type) updates.type = String(params.type);
      if (params?.enabled !== undefined) updates.enabled = Boolean(params.enabled);
      if (params?.metadata) updates.metadata = params.metadata;

      const user = await authManager.updateUser(userId, updates);
      respond(true, { user }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update user: ${String(error)}`),
      );
    }
  },

  /**
   * 修改密码
   */
  "humanAuth.changePassword": async ({ params, respond }) => {
    try {
      const userId = String(params?.userId ?? "").trim();
      const oldPassword = String(params?.oldPassword ?? "").trim();
      const newPassword = String(params?.newPassword ?? "").trim();

      if (!userId || !oldPassword || !newPassword) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "userId, oldPassword and newPassword are required",
          ),
        );
        return;
      }

      await authManager.changePassword(userId, oldPassword, newPassword);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to change password: ${String(error)}`),
      );
    }
  },
};
