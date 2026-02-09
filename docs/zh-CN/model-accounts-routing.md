# 智能助手模型账号智能路由配置指南

## 概述

智能助手模型账号智能路由功能允许您为每个智能助手配置多个模型账号，并根据问题复杂度、模型能力、成本、响应速度等因素自动选择最优的模型账号进行回答。

## 核心概念

### 1. 一对多绑定

一个智能助手可以关联多个模型账号，就像一个人可以使用多个不同的工具来完成不同的任务。

### 2. 智能路由模式

系统根据以下因素自动选择最优模型账号：

- **问题复杂度**：分析消息长度、历史轮次、是否包含代码、是否需要推理等
- **模型能力**：评估模型的上下文窗口、工具调用支持、视觉能力、推理能力
- **成本优化**：在满足能力要求的前提下，优先选择成本更低的模型
- **响应速度**：考虑模型的平均响应时间

### 3. 手动模式

如果您希望固定使用某个特定的模型账号，可以配置为手动模式，由系统使用指定的默认账号。

### 4. 会话级别固定

启用会话固定后，同一个对话会话内会优先复用已选择的模型账号，避免频繁切换导致的上下文丢失。

## 配置结构

### 基本配置

```json5
{
  agents: {
    list: [
      {
        id: "my-agent",
        name: "我的智能助手",

        // 【新增】模型账号智能路由配置
        modelAccounts: {
          // 可用模型账号列表（引用 auth.profiles 中的 ID）
          accounts: ["anthropic-oauth", "openai-key-1", "deepseek-key"],

          // 路由模式：manual(手动) 或 smart(智能路由)
          routingMode: "smart",

          // 手动模式下的默认账号（routingMode=manual 时使用）
          defaultAccountId: "anthropic-oauth",

          // 是否启用会话级别模型账号固定（避免频繁切换）
          enableSessionPinning: true,

          // 智能路由配置（仅 routingMode=smart 时有效）
          smartRouting: {
            // 是否启用成本优化
            enableCostOptimization: true,

            // 任务复杂度评估权重（0-100，默认40）
            complexityWeight: 40,

            // 模型能力匹配权重（默认30）
            capabilityWeight: 30,

            // 成本优化权重（默认20）
            costWeight: 20,

            // 响应速度权重（默认10）
            speedWeight: 10,

            // 复杂度阈值定义
            complexityThresholds: {
              // 简单任务阈值（默认 0-3）
              simple: 3,
              // 中等任务阈值（默认 4-7）
              medium: 7,
              // 复杂任务阈值（默认 8-10）
              complex: 10,
            },
          },
        },
      },
    ],
  },
}
```

### 完整示例

请参考 `examples/model-accounts-config.json5` 文件查看完整的配置示例。

## 权重配置说明

智能路由引擎使用加权评分机制选择最优模型账号。总分计算公式：

```
总分 = 复杂度匹配分 × complexityWeight
     + 能力匹配分 × capabilityWeight
     + 成本优化分 × costWeight
     + 响应速度分 × speedWeight
```

### 推荐配置

#### 场景1：成本敏感型

适用于预算有限的场景，优先选择便宜的模型：

```json5
smartRouting: {
  enableCostOptimization: true,
  complexityWeight: 20,
  capabilityWeight: 30,
  costWeight: 40,
  speedWeight: 10
}
```

#### 场景2：性能优先型

适用于对响应质量要求高的场景，优先选择能力强的模型：

```json5
smartRouting: {
  enableCostOptimization: false,
  complexityWeight: 30,
  capabilityWeight: 50,
  costWeight: 10,
  speedWeight: 10
}
```

#### 场景3：速度优先型

适用于对响应速度要求高的场景：

```json5
smartRouting: {
  enableCostOptimization: true,
  complexityWeight: 20,
  capabilityWeight: 30,
  costWeight: 20,
  speedWeight: 30
}
```

#### 场景4：平衡型（默认）

各项指标均衡考虑：

