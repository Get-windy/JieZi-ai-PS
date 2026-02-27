/**
 * 通用OAuth授权管理器
 * 支持多种OAuth流程：Device Code Flow, Authorization Code Flow等
 */

export type OAuthProvider = 'qwen-portal' | 'github' | 'google' | 'azure' | string;

export type OAuthFlowType = 'device_code' | 'authorization_code';

export interface OAuthDeviceCodeParams {
  deviceCode: string;
  verificationUrl: string;
  userCode?: string;
  expiresIn: number;
  interval: number;
  authId: string;
  provider: OAuthProvider;
  verifier?: string;
}

export interface OAuthAuthorizationCodeParams {
  authorizationUrl: string;
  authId: string;
  provider: OAuthProvider;
  redirectUri?: string;
}

export type OAuthParams = OAuthDeviceCodeParams | OAuthAuthorizationCodeParams;

export interface OAuthCallbacks {
  onSuccess: () => void | Promise<void>;
  onError?: (error: string) => void;
  onCancel?: () => void;
  onPollRequest: (params: {
    deviceCode: string;
    verifier?: string;
    authId: string;
  }) => Promise<{ status: 'pending' | 'success' | 'slow_down'; message?: string }>;
}

export interface OAuthManagerOptions {
  windowWidth?: number;
  windowHeight?: number;
  pollInterval?: number;
  maxAttempts?: number;
  showProgressUI?: boolean;
}

/**
 * OAuth授权窗口管理器
 */
export class OAuthManager {
  private authWindow: Window | null = null;
  private pollTimer: number | null = null;
  private stopped = false;
  private attempts = 0;

  constructor(
    private params: OAuthParams,
    private callbacks: OAuthCallbacks,
    private options: OAuthManagerOptions = {}
  ) {
    this.options = {
      windowWidth: 600,
      windowHeight: 700,
      pollInterval: 2000,
      maxAttempts: 450,
      showProgressUI: true,
      ...options,
    };
  }

  /**
   * 启动OAuth授权流程
   */
  async start(): Promise<void> {
    console.log('[OAuthManager] Starting OAuth flow:', {
      provider: this.params.provider,
      authId: this.params.authId,
    });

    // 检测OAuth流程类型
    if ('deviceCode' in this.params) {
      await this.startDeviceCodeFlow(this.params);
    } else if ('authorizationUrl' in this.params) {
      await this.startAuthorizationCodeFlow(this.params);
    } else {
      throw new Error('Unsupported OAuth flow type');
    }
  }

  /**
   * Device Code Flow
   * 适用于：Qwen、GitHub Device Flow等
   */
  private async startDeviceCodeFlow(params: OAuthDeviceCodeParams): Promise<void> {
    // 打开授权窗口
    this.authWindow = window.open(
      params.verificationUrl,
      '_blank',
      `width=${this.options.windowWidth},height=${this.options.windowHeight},toolbar=no,menubar=no,location=no`
    );

    if (!this.authWindow) {
      this.callbacks.onError?.('无法打开授权窗口，请检查浏览器弹窗拦截设置');
      return;
    }

    console.log('[OAuthManager] Authorization window opened');

    // 延迟后开始轮询
    setTimeout(() => {
      this.startPolling(params);
    }, 1000);

    // 监听窗口关闭
    this.watchWindowClose();
  }

  /**
   * Authorization Code Flow
   * 适用于：Google、Azure、GitHub OAuth等
   */
  private async startAuthorizationCodeFlow(
    params: OAuthAuthorizationCodeParams
  ): Promise<void> {
    // 打开授权窗口
    this.authWindow = window.open(
      params.authorizationUrl,
      '_blank',
      `width=${this.options.windowWidth},height=${this.options.windowHeight},toolbar=no,menubar=no,location=no`
    );

    if (!this.authWindow) {
      this.callbacks.onError?.('无法打开授权窗口，请检查浏览器弹窗拦截设置');
      return;
    }

    console.log('[OAuthManager] Authorization window opened (Authorization Code Flow)');

    // 监听回调URL（通过postMessage或window.location）
    this.listenForCallback(params);

    // 监听窗口关闭
    this.watchWindowClose();
  }

