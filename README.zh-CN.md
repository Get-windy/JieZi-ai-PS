# 🦞 OpenClaw 中文快速入门指南

> 这是 JieZi-ai-PS 项目的中文使用文档，帮助中文用户快速上手。

---

## ⚠️ Windows 用户重要提示

**本项目已完全适配 Windows 环境，无需 bash 或 WSL2！**

### 关键改动说明

如果你从上游项目合并代码或更新 `package.json`，请注意以下问题：

**问题**：

- 原项目的 `package.json` 中 `canvas:a2ui:bundle` 脚本使用了 `bash scripts/bundle-a2ui.sh`
- Windows 系统没有原生 bash 命令，会导致构建失败

**解决方案**：

- ✅ 本项目已提供 **Node.js 版本的脚本** `scripts/bundle-a2ui.mjs`
- ✅ 所有构建命令已改为使用纯 JavaScript/TypeScript 实现
- ✅ **直接在 PowerShell 中运行，无需任何额外配置**

**正确的 package.json 配置**：

```json
{
  "scripts": {
    "canvas:a2ui:bundle": "node scripts/bundle-a2ui.mjs"
  }
}
```

**错误的配置**（不要使用）：

```json
{
  "scripts": {
    "canvas:a2ui:bundle": "bash scripts/bundle-a2ui.sh" // ❌ Windows 不支持
  }
}
```

### Windows 兼容性保证

- ✅ **PowerShell 原生支持**：所有命令在 PowerShell 7+ 中完美运行
- ✅ **跨平台脚本**：`scripts/bundle-a2ui.mjs` 替代了 `scripts/bundle-a2ui.sh`
- ✅ **无需 WSL2**：Windows 用户可以直接构建和运行
- ✅ **TypeScript 编译器**：默认使用 `tsc` 而非 `tsgo`

### 📌 项目更新记录

#### 2026年2月9日 - 权限管理与培训系统核心功能完成

**🎯 核心功能完成：**

- ✅ **权限管理系统**
  - 实现权限检查器和审批系统 (src/permissions/)
  - 创建工具权限包装器 (src/agents/tools/permission-wrapper.ts)
  - 在关键工具中集成权限检查拦截（bash-tools.exec.ts, file-tools-secure.ts）
  - 支持异步权限检查和审批流程
  - 集成到文件读写和命令执行工具中

- ✅ **智能助手培训系统**
  - 实现培训会话管理 (src/agents/training/training-session.ts)
  - 添加培训启动工具 (training-start-tool.ts)
  - 添加培训评估工具 (training-assess-tool.ts)
  - 添加技能转移工具 (skill-transfer-tool.ts)
  - 完成导师-学员工作空间管理 (lifecycle-manager.ts)
  - 实现工作空间模板复制功能 (copyWorkspaceTemplate)
  - 实现培训系统框架 (lifecycle/training-system.ts)

- ✅ **消息队列与策略引擎**
  - 实现消息队列系统 (src/channels/message-queue.ts)
  - 添加策略引擎 (src/channels/policy-engine.ts)
  - 添加监控功能 (src/channels/policies/monitor.ts)
  - 完善渠道策略集成 (policy-integration.ts)
  - 新增消息队列RPC接口 (server-methods/message-queue-rpc.ts)
  - 新增监控RPC接口 (server-methods/monitor-rpc.ts)

- ✅ **群组管理功能**
  - 实现群组会话协调器 (src/sessions/group-session-coordinator.ts)
  - 实现群组管理器 (src/sessions/group-manager.ts)
  - 实现群组消息存储 (src/sessions/group-message-storage.ts)
  - 添加好友RPC接口 (server-methods/friends-rpc.ts)
  - 添加群组RPC接口 (server-methods/groups-rpc.ts)
  - 完成场景管理功能 (server-methods/scenarios-rpc.ts)

- ✅ **UI界面完善**
  - 完善权限管理页面 (ui/src/ui/views/permissions-management.ts)
  - 新增培训管理界面 (ui/src/ui/views/training.ts)
  - 新增监控界面 (ui/src/ui/views/monitor.ts)
  - 新增协作界面 (ui/src/ui/views/collaboration.ts)
  - 新增好友管理界面 (ui/src/ui/views/friends.ts)
  - 新增群组管理界面 (ui/src/ui/views/groups.ts)
  - 新增消息队列界面 (ui/src/ui/views/message-queue.ts)
  - 新增场景管理界面 (ui/src/ui/views/scenarios.ts)
  - 新增通道策略对话框 (ui/src/ui/views/agents.channel-policy-dialog.ts)
  - **修复UI国际化函数导入问题** (app-render.helpers.ts)

