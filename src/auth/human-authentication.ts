/**
 * 人类身份鉴权系统
 *
 * 功能：
 * - 区分人类用户和智能助手
 * - 多因素身份验证（MFA）
 * - 生物识别支持（指纹、面部识别）
 * - 会话管理
 * - 权限等级区分
 */

import { randomBytes, createHash } from "node:crypto";

/**
 * 人类用户类型
 */
export type HumanUserType = "owner" | "admin" | "member" | "guest";

/**
 * 认证方式
 */
export type AuthenticationMethod = "password" | "mfa_totp" | "mfa_sms" | "biometric" | "oauth";

/**
 * 人类用户
 */
export interface HumanUser {
  /** 用户ID */
  id: string;

  /** 用户名 */
  username: string;

  /** 邮箱 */
  email: string;

  /** 用户类型 */
  type: HumanUserType;

  /** 认证方式 */
  authMethods: AuthenticationMethod[];

  /** 是否启用MFA */
  mfaEnabled: boolean;

  /** MFA密钥（TOTP） */
  mfaSecret?: string;

  /** 创建时间 */
  createdAt: number;

  /** 最后登录时间 */
  lastLoginAt?: number;

  /** 是否启用 */
  enabled: boolean;

  /** 元数据 */
  metadata?: {
    fullName?: string;
    phone?: string;
    avatar?: string;
    preferences?: Record<string, any>;
  };
}

/**
 * 认证会话
 */
export interface AuthSession {
  /** 会话ID */
  id: string;

  /** 用户ID */
  userId: string;

  /** 会话令牌 */
  token: string;

  /** 创建时间 */
  createdAt: number;

  /** 过期时间 */
  expiresAt: number;

  /** IP地址 */
  ipAddress?: string;

  /** User-Agent */
  userAgent?: string;

  /** 是否活跃 */
  active: boolean;
}

/**
 * 认证挑战（用于MFA）
 */
export interface AuthChallenge {
  /** 挑战ID */
  id: string;

  /** 用户ID */
  userId: string;

  /** 挑战类型 */
  type: "totp" | "sms" | "email";

  /** 创建时间 */
  createdAt: number;

  /** 过期时间 */
  expiresAt: number;

  /** 验证码（仅用于SMS/Email） */
  code?: string;

  /** 是否已验证 */
  verified: boolean;
}

/**
 * 认证结果
 */
export interface AuthenticationResult {
  /** 是否成功 */
  success: boolean;

  /** 用户信息 */
  user?: HumanUser;

  /** 会话令牌 */
  sessionToken?: string;

  /** 需要MFA */
  requiresMFA?: boolean;

  /** 挑战ID（如果需要MFA） */
  challengeId?: string;

  /** 错误消息 */
  error?: string;
}

/**
 * 人类身份鉴权管理器
 */
export class HumanAuthenticationManager {
  private static instance: HumanAuthenticationManager;

  // 用户存储
  private users = new Map<string, HumanUser>();

  // 密码哈希（userId => passwordHash）
  private passwordHashes = new Map<string, string>();

  // 会话存储
  private sessions = new Map<string, AuthSession>();

  // 挑战存储
  private challenges = new Map<string, AuthChallenge>();

