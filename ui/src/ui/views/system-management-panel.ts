/**
 * 系统管理面板
 * 用于超级管理员管理、系统角色配置、安全策略和审计日志
 */

import { html, nothing } from "lit";

// 超级管理员类型
export type SuperAdmin = {
  id: string;
  name: string;
  email: string;
  permissions: string[];
  createdAt: number;
  lastLogin?: number;
  status: "active" | "inactive";
};

export type SuperAdminsProps = {
  admins: SuperAdmin[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (adminId: string) => void;
  onDelete: (adminId: string) => void;
  onToggleStatus: (adminId: string, status: "active" | "inactive") => void;
};

/**
 * 渲染超级管理员列表
 */
export function renderSuperAdmins(props: SuperAdminsProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载超级管理员列表中...</div>
    `;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  return html`
    <div class="super-admins-panel">
      <div class="panel-header">
        <h3>超级管理员管理</h3>
        <button class="btn btn--primary" @click=${props.onCreate}>
          + 添加管理员
        </button>
      </div>

      <div class="admins-list">
        ${
          props.admins.length === 0
            ? html`
                <div class="empty-state">暂无超级管理员</div>
              `
            : html`
              <table class="admins-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>邮箱</th>
                    <th>权限数</th>
                    <th>最后登录</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.admins.map(
                    (admin) => html`
                      <tr class="${admin.status}">
                        <td>${admin.name}</td>
                        <td>${admin.email}</td>
                        <td>${admin.permissions.length}</td>
                        <td>
                          ${
                            admin.lastLogin
                              ? new Date(admin.lastLogin).toLocaleString()
                              : "从未登录"
                          }
                        </td>
                        <td>
                          <span class="status-badge ${admin.status}">
                            ${admin.status === "active" ? "激活" : "停用"}
                          </span>
                        </td>
                        <td class="actions">
                          <button
                            class="btn btn--sm"
                            @click=${() => props.onEdit(admin.id)}
                          >
                            编辑
                          </button>
                          <button
                            class="btn btn--sm ${
                              admin.status === "active" ? "btn--warning" : "btn--primary"
                            }"
                            @click=${() =>
                              props.onToggleStatus(
                                admin.id,
                                admin.status === "active" ? "inactive" : "active",
                              )}
                          >
                            ${admin.status === "active" ? "停用" : "激活"}
                          </button>
                          <button
                            class="btn btn--sm btn--danger"
                            @click=${() => props.onDelete(admin.id)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `
        }
      </div>
    </div>
  `;
}

// 系统角色类型
export type SystemRole = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  createdAt: number;
  isBuiltIn: boolean;
};

export type SystemRolesProps = {
  roles: SystemRole[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (roleId: string) => void;
  onDelete: (roleId: string) => void;
  onViewPermissions: (roleId: string) => void;
};

/**
 * 渲染系统角色配置
 */
export function renderSystemRoles(props: SystemRolesProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载系统角色中...</div>
    `;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  return html`
    <div class="system-roles-panel">
      <div class="panel-header">
        <h3>系统角色配置</h3>
        <button class="btn btn--primary" @click=${props.onCreate}>
          + 创建角色
        </button>
      </div>

      <div class="roles-grid">
        ${
          props.roles.length === 0
            ? html`
                <div class="empty-state">暂无系统角色</div>
              `
            : props.roles.map(
                (role) => html`
                <div class="role-card ${role.isBuiltIn ? "built-in" : ""}">
                  <div class="role-header">
                    <h4>${role.name}</h4>
                    ${
                      role.isBuiltIn
                        ? html`
                            <span class="built-in-badge">内置</span>
                          `
                        : nothing
                    }
                  </div>

                  ${
                    role.description
                      ? html`<p class="role-description">${role.description}</p>`
                      : nothing
                  }

                  <div class="role-stats">
                    <div class="stat">
                      <span class="stat-value">${role.permissions.length}</span>
                      <span class="stat-label">权限数</span>
                    </div>
                    <div class="stat">
                      <span class="stat-value">${role.userCount}</span>
                      <span class="stat-label">用户数</span>
                    </div>
                  </div>

                  <div class="role-actions">
                    <button
                      class="btn btn--sm"
                      @click=${() => props.onViewPermissions(role.id)}
                    >
                      查看权限
                    </button>
                    ${
                      !role.isBuiltIn
                        ? html`
                          <button
                            class="btn btn--sm"
                            @click=${() => props.onEdit(role.id)}
                          >
                            编辑
                          </button>
                          <button
                            class="btn btn--sm btn--danger"
                            @click=${() => props.onDelete(role.id)}
                          >
                            删除
                          </button>
                        `
                        : nothing
                    }
                  </div>
                </div>
              `,
              )
        }
      </div>
    </div>
  `;
}

// 安全策略类型
export type SecurityPolicy = {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    expirationDays: number;
  };
  sessionPolicy: {
    maxSessionDuration: number;
    idleTimeout: number;
    maxConcurrentSessions: number;
  };
  accessPolicy: {
    maxLoginAttempts: number;
    lockoutDuration: number;
    ipWhitelist: string[];
  };
};

export type SecurityPolicyProps = {
  policy: SecurityPolicy;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSave: (policy: SecurityPolicy) => void;
  onChange: (field: string, value: any) => void;
};

/**
 * 渲染安全策略设置
 */
export function renderSecurityPolicy(props: SecurityPolicyProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载安全策略中...</div>
    `;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  const { policy } = props;

  return html`
    <div class="security-policy-panel">
      <h3>安全策略设置</h3>

      <div class="policy-section">
        <h4>密码策略</h4>
        <div class="form-group">
          <label>最小长度</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.passwordPolicy.minLength.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("passwordPolicy.minLength", parseInt(target.value));
            }}
          />
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${policy.passwordPolicy.requireUppercase}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onChange("passwordPolicy.requireUppercase", target.checked);
              }}
            />
            <span>需要大写字母</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${policy.passwordPolicy.requireLowercase}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onChange("passwordPolicy.requireLowercase", target.checked);
              }}
            />
            <span>需要小写字母</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${policy.passwordPolicy.requireNumbers}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onChange("passwordPolicy.requireNumbers", target.checked);
              }}
            />
            <span>需要数字</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              ?checked=${policy.passwordPolicy.requireSpecialChars}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onChange("passwordPolicy.requireSpecialChars", target.checked);
              }}
            />
            <span>需要特殊字符</span>
          </label>
        </div>
        <div class="form-group">
          <label>密码过期天数（0为永不过期）</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.passwordPolicy.expirationDays.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("passwordPolicy.expirationDays", parseInt(target.value));
            }}
          />
        </div>
      </div>

      <div class="policy-section">
        <h4>会话策略</h4>
        <div class="form-group">
          <label>最大会话时长（分钟）</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.sessionPolicy.maxSessionDuration.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("sessionPolicy.maxSessionDuration", parseInt(target.value));
            }}
          />
        </div>
        <div class="form-group">
          <label>空闲超时（分钟）</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.sessionPolicy.idleTimeout.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("sessionPolicy.idleTimeout", parseInt(target.value));
            }}
          />
        </div>
        <div class="form-group">
          <label>最大并发会话数</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.sessionPolicy.maxConcurrentSessions.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("sessionPolicy.maxConcurrentSessions", parseInt(target.value));
            }}
          />
        </div>
      </div>

      <div class="policy-section">
        <h4>访问策略</h4>
        <div class="form-group">
          <label>最大登录失败次数</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.accessPolicy.maxLoginAttempts.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("accessPolicy.maxLoginAttempts", parseInt(target.value));
            }}
          />
        </div>
        <div class="form-group">
          <label>锁定时长（分钟）</label>
          <input
            type="number"
            class="form-control"
            .value=${policy.accessPolicy.lockoutDuration.toString()}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onChange("accessPolicy.lockoutDuration", parseInt(target.value));
            }}
          />
        </div>
      </div>

      <div class="panel-actions">
        <button
          class="btn btn--primary"
          ?disabled=${props.saving}
          @click=${() => props.onSave(policy)}
        >
          ${props.saving ? "保存中..." : "保存策略"}
        </button>
      </div>
    </div>
  `;
}

// 审计日志类型
export type AuditLog = {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  result: "success" | "failure";
  details: string;
  ip?: string;
};

export type AuditLogsProps = {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  filter: {
    startDate?: number;
    endDate?: number;
    userId?: string;
    action?: string;
  };
  onFilterChange: (filter: any) => void;
  onExport: () => void;
};

/**
 * 渲染审计日志
 */
export function renderAuditLogs(props: AuditLogsProps) {
  if (props.loading) {
    return html`
      <div class="loading">加载审计日志中...</div>
    `;
  }

  if (props.error) {
    return html`<div class="error">${props.error}</div>`;
  }

  return html`
    <div class="audit-logs-panel">
      <div class="panel-header">
        <h3>审计日志</h3>
        <button class="btn btn--primary" @click=${props.onExport}>
          导出日志
        </button>
      </div>

      <div class="logs-filter">
        <div class="form-group">
          <label>开始日期</label>
          <input
            type="datetime-local"
            class="form-control"
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              const date = new Date(target.value).getTime();
              props.onFilterChange({ ...props.filter, startDate: date });
            }}
          />
        </div>
        <div class="form-group">
          <label>结束日期</label>
          <input
            type="datetime-local"
            class="form-control"
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              const date = new Date(target.value).getTime();
              props.onFilterChange({ ...props.filter, endDate: date });
            }}
          />
        </div>
      </div>

      <div class="logs-list">
        ${
          props.logs.length === 0
            ? html`
                <div class="empty-state">暂无审计日志</div>
              `
            : html`
              <table class="logs-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>用户</th>
                    <th>操作</th>
                    <th>资源</th>
                    <th>结果</th>
                    <th>详情</th>
                    <th>IP地址</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.logs.map(
                    (log) => html`
                      <tr class="${log.result}">
                        <td>${new Date(log.timestamp).toLocaleString()}</td>
                        <td>${log.userName}</td>
                        <td>${log.action}</td>
                        <td>${log.resource}</td>
                        <td>
                          <span class="result-badge ${log.result}">
                            ${log.result === "success" ? "成功" : "失败"}
                          </span>
                        </td>
                        <td>${log.details}</td>
                        <td>${log.ip || "-"}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `
        }
      </div>
    </div>
  `;
}