- ✅ **构建系统修复**
  - **解决 pi-model-discovery.ts 的 `__exportAll is not a function` 运行时错误**
  - 使用动态导入 (top-level await) 避免打包器优化问题
  - 修复 TypeScript 类型引用问题 (InstanceType<typeof ...>)
  - 修复 model.ts 和 types.ts 中的4处类型错误
  - 完成项目构建和UI构建流程
  - 验证运行时功能正常

**📊 统计数据：**

- 新增文件：38个
  - src/agents/: 7个新文件
  - src/channels/: 2个新文件
  - src/config/: 1个新文件
  - src/gateway/server-methods/: 6个新文件
  - src/permissions/: 1个新文件
  - src/sessions/: 4个新文件
  - ui/src/ui/controllers/: 8个新文件
  - ui/src/ui/views/: 9个新文件
- 修改文件：17个
- 删除临时文件：16个
- 新增代码行数：~17,800+
- 删除代码行数：~2,680
- 新增RPC接口：6个
- 新增UI页面/控制器：17个
- 提交标识：308fdd13f

**🔧 技术改进：**

- ✅ 异步权限检查支持
- ✅ 工作空间模板复制功能
- ✅ 审批流程集成
- ✅ 动态导入优化 (ESM兼容)
- ✅ 文件工具安全增强
- ✅ 构建系统稳定性修夏
- ✅ UI国际化完整性修复

**🔄 兼容性保证：**

- ✅ 保持与上游 openclaw 的兼容性
- ✅ Windows PowerShell 原生支持
- ✅ TypeScript 类型安全保障
- ✅ 向后兼容现有配置
- ✅ UI国际化完整支持
- ✅ 构建系统稳定运行

**⚠️ 重要说明：**

本次更新完成了多智能体协作、权限管理和培训系统的核心基础设施。特别是：

1. **构建系统修复**：解决了 `pi-model-discovery.ts` 的 ESM 模块导出问题，项目现可正常构建和运行
2. **UI修复**：修复了国际化函数导入问题，控制面板界面现可正常显示
3. **权限系统**：在关键工具中集成了完整的权限检查和审批流程
4. **培训系统**：完成了导师-学员培训框架的核心功能

建议在生产部署前进行充分测试：

1. ✅ 验证项目构建功能 (pnpm build)
2. ✅ 测试UI界面显示 (pnpm openclaw gateway)
3. ✅ 检查权限管理系统
4. ✅ 验证培训系统功能
5. ✅ 测试群组管理功能

**📦 备份信息：**

- 备份日期：20260209_101331
- 备份位置：I:\JIEZI\backups\
- 备份文件：
  - 当前提交\_20260209_101331.txt
  - 本地修改列表\_20260209_101331.txt
- 推送仓库：Gitee (origin) + GitHub (github)

#### 2026年2月8日 - Phase 5 智能助手管理增强

**🎯 核心功能上线：**

- ✅ **智能助手前端管理界面**
  - 重构 agents 页面，新增"模型路由"和"通道策略"两个 Tab
  - 实现完整的智能助手配置管理
  - 支持多智能体协作配置

- ✅ **组织框架可视化系统**
  - 新增 organization-chart 页面
  - 可视化展示智能助手层级结构
  - 支持团队管理和导师系统
  - 实现协作关系展示

- ✅ **权限管理系统**
  - 新增 permissions-management 页面
  - 完整的权限检查和审批流程
  - 支持权限层级和继承
  - 集成审批工作流

- ✅ **模型路由智能调度**
  - 实现智能模型选择算法
  - 支持基于复杂度的自动路由
  - 成本优化和性能平衡
  - 会话固定和上下文保持

- ✅ **通道策略管理**
  - 13种通道策略实现（私有、监控、过滤、转发、智能路由等）
  - 灵活的通道绑定配置
  - 策略注册和调度系统

**📦 技术实现：**

- **前端**：106个新增文件，15个修改文件
  - 3个新页面：organization-chart, permissions-management, agents重构
  - 完整国际化：100+个中英文翻译键
  - 响应式设计：支持各种屏幕尺寸
  - Phase 5专用样式系统

- **后端**：15000+行核心代码
  - 8个新RPC接口
  - 完整的类型系统（agents, groups, permissions, bindings）
  - 组织架构系统（hierarchy, team, mentor, collaboration）
  - 权限管理系统（checker, approval, hierarchy, integration）
  - 工作区管理（group-workspace, access-control, knowledge-sedimentation）
  - 通道策略系统（13种策略类型）

- **文档**：完善的集成文档
  - Phase 1-4 完整文档
  - Phase 5 RPC API规范
  - Phase 5 集成指南
  - 多智能体系统设计文档
  - 配置示例和测试用例