```json5
smartRouting: {
  enableCostOptimization: true,
  complexityWeight: 40,
  capabilityWeight: 30,
  costWeight: 20,
  speedWeight: 10
}
```

## 复杂度评估

系统根据以下维度评估问题复杂度（0-10分）：

| 维度     | 评分规则                                           |
| -------- | -------------------------------------------------- |
| 消息长度 | <50字=1分，50-200字=3分，200-500字=5分，>500字=7分 |
| 历史轮次 | 1-3轮=1分，4-10轮=3分，>10轮=5分                   |
| 工具调用 | 不需要=0分，需要=4分                               |
| 推理深度 | 不需要=0分，需要=4分                               |
| 代码处理 | 无代码=0分，有代码=3分                             |
| 图片处理 | 无图片=0分，有图片=2分                             |

## 能力匹配评估

系统评估模型能力是否满足问题需求（0-100分）：

| 维度       | 评分规则                              |
| ---------- | ------------------------------------- |
| 上下文窗口 | 足够处理对话历史 = 30分               |
| 工具调用   | 需要且支持 = 25分，需要但不支持 = 0分 |
| 视觉能力   | 需要且支持 = 20分，需要但不支持 = 0分 |
| 推理能力   | 根据复杂度和模型等级匹配 = 25分       |

**注意**：如果模型不支持必需的功能（工具调用或视觉能力），能力匹配分数为0，该账号将被标记为不可用。

## 故障转移

当选定的模型账号调用失败时（配额耗尽、限流、服务故障等），系统会自动切换到下一个可用的模型账号，确保服务的连续性。

## 向后兼容

如果智能助手未配置 `modelAccounts`，系统会自动回退到传统的 `model` 配置方式，确保现有配置不受影响。

```json5
{
  agents: {
    list: [
      {
        id: "legacy-agent",
        name: "传统配置的智能助手",

        // 传统配置方式（仍然有效）
        model: {
          primary: "anthropic/claude-opus-4-5",
          fallbacks: ["openai/gpt-4o"],
        },
      },
    ],
  },
}
```

## 最佳实践

### 1. 账号选择

- 为每个智能助手至少配置2个模型账号，确保故障转移可用
- 选择不同能力层级的模型账号（如：基础模型 + 高级模型）
- 确保至少有一个低成本的模型账号用于简单任务

### 2. 权重调整

- 根据实际使用场景调整权重配置
- 定期检查成本报告，调整 `costWeight` 以控制预算
- 如果响应速度是关键需求，适当提高 `speedWeight`

### 3. 会话固定

- 对于需要上下文连贯性的对话，建议启用 `enableSessionPinning`
- 对于独立的单次查询，可以禁用会话固定以获得更灵活的模型选择

### 4. 监控与优化

- 定期查看日志中的路由决策信息
- 分析不同模型账号的使用频率和成本
- 根据实际效果调整配置参数

## 故障排查

### 问题1：智能路由未生效

**症状**：配置了 `modelAccounts` 但系统仍使用传统的 `model` 配置

**解决方案**：

1. 检查 `routingMode` 是否正确设置为 `"smart"`
2. 确认 `accounts` 列表中的账号 ID 在 `auth.profiles` 中存在
3. 查看日志中是否有错误信息

### 问题2：总是选择同一个账号

**症状**：智能路由总是选择同一个模型账号

**解决方案**：

1. 检查其他账号是否可用（是否配额耗尽或服务故障）
2. 调整权重配置，降低成本权重或提高能力权重
3. 确认模型账号的能力信息是否正确配置

### 问题3：频繁切换账号

**症状**：同一个对话会话中频繁切换模型账号

**解决方案**：

1. 启用 `enableSessionPinning` 固定会话级别账号
2. 调整权重配置，避免微小差异导致频繁切换
3. 检查是否有账号频繁出现故障

## 相关文档

- [智能助手配置指南](./agents-config.md)
- [认证配置指南](./auth-config.md)
- [模型账号管理](./model-accounts.md)