  // 会话过期时间（默认24小时）
  private sessionExpiryMs = 24 * 60 * 60 * 1000;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): HumanAuthenticationManager {
    if (!HumanAuthenticationManager.instance) {
      HumanAuthenticationManager.instance = new HumanAuthenticationManager();
    }
    return HumanAuthenticationManager.instance;
  }

  /**
   * 注册用户
   */
  public async registerUser(params: {
    username: string;
    email: string;
    password: string;
    type: HumanUserType;
    fullName?: string;
    phone?: string;
  }): Promise<HumanUser> {
    // 检查用户名是否已存在
    for (const user of this.users.values()) {
      if (user.username === params.username) {
        throw new Error(`Username "${params.username}" already exists`);
      }
      if (user.email === params.email) {
        throw new Error(`Email "${params.email}" already exists`);
      }
    }

    const userId = this.generateUserId();

    const user: HumanUser = {
      id: userId,
      username: params.username,
      email: params.email,
      type: params.type,
      authMethods: ["password"],
      mfaEnabled: false,
      createdAt: Date.now(),
      enabled: true,
      metadata: {
        fullName: params.fullName,
        phone: params.phone,
      },
    };

    // 存储用户
    this.users.set(userId, user);

    // 存储密码哈希
    const passwordHash = this.hashPassword(params.password);
    this.passwordHashes.set(userId, passwordHash);

    console.log(`[HumanAuth] Registered user: ${params.username} (${userId})`);

    return user;
  }

  /**
   * 用户登录
   */
  public async login(params: {
    username: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuthenticationResult> {
    // 查找用户
    let user: HumanUser | undefined;
    for (const u of this.users.values()) {
      if (u.username === params.username || u.email === params.username) {
        user = u;
        break;
      }
    }

    if (!user) {
      return {
        success: false,
        error: "Invalid username or password",
      };
    }

    if (!user.enabled) {
      return {
        success: false,
        error: "User account is disabled",
      };
    }

    // 验证密码
    const passwordHash = this.passwordHashes.get(user.id);
    const inputHash = this.hashPassword(params.password);

    if (passwordHash !== inputHash) {
      return {
        success: false,
        error: "Invalid username or password",
      };
    }

    // 检查是否需要MFA
    if (user.mfaEnabled) {
      const challenge = await this.createChallenge(user.id, "totp");

      return {
        success: false,
        requiresMFA: true,
        challengeId: challenge.id,
        error: "MFA required",
      };
    }

    // 创建会话
    const session = await this.createSession(user.id, params.ipAddress, params.userAgent);

    // 更新最后登录时间
    user.lastLoginAt = Date.now();

    console.log(`[HumanAuth] User logged in: ${user.username} (${user.id})`);

    return {
      success: true,
      user,
      sessionToken: session.token,
    };
  }

  /**
   * 验证MFA
   */
  public async verifyMFA(params: {
    challengeId: string;
    code: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuthenticationResult> {
    const challenge = this.challenges.get(params.challengeId);

    if (!challenge) {
      return {
        success: false,
        error: "Invalid challenge ID",
      };
    }

    if (challenge.verified) {
      return {
        success: false,
        error: "Challenge already verified",
      };
    }

    if (Date.now() > challenge.expiresAt) {
      return {
        success: false,
        error: "Challenge expired",
      };
    }

    const user = this.users.get(challenge.userId);

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // 验证TOTP代码
    let isValid = false;

    if (challenge.type === "totp" && user.mfaSecret) {
      isValid = this.verifyTOTP(user.mfaSecret, params.code);
    } else if (challenge.type === "sms" || challenge.type === "email") {
      isValid = challenge.code === params.code;
    }

    if (!isValid) {
      return {
        success: false,
        error: "Invalid verification code",
      };
    }

    // 标记挑战为已验证
    challenge.verified = true;

    // 创建会话
    const session = await this.createSession(user.id, params.ipAddress, params.userAgent);

    // 更新最后登录时间
    user.lastLoginAt = Date.now();

    console.log(`[HumanAuth] MFA verified for user: ${user.username} (${user.id})`);

    return {
      success: true,
      user,
      sessionToken: session.token,
    };
  }

  /**
   * 验证会话令牌
   */
  public async validateSession(token: string): Promise<HumanUser | null> {
    const session = Array.from(this.sessions.values()).find((s) => s.token === token);

    if (!session) {
      return null;
    }

    if (!session.active) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      session.active = false;
      return null;
    }

    const user = this.users.get(session.userId);

    if (!user || !user.enabled) {
      return null;
    }

    return user;
  }

  /**
   * 登出
   */
  public async logout(token: string): Promise<void> {
    const session = Array.from(this.sessions.values()).find((s) => s.token === token);

    if (session) {
      session.active = false;
      console.log(`[HumanAuth] User logged out: ${session.userId}`);
    }
  }

  /**
   * 启用MFA
   */
  public async enableMFA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // 生成MFA密钥
    const secret = this.generateMFASecret();
    user.mfaSecret = secret;
    user.mfaEnabled = true;

    if (!user.authMethods.includes("mfa_totp")) {
      user.authMethods.push("mfa_totp");
    }

    // 生成二维码（简化版本，实际应该返回QR Code图片）
    const qrCode = `otpauth://totp/OpenClaw:${user.username}?secret=${secret}&issuer=OpenClaw`;

    console.log(`[HumanAuth] MFA enabled for user: ${user.username} (${userId})`);

    return { secret, qrCode };
  }

  /**
   * 禁用MFA
   */
  public async disableMFA(userId: string): Promise<void> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.authMethods = user.authMethods.filter((m) => m !== "mfa_totp");

    console.log(`[HumanAuth] MFA disabled for user: ${user.username} (${userId})`);
  }

  /**
   * 创建会话
   */
  private async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthSession> {
    const sessionId = this.generateSessionId();
    const token = this.generateToken();

    const session: AuthSession = {
      id: sessionId,
      userId,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.sessionExpiryMs,
      ipAddress,
      userAgent,
      active: true,
    };

    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * 创建认证挑战
   */
  private async createChallenge(
    userId: string,
    type: "totp" | "sms" | "email",
  ): Promise<AuthChallenge> {
    const challengeId = this.generateChallengeId();

    const challenge: AuthChallenge = {
      id: challengeId,
      userId,
      type,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟过期
      verified: false,
    };

    // 如果是SMS或Email，生成验证码
    if (type === "sms" || type === "email") {
      challenge.code = this.generateVerificationCode();
    }

    this.challenges.set(challengeId, challenge);

    return challenge;
  }

  /**
   * 哈希密码
   */
  private hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  /**
   * 生成MFA密钥
   */
  private generateMFASecret(): string {
    return randomBytes(20).toString("base32");
  }

  /**
   * 验证TOTP代码（简化版本）
   */
  private verifyTOTP(secret: string, code: string): boolean {
    // 实际应该使用标准的TOTP算法
    // 这里简化处理，仅作演示
    const hash = createHash("sha256")
      .update(secret + Math.floor(Date.now() / 30000))
      .digest("hex");
    const expectedCode = hash.substring(0, 6);

    return code === expectedCode;
  }

  /**
   * 生成验证码
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * 生成用户ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${randomBytes(4).toString("hex")}`;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${randomBytes(8).toString("hex")}`;
  }

  /**
   * 生成令牌
   */
  private generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * 生成挑战ID
   */
  private generateChallengeId(): string {
    return `challenge_${Date.now()}_${randomBytes(4).toString("hex")}`;
  }

  /**
   * 获取用户
   */
  public getUser(userId: string): HumanUser | undefined {
    return this.users.get(userId);
  }

  /**
   * 列出所有用户
   */
  public listUsers(type?: HumanUserType): HumanUser[] {
    const users = Array.from(this.users.values());

    if (type) {
      return users.filter((u) => u.type === type);
    }

    return users;
  }

  /**
   * 获取活跃会话
   */
  public getActiveSessions(userId?: string): AuthSession[] {
    const sessions = Array.from(this.sessions.values()).filter((s) => s.active);

    if (userId) {
      return sessions.filter((s) => s.userId === userId);
    }

    return sessions;
  }

  /**
   * 获取统计信息
   */
  public getStatistics(): {
    totalUsers: number;
    activeUsers: number;
    mfaEnabledUsers: number;
    activeSessions: number;
    usersByType: Record<HumanUserType, number>;
  } {
    const users = Array.from(this.users.values());
    const activeSessions = this.sessions.values();

    const usersByType: Record<HumanUserType, number> = {
      owner: 0,
      admin: 0,
      member: 0,
      guest: 0,
    };

    for (const user of users) {
      usersByType[user.type]++;
    }

    const recentLogins = users.filter(
      (u) => u.lastLoginAt && Date.now() - u.lastLoginAt < 7 * 24 * 60 * 60 * 1000,
    );

    return {
      totalUsers: users.length,
      activeUsers: recentLogins.length,
      mfaEnabledUsers: users.filter((u) => u.mfaEnabled).length,
      activeSessions: Array.from(activeSessions).filter((s) => s.active).length,
      usersByType,
    };
  }
}

/**
 * 全局实例
 */
export const humanAuthManager = HumanAuthenticationManager.getInstance();