- **生命周期和超级管理员**（Phase 6-7预研）
  - 生命周期管理器（训练系统、技能管理）
  - 超级管理员系统（高级审批、通知管理）

**🎨 用户体验改进：**

1. **侧边栏导航优化**
   - 新增"智能助手"分组，包含4个子页面：
     - 助手管理（Agents）
     - 组织框架（Organization Chart）
     - 权限管理（Permissions Management）
     - 绑定配置（Bindings）

2. **agents页面重构**
   - 原有Tab：概览、文件、工具、技能、通道、定时任务
   - 新增Tab：
     - **模型路由**：智能模型选择和配置
     - **通道策略**：通道绑定和策略管理

3. **完整国际化**
   - 所有新增功能都有中英文翻译
   - 翻译键覆盖：
     - agents.tab.model_accounts（模型路由）- 26个配置项
     - agents.tab.channel_policies（通道策略）- 22个策略项
     - tab.organization-chart（组织框架）
     - tab.permissions-management（权限管理）

**📊 统计数据：**

- 新增文件：106个
- 修改文件：15个
- 代码行数：约15000+行
- 新增RPC接口：8个
- 新增UI页面：3个
- 新增策略类型：13个
- 国际化键：100+个
- 提交标识：dde724b16 + 9c2fdf35f

**🔄 兼容性保证：**

- ✅ 保持与上游 openclaw 的兼容性
- ✅ Windows 环境构建优化（PowerShell原生支持）
- ✅ TypeScript 类型安全
- ✅ 向后兼容现有配置
- ✅ 所有构建脚本保持跨平台兼容

**⚠️ 重要说明：**

这是一次重大的功能迭代，为 OpenClaw 项目引入了完整的多智能体管理体系。建议在生产环境使用前进行充分测试：

1. ✅ 验证智能助手管理功能
2. ✅ 测试组织框架可视化
3. ✅ 检查权限管理系统
4. ✅ 验证模型路由调度
5. ✅ 测试通道策略配置

#### 2026年2月7日 - 上游同步更新 (2026.2.6-3)

**上游更新内容：**