  /**
   * 开始轮询授权状态
   */
  private async startPolling(params: OAuthDeviceCodeParams): Promise<void> {
    console.log('[OAuthManager] Starting polling...');

    const poll = async () => {
      if (this.stopped || this.attempts >= this.options.maxAttempts!) {
        console.log('[OAuthManager] Polling stopped:', {
          stopped: this.stopped,
          attempts: this.attempts,
          maxAttempts: this.options.maxAttempts,
        });
        return;
      }

      this.attempts++;
      console.log(`[OAuthManager] Poll attempt ${this.attempts}/${this.options.maxAttempts}`);

      try {
        const result = await this.callbacks.onPollRequest({
          deviceCode: params.deviceCode,
          verifier: params.verifier,
          authId: params.authId,
        });

        console.log('[OAuthManager] Poll result:', result);

        if (result.status === 'success') {
          // 授权成功！
          this.stop();
          console.log('[OAuthManager] Authorization successful!');
          this.closeWindow();
          await this.callbacks.onSuccess();
        } else if (result.status === 'slow_down') {
          // 减慢轮询速度
          console.log('[OAuthManager] Slow down requested');
          if (!this.stopped) {
            this.pollTimer = window.setTimeout(poll, this.options.pollInterval! * 1.5);
          }
        } else {
          // 继续轮询
          if (!this.stopped) {
            this.pollTimer = window.setTimeout(poll, this.options.pollInterval!);
          }
        }
      } catch (err) {
        console.error('[OAuthManager] Poll error:', err);
        if (!this.stopped) {
          this.pollTimer = window.setTimeout(poll, this.options.pollInterval!);
        }
      }
    };

    // 开始第一次轮询
    poll();
  }

  /**
   * 监听Authorization Code Flow的回调
   */
  private listenForCallback(params: OAuthAuthorizationCodeParams): void {
    const messageHandler = (event: MessageEvent) => {
      // 验证消息来源
      if (event.origin !== window.location.origin) {
        return;
      }

      // 检查是否是OAuth回调消息
      if (event.data?.type === 'oauth_callback' && event.data?.authId === params.authId) {
        console.log('[OAuthManager] Received OAuth callback:', event.data);

        if (event.data.success) {
          this.stop();
          this.closeWindow();
          this.callbacks.onSuccess();
        } else {
          this.callbacks.onError?.(event.data.error || 'Authorization failed');
        }

        window.removeEventListener('message', messageHandler);
      }
    };

    window.addEventListener('message', messageHandler);
  }

  /**
   * 监听授权窗口关闭
   */
  private watchWindowClose(): void {
    const checkInterval = setInterval(() => {
      if (this.authWindow && this.authWindow.closed) {
        console.log('[OAuthManager] Authorization window closed');
        clearInterval(checkInterval);

        if (!this.stopped) {
          // 用户手动关闭了窗口
          this.stop();
          this.callbacks.onCancel?.();
        }
      }
    }, 500);
  }

  /**
   * 停止轮询
   */
  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[OAuthManager] Stopped');
  }

  /**
   * 关闭授权窗口
   */
  closeWindow(): void {
    if (this.authWindow && !this.authWindow.closed) {
      this.authWindow.close();
      console.log('[OAuthManager] Authorization window closed');
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stop();
    this.closeWindow();
  }
}

/**
 * 便捷方法：启动Device Code Flow授权
 */
export async function startDeviceCodeAuth(
  params: OAuthDeviceCodeParams,
  callbacks: OAuthCallbacks,
  options?: OAuthManagerOptions
): Promise<OAuthManager> {
  const manager = new OAuthManager(params, callbacks, options);
  await manager.start();
  return manager;
}

/**
 * 便捷方法：启动Authorization Code Flow授权
 */
export async function startAuthorizationCodeAuth(
  params: OAuthAuthorizationCodeParams,
  callbacks: OAuthCallbacks,
  options?: OAuthManagerOptions
): Promise<OAuthManager> {
  const manager = new OAuthManager(params, callbacks, options);
  await manager.start();
  return manager;
}