- 🐛 修复：BlueBubbles 和通道清理的全面修复 (#11093)
- 📦 版本：更新至 2026.2.6-3
- ⚙️ 调整：xAI + Qianfan 供应商顺序优化

**本地改进：**

- 🌐 完善 Usage 页面国际化
  - 新增星期标签翻译（周日-周六）
  - 新增时间标签翻译（凌晨4点、上午8点、下午4点、晚上8点）
  - "Activity by Time" 完整中英文支持
  - 时间活动分布图表全面汉化
- 🛡️ 保护本地特性
  - 保留所有汉化文件（UI、配置、文档）
  - 保留 Windows PowerShell 兼容性改造
  - 保留 `canvas:a2ui:bundle` 的 Node.js 脚本配置
  - 保留 README 中英文对照文档
- ✅ 合并策略：自动合并成功，无冲突
- 📊 状态：已推送至 Gitee (origin) 和 GitHub (github) 仓库

**测试建议：**

1. 验证 Usage 页面中英文切换功能
2. 测试 Windows 环境下的项目构建
3. 检查 BlueBubbles 通道功能
4. 验证新增的 xAI 和 Qianfan 供应商配置

---

## 📋 目录

- [系统要求](#系统要求)
- [安装依赖](#安装依赖)
- [项目打包](#项目打包)
- [初始化配置](#初始化配置)
- [启动项目](#启动项目)
- [常见问题](#常见问题)

---

## 系统要求

- **Node.js**: ≥ 22.12.0
- **包管理器**: pnpm (推荐) / npm / bun
- **操作系统**: Windows (PowerShell) / macOS / Linux
- **特别说明**:
  - ✅ Windows 用户可直接在 PowerShell 中构建和运行，**无需安装 bash 或 WSL2**
  - ✅ 项目已完全改造为跨平台构建脚本（纯 Node.js 实现）

---

## 安装依赖

### 1. 克隆项目

```bash
git clone https://gitee.com/CozyNook/JieZi-ai-PS.git
cd 你的项目目录
```

### 2. 安装 pnpm（如果还没安装）

```bash
npm install -g pnpm
```

### 3. 安装项目依赖

```bash
pnpm install
```

**注意**: 首次安装可能需要较长时间，请耐心等待。

### 4. 初始化 UI 依赖（可选）

```bash
pnpm ui:install
```

**说明**: 如果需要开发或构建 Web UI，需要先安装 UI 依赖。

---

## 项目打包

### 构建用户界面

```bash
pnpm ui:build
```

### 编译 TypeScript 代码

```bash
pnpm build
```

**完整构建命令**（推荐）：

```bash
pnpm install
pnpm ui:build
pnpm build
```

---

## 初始化配置

### 运行引导向导（推荐）

引导向导会帮助你完成所有初始配置，包括网关设置、模型配置、通道设置等：

```bash
pnpm openclaw onboard
```

**向导步骤说明：**

1. **安全提示**: 阅读并确认安全警告
2. **选择模式**:
   - **快速开始** - 使用默认配置快速启动（推荐新手）
   - **手动配置** - 自定义详细配置
3. **处理已有配置**（如果存在）:
   - **保持不变（跳过配置步骤）** - 使用现有配置
   - **修改配置（更新部分设置）** - 更新某些配置
   - **重置（清空重新配置）** - 完全重新配置
4. **模型选择**: 选择 AI 模型提供商
   - **国内模型**（推荐）:
     - DeepSeek（深度求索）- OpenAI 兼容，高性能
     - Qwen（通义千问）- 免费 OAuth 额度
     - 百度文心一言（ERNIE）- 千帆大模型平台
     - 腾讯混元（Hunyuan）- 腾讯云大模型
     - 字节豆包（Doubao）- 火山引擎大模型
     - 讯飞星火（Spark）- 科大讯飞认知大模型
   - **国际免费模型**（强烈推荐，节省算力）:
     - SiliconFlow（硅基流动）- ⭐ 注册送2000万Tokens
     - Groq - ⭐ 超快推理速度，免费访问
     - Together AI - 免费模型访问
   - **其他模型**: Anthropic/OpenAI/Google Gemini 等
5. **网关配置**:
   - **网关端口**: 默认 18789
   - **网关绑定**: 本地网址 (127.0.0.1) / 局域网 / 自定义
   - **网关认证**: 令牌（推荐）/ 密码
   - **Tailscale 暴露**: 关闭 / Serve / Funnel
6. **通道配置**: 选择要启用的聊天通道
   - **国际通道**: WhatsApp, Telegram, Discord, Slack, Signal 等
   - **国内通道**（已集成）:
     - 飞书（Feishu/Lark）- 企业协作平台
     - 钉钉（DingTalk）- Stream 模式，无需公网 IP
     - 企业微信（WeCom）- 企业级通讯平台
7. **技能配置**: 选择要启用的 AI 技能

### 手动配置（可选）

如果不使用引导向导，可以手动创建配置文件：

创建 `~/.openclaw/openclaw.json` 文件：

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5",
  },
  gateway: {
    port: 18789,
    bind: "loopback",
    mode: "local",
    auth: {
      mode: "token",
      token: "your-token-here",
    },
  },
}
```

---

## 启动项目

### 方式一：启动网关服务

```bash
pnpm openclaw gateway
```

或指定端口和详细日志：

```bash
pnpm openclaw gateway --port 18789 --verbose
```

### 方式二：安装为系统服务（推荐）

引导向导会询问是否安装为系统服务，也可以手动安装：

```bash
pnpm openclaw onboard --install-daemon
```

安装后，网关会在后台持续运行（使用 launchd/systemd）。

### 方式三：开发模式（自动重载）

适合开发调试：

```bash
pnpm gateway:watch
```

---

## 验证启动

### 检查网关状态

```bash
pnpm openclaw doctor
```

### 发送测试消息

```bash
pnpm openclaw message send --to +1234567890 --message "你好，OpenClaw"
```

### 与 AI 助手对话

```bash
pnpm openclaw agent --message "写一个快速排序算法" --thinking high
```

---

## 常见问题

### 1. 提示 `tsgo` 命令找不到

**解决方案**: 项目已配置为默认使用 `tsc` 编译器，直接运行 `pnpm build` 即可。

### 2. 启动时提示 "set gateway.mode=local"

**解决方案**: 运行引导向导完成配置：

```bash
pnpm openclaw onboard
```

### 3. PowerShell 中构建失败

**解决方案**: 本项目已完全支持 PowerShell，无需 bash 或 WSL2。确保使用 PowerShell 7+ 或直接在 Windows 原生环境运行：

```powershell
# 检查 PowerShell 版本
$PSVersionTable.PSVersion

# 如果版本较旧，建议升级到 PowerShell 7+
# 下载地址: https://github.com/PowerShell/PowerShell/releases
```

### 4. 端口被占用

**解决方案**: 修改配置文件中的端口号，或停止占用端口的程序：

```bash
# Windows
netstat -ano | findstr :18789

# macOS/Linux
lsof -i :18789
```

### 5. 编译时类型错误

**解决方案**: 确保所有依赖都已正确安装：

```bash
pnpm install
pnpm build
```

### 6. 中文显示异常

**解决方案**: 系统会自动检测语言环境，也可以手动设置：

```bash
# 设置环境变量
export OPENCLAW_LANGUAGE=zh-CN

# Windows PowerShell
$env:OPENCLAW_LANGUAGE="zh-CN"
```

---

## 项目特色

### ✅ 丰富的模型支持（含多个免费选项）

项目支持 **8个国内外模型提供商**，包括多个**完全免费**的选项：

#### 🇨🇳 **国内模型提供商（5个）**

1. **DeepSeek（深度求索）**
   - OpenAI 兼容接口，高性能、低成本
   - 环境变量：`DEEPSEEK_API_KEY`
   - 默认模型：`deepseek-chat`

2. **百度文心一言（ERNIE）**
   - 千帆大模型平台，中文能力强
   - 环境变量：`QIANFAN_ACCESS_KEY`
   - 默认模型：`ernie-4.0-turbo-8k`
   - 免费模型：`ernie-speed-128k`

3. **字节豆包（Doubao）**
   - 火山引擎大模型，字节跳动官方
   - 环境变量：`ARK_API_KEY`
   - 默认模型：`doubao-pro-32k`

4. **腾讯混元（Hunyuan）**
   - 腾讯云大模型，OpenAI 兼容
   - 环境变量：`HUNYUAN_API_KEY`
   - 默认模型：`hunyuan-turbo`
   - 免费模型：`hunyuan-lite`

5. **讯飞星火（Spark）**
   - 科大讯飞认知大模型，语音处理优势
   - 环境变量：`SPARK_API_KEY`
   - 默认模型：`spark-pro`
   - 免费模型：`spark-lite`

#### 🌍 **国际免费模型提供商（3个）** ⭐ **强烈推荐，节省算力！**

6. **SiliconFlow（硅基流动）** ⭐⭐⭐
   - **注册即送2000万Tokens**，多个模型完全免费
   - 环境变量：`SILICONFLOW_API_KEY`
   - 免费模型：
     - `qwen-2.5-7b-instruct` - Qwen 2.5 7B
     - `deepseek-v3` - DeepSeek V3（推理模型）
     - `glm-4-9b-chat` - GLM-4 9B
     - `internlm-2.5-7b-chat` - InternLM 2.5 7B
   - 注册链接：https://cloud.siliconflow.cn

7. **Groq** ⭐⭐
   - **超快推理速度**（比其他快3-10倍），免费访问
   - 环境变量：`GROQ_API_KEY`
   - 免费模型：
     - `llama-3.3-70b-versatile` - Llama 3.3 70B
     - `llama-3.1-8b-instant` - Llama 3.1 8B Instant
     - `deepseek-r1-distill-llama-70b` - DeepSeek R1 Distill
     - `mixtral-8x7b-32768` - Mixtral 8x7B
   - 注册链接：https://console.groq.com

8. **Together AI** ⭐
   - 免费模型访问
   - 环境变量：`TOGETHER_AI_API_KEY`
   - 免费模型：
     - `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`
     - `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`
     - `mistralai/Mixtral-8x7B-Instruct-v0.1`
   - 注册链接：https://api.together.xyz

#### 💰 **算力节省策略**

通过使用以上免费模型提供商，**OpenClaw 的算力成本可以降低到接近零**！

**推荐组合**：

- **主力模型**: SiliconFlow（注册送2000万Tokens）
- **高速推理**: Groq（推理速度最快）
- **大模型备用**: Together AI（Llama 3.1 70B 免费）

**配置示例**：

```bash
# 方式1：设置环境变量
# Windows PowerShell
$env:SILICONFLOW_API_KEY="sk-..."
$env:GROQ_API_KEY="gsk_..."
$env:TOGETHER_AI_API_KEY="..."

# macOS/Linux
export SILICONFLOW_API_KEY="sk-..."
export GROQ_API_KEY="gsk_..."
export TOGETHER_AI_API_KEY="..."

# 方式2：使用引导向导
pnpm openclaw onboard
# 选择 "SiliconFlow API key（硅基流动）" 或其他免费提供商
```

### ✅ PowerShell 原生支持（无需 bash）

本项目已经完成跨平台改造，**Windows 用户可以直接使用 PowerShell 进行所有操作**：

- ✅ **无需 bash**: 不再依赖 bash 脚本
- ✅ **无需 WSL2**: Windows 用户可以原生运行
- ✅ **纯 Node.js 实现**: 所有构建脚本使用 JavaScript/TypeScript
- ✅ **PowerShell 兼容**: 所有命令在 PowerShell 7+ 中完美运行

**改造内容**:

- 将 `scripts/bundle-a2ui.sh` 替换为 `scripts/bundle-a2ui.mjs`
- 将默认 TypeScript 编译器从 `tsgo` 改为 `tsc`
- 所有构建步骤均已适配 PowerShell 环境

### ✅ 国内通讯渠道集成（飞书、钉钉、企业微信）

本项目已将**飞书、钉钉、企业微信**三大国内主流通讯平台集成到核心中，用户无需单独安装插件：

#### 📱 **飞书（Feishu/Lark）**

- **依赖包**: `@m1heng-clawd/feishu@^0.1.6`
- **支持功能**: 机器人 API、事件订阅、Markdown 消息
- **配置参数**:
  - App ID（应用 ID）
  - App Secret（应用密钥）
  - Verification Token（验证令牌，可选）
  - Encrypt Key（加密密钥，可选）
- **使用方式**: 在引导向导中选择 "Feishu/Lark (飞书)"

#### 📱 **钉钉（DingTalk）**

- **依赖包**: `github:soimy/openclaw-channel-dingtalk`
- **支持功能**:
  - Stream 模式（WebSocket 长连接，无需公网 IP）
  - 私聊和群聊支持
  - 多种消息类型（文本、图片、语音、视频、文件）
  - Markdown 回复
  - 交互式卡片
- **配置参数**:
  - AppKey（应用 Key）
  - AppSecret（应用密钥）
- **使用方式**: 在引导向导中选择 "DingTalk (钉钉)"
- **特色**: Stream 模式可在防火墙内网环境运行，无需反向代理

#### 📱 **企业微信（WeCom）**

- **依赖包**: `@william.qian/simple-wecom@^1.0.2`
- **支持功能**: 企业级通讯、机器人 API
- **配置参数**:
  - Corp ID（企业 ID）
  - Agent ID（应用 ID）
  - Secret（应用密钥）
  - Token（接收消息令牌，可选）
  - EncodingAESKey（消息加密密钥，可选）
- **使用方式**: 在引导向导中选择 "WeCom (企业微信)"

#### 🔧 **配置示例**

**方式1：使用引导向导（推荐）**

```bash
pnpm openclaw onboard
# 在通道选择步骤中选择对应的国内通道
```

**方式2：手动配置文件**

在 `~/.openclaw/openclaw.json` 中添加通道配置：

```json5
{
  channels: {
    // 飞书配置
    feishu: {
      accounts: {
        default: {
          enabled: true,
          name: "飞书机器人",
          appId: "cli_xxxxxxxx",
          appSecret: "your-app-secret",
          verificationToken: "your-token", // 可选
          encryptKey: "your-key", // 可选
          dmPolicy: "pairing",
          allowFrom: [],
        },
      },
    },

    // 钉钉配置
    dingtalk: {
      accounts: {
        default: {
          enabled: true,
          name: "钉钉机器人",
          appKey: "dingxxxxxxxx",
          appSecret: "your-app-secret",
          dmPolicy: "pairing",
          allowFrom: [],
        },
      },
    },

    // 企业微信配置
    wecom: {
      accounts: {
        default: {
          enabled: true,
          name: "企业微信机器人",
          corpId: "wwxxxxxxxx",
          agentId: "1000002",
          secret: "your-secret",
          token: "your-token", // 可选
          encodingAESKey: "your-aes-key", // 可选
          dmPolicy: "pairing",
          allowFrom: [],
        },
      },
    },
  },
}
```

**方式3：环境变量**

虽然这些通道主要通过配置文件设置，但也可以通过环境变量传递凭证：

```bash
# Windows PowerShell
$env:FEISHU_APP_ID="cli_xxxxxxxx"
$env:FEISHU_APP_SECRET="your-secret"
$env:DINGTALK_APP_KEY="dingxxxxxxxx"
$env:DINGTALK_APP_SECRET="your-secret"
$env:WECOM_CORP_ID="wwxxxxxxxx"
$env:WECOM_AGENT_ID="1000002"
$env:WECOM_SECRET="your-secret"

# macOS/Linux
export FEISHU_APP_ID="cli_xxxxxxxx"
export FEISHU_APP_SECRET="your-secret"
export DINGTALK_APP_KEY="dingxxxxxxxx"
export DINGTALK_APP_SECRET="your-secret"
export WECOM_CORP_ID="wwxxxxxxxx"
export WECOM_AGENT_ID="1000002"
export WECOM_SECRET="your-secret"
```

#### 📚 **获取凭证的方法**

**飞书开放平台**:

1. 访问 https://open.feishu.cn/app
2. 创建企业自建应用
3. 获取 App ID 和 App Secret
4. 配置机器人能力和事件订阅

**钉钉开放平台**:

1. 访问 https://open-dev.dingtalk.com
2. 创建企业内部应用
3. 获取 AppKey 和 AppSecret
4. 开启 Stream 模式推送

**企业微信管理后台**:

1. 访问 https://work.weixin.qq.com/wework_admin/frame#apps
2. 创建自建应用
3. 获取 Corp ID、Agent ID 和 Secret
4. 配置可信域名和回调地址

#### ✅ **集成优势**

- **开箱即用**: 无需单独安装插件，直接在引导向导中选择即可
- **统一管理**: 与其他通道（Telegram、Discord 等）使用相同的配置方式
- **网络友好**: 钉钉 Stream 模式特别适合国内网络环境
- **企业场景**: 适合企业内部使用，数据安全可控

---

## ✅ 中文本地化

- 完整的中文引导向导
- 自动检测系统语言
- 支持手动切换语言
- 国内通道配置全中文提示

**本地化文件位置**:

- `src/i18n/index.ts` - 翻译系统核心
- `src/i18n/types.ts` - 翻译键类型定义
- `src/i18n/translations.ts` - 中英文翻译内容
- `src/wizard/onboarding.ts` - 本地化引导向导
- `src/commands/onboard-channels.ts` - 通道选择界面本地化
- `ui/src/ui/i18n.ts` - Web UI 国际化支持（前端界面翻译）

### ✅ 会话数据存储路径可视化迁移

本项目实现了**会话数据存储路径的图形化迁移功能**，让普通用户（不懂代码）能够通过可视化界面选择存储位置，避免C盘空间占用过多。

#### 🎯 **功能特点**

1. **图形化文件浏览器**
   - 显示所有可用驱动器（Windows）或根目录（Linux/macOS）
   - 支持目录导航和上级目录返回
   - 实时显示当前路径

2. **路径验证**
   - 自动检查路径是否存在
   - 验证路径是否可写
   - 对不存在的路径检查父目录权限

3. **数据迁移选项**
   - **复制模式**：将会话数据复制到新位置，保留原数据
   - **移动模式**：将会话数据移动到新位置，删除原数据
   - 自动复制 `sessions.json` 和所有 `.jsonl` 会话记录文件
   - **自动更新配置文件**，无需手动修改 JSON

4. **用户友好的界面**
   - 连接成功后自动加载当前存储路径
   - 实时显示成功/错误消息
   - 支持明暗主题
   - 完整的中英文双语支持

#### 🔧 **使用方法**

1. **启动 Gateway 和 Control UI**

   ```bash
   pnpm openclaw gateway
   # 访问 http://localhost:18789
   ```

2. **打开会话存储设置**
   - 在 Control UI 中导航到 **Overview（概览）** 页面
   - 向下滚动找到 **"会话数据存储"** 卡片

3. **浏览并选择新位置**
   - 点击 **"浏览..."** 按钮打开文件浏览器
   - 在驱动器列表中选择目标驱动器
   - 导航到目标文件夹
   - 点击 **"选择此位置"** 确认

4. **验证路径**
   - 点击 **"验证"** 按钮检查路径是否有效
   - 系统会显示验证结果和权限信息

5. **迁移数据**
   - 选择 **"复制到新位置"**（保留原数据）或 **"移动到新位置"**（删除原数据）
   - 等待迁移完成
   - 查看迁移结果（显示已复制/移动的文件数量）
   - **配置文件将自动更新**，无需手动修改！

6. **重启 Gateway**
   - 迁移完成后，重启 Gateway 以应用新的存储路径：

   ```bash
   # 停止 Gateway
   # Ctrl+C 或关闭终端

   # 重新启动 Gateway
   pnpm openclaw gateway
   ```

#### 📁 **技术实现**

**后端（Gateway RPC 方法）**：

- `src/gateway/server-methods/storage.ts` - 5个RPC方法
  - `storage.listDrives()` - 列出可用驱动器
  - `storage.listDirectories({ path })` - 列出目录内容
  - `storage.validatePath({ path })` - 验证路径有效性
  - `storage.getCurrentPath()` - 获取当前存储路径
  - `storage.migrateData({ newPath, moveFiles })` - 迁移数据

**前端（Web UI 组件）**：

- `ui/src/ui/views/storage-browser.ts` - 文件浏览器组件
- `ui/src/ui/views/session-storage.ts` - 会话存储设置组件
- `ui/src/ui/controllers/storage.ts` - 存储管理控制器（业务逻辑）
- `ui/src/styles/components.css` - 文件浏览器样式

**集成与状态管理**：

- `ui/src/ui/app.ts` - 15个状态字段和7个处理方法
- `ui/src/ui/app-render.ts` - props传递和回调绑定
- `ui/src/ui/app-gateway.ts` - 自动加载存储路径
- `ui/src/ui/views/overview.ts` - Overview页面集成

**国际化支持**：

- `ui/src/ui/i18n.ts` - 29个会话存储相关的翻译键（中英文）
- 所有界面文本支持中英文切换

#### 🔒 **权限控制**

- **读取操作**（浏览、验证、获取当前路径）需要 `operator.read` 权限
- **迁移操作**需要 `operator.admin` 权限
- 在 `src/gateway/server-methods.ts` 中配置权限

---

## 更多资源

- [英文完整文档](./README.md)
- [在线文档](https://docs.openclaw.ai)
- [Gitee 仓库](https://gitee.com/CozyNook/JieZi-ai-PS) (中文汉化版)
- [GitHub 原项目](https://github.com/openclaw/openclaw) (OpenClaw 官方)
- [Discord 社区](https://discord.gg/clawd)

---

## 快速命令参考

```bash
# ========== 安装与初始化 ==========

# 安装项目依赖
pnpm install

# 初始化 UI 依赖（可选）
pnpm ui:install

# 构建 UI
pnpm ui:build

# 构建项目
pnpm build

# 准备 Git Hooks
pnpm prepare

# 完整初始化流程（推荐）
pnpm install && pnpm ui:install && pnpm ui:build && pnpm build

# ========== 配置与引导 ==========

# 运行引导向导（推荐）
pnpm openclaw onboard

# 安装为系统服务
pnpm openclaw onboard --install-daemon

# ========== 启动服务 ==========

# 启动网关
pnpm openclaw gateway

# 指定端口和详细日志
pnpm openclaw gateway --port 18789 --verbose

# 开发模式（自动重载）
pnpm gateway:watch

# 开发模式（跳过通道）
pnpm gateway:dev

# 启动 TUI 终端界面
pnpm tui

# TUI 开发模式
pnpm tui:dev

# UI 开发服务器
pnpm ui:dev

# ========== 状态检查 ==========

# 检查网关状态
pnpm openclaw doctor

# 查看版本
pnpm openclaw --version

# 查看帮助
pnpm openclaw --help

# ========== 消息发送 ==========

# 发送消息
pnpm openclaw message send --to <号码> --message "内容"

# ========== AI 对话 ==========

# AI 对话
pnpm openclaw agent --message "你的问题"

# 高级思考模式
pnpm openclaw agent --message "写一个快速排序算法" --thinking high

# RPC 模式
pnpm openclaw:rpc

# ========== 代码检查与格式化 ==========

# 完整检查（tsgo + lint + format）
pnpm check

# 代码检查
pnpm lint

# 代码检查并修复
pnpm lint:fix

# 格式化检查
pnpm format

# 格式化修复
pnpm format:fix

# ========== 测试 ==========

# 运行测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e

# 运行实时测试
pnpm test:live

# 测试覆盖率
pnpm test:coverage

# 监视模式测试
pnpm test:watch

# UI 测试
pnpm test:ui

# ========== 插件管理 ==========

# 同步插件版本
pnpm plugins:sync

# ========== 协议生成 ==========

# 生成协议 Schema
pnpm protocol:gen

# 生成 Swift 模型
pnpm protocol:gen:swift

# 检查协议一致性
pnpm protocol:check

# ========== 文档命令 ==========

# 构建文档列表
pnpm docs:bin

# 开发模式预览文档
pnpm docs:dev

# 构建文档
pnpm docs:build

# ========== 移动端构建 ==========

# Android 编译
pnpm android:assemble

# Android 安装
pnpm android:install

# Android 运行
pnpm android:run

# Android 测试
pnpm android:test

# iOS 生成项目
pnpm ios:gen

# iOS 打开项目
pnpm ios:open

# iOS 构建
pnpm ios:build

# iOS 运行
pnpm ios:run

# macOS 打包
pnpm mac:package

# macOS 打开应用
pnpm mac:open

# macOS 重启
pnpm mac:restart

# ========== 其他工具 ==========

# 更新项目
pnpm openclaw update

# Canvas A2UI 打包
pnpm canvas:a2ui:bundle

# 检查 TypeScript 文件行数
pnpm check:loc

# 发布检查
pnpm release:check
```

---

**祝你使用愉快！** 🦞

如有问题，请在 [Gitee Issues](https://gitee.com/CozyNook/JieZi-ai-PS/issues) 提交反馈。
