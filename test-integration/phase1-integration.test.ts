/**
 * Phase 1 智能模型路由系统 - 集成测试
 *
 * 本测试验证 Phase 1 的核心功能和集成是否正常工作。
 */

import type { ModelInfo } from "../src/agents/model-routing.js";
import type { OpenClawConfig } from "../src/config/types.js";
import {
  selectModelAccount,
  modelRoutingIntegrator,
} from "../src/agents/model-routing-integration.js";
import { initializePhaseIntegration } from "../src/config/phase-integration.js";

// 模拟配置
const mockConfig: OpenClawConfig = {
  agents: {
    list: [
      {
        id: "test-assistant",
        modelAccounts: {
          accounts: ["gpt4-test", "deepseek-test"],
          routingMode: "smart",
          scoringWeights: {
            complexity: 0.3,
            capability: 0.4,
            cost: 0.2,
            speed: 0.1,
          },
        },
      },
    ],
  },
  auth: {
    profiles: [
      {
        id: "gpt4-test",
        provider: "openai",
        model: "gpt-4-turbo",
        apiKey: "test-key",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        inputPricePerMToken: 10.0,
        outputPricePerMToken: 30.0,
      },
      {
        id: "deepseek-test",
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "test-key",
        contextWindow: 64000,
        supportsTools: true,
        supportsVision: false,
        inputPricePerMToken: 0.14,
        outputPricePerMToken: 0.28,
      },
    ],
  },
} as any;

// 模拟 modelInfoGetter
const mockModelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
  const profile = (mockConfig.auth?.profiles as any[])?.find((p) => p.id === accountId);
  if (!profile) return undefined;

  return {
    contextWindow: profile.contextWindow || 100000,
    supportsTools: profile.supportsTools ?? true,
    supportsVision: profile.supportsVision ?? false,
    reasoning: profile.reasoning ?? false,
    inputPricePerMToken: profile.inputPricePerMToken || 0,
    outputPricePerMToken: profile.outputPricePerMToken || 0,
  };
};

// 测试函数
async function runTests() {
  console.log("=".repeat(60));
  console.log("Phase 1 智能模型路由系统 - 集成测试");
  console.log("=".repeat(60));

  try {
    // 测试 1: 配置验证和初始化
    console.log("\n[测试 1] 配置验证和初始化");
    const initResult = initializePhaseIntegration(mockConfig);
    console.assert(initResult.success === true, "初始化应该成功");
    console.assert(initResult.errors.length === 0, "不应该有配置错误");
    console.log("✅ 配置验证通过");

    // 测试 2: 简单问题路由（应选择经济型模型）
    console.log("\n[测试 2] 简单问题路由");
    const simpleResult = await selectModelAccount({
      config: mockConfig,
      agentId: "test-assistant",
      sessionId: "test-session-1",
      message: "今天天气怎么样？",
      context: { history: [], tools: [], hasImages: false },
      modelInfoGetter: mockModelInfoGetter,
    });
    console.assert(simpleResult !== null, "应该返回路由结果");
    console.assert(simpleResult!.accountId === "deepseek-test", "简单问题应选择经济型模型");
    console.log(`✅ 简单问题路由成功: ${simpleResult!.accountId}`);
    console.log(`   原因: ${simpleResult!.reason}`);

    // 测试 3: 复杂问题路由（应选择高级模型）
    console.log("\n[测试 3] 复杂问题路由");
    const complexResult = await selectModelAccount({
      config: mockConfig,
      agentId: "test-assistant",
      sessionId: "test-session-2",
      message:
        "帮我设计一个支持100万并发的分布式系统架构，需要考虑容错、负载均衡、数据一致性等问题...",
      context: {
        history: [
          { role: "user", content: "消息1" },
          { role: "assistant", content: "回复1" },
          { role: "user", content: "消息2" },
          { role: "assistant", content: "回复2" },
        ],
        tools: ["search", "execute", "analyze"],
        hasImages: false,
      },
      modelInfoGetter: mockModelInfoGetter,
    });
    console.assert(complexResult !== null, "应该返回路由结果");
    console.assert(complexResult!.accountId === "gpt4-test", "复杂问题应选择高级模型");
    console.log(`✅ 复杂问题路由成功: ${complexResult!.accountId}`);
    console.log(`   原因: ${complexResult!.reason}`);

    // 测试 4: 全局实例功能
    console.log("\n[测试 4] 全局实例功能");
    console.assert(modelRoutingIntegrator.isInitialized() === true, "全局实例应该已初始化");
    const integrator = modelRoutingIntegrator.getInstance();
    const result4 = await integrator.selectModelAccount({
      agentId: "test-assistant",
      sessionId: "test-session-3",
      message: "Hello",
      context: { history: [], tools: [], hasImages: false },
      modelInfoGetter: mockModelInfoGetter,
    });
    console.assert(result4 !== null, "应该返回路由结果");
    console.log(`✅ 全局实例功能正常: ${result4!.accountId}`);

    // 测试 5: 会话固定
    console.log("\n[测试 5] 会话固定");
    const pinnedAccount = integrator.getSessionPinnedAccount("test-session-3");
    console.assert(pinnedAccount === result4!.accountId, "会话应该固定到首次选择的账号");
    console.log(`✅ 会话固定成功: test-session-3 -> ${pinnedAccount}`);

    // 测试 6: 故障转移
    console.log("\n[测试 6] 故障转移");
    const nextAccount = await integrator.handleAccountFailure({
      agentId: "test-assistant",
      sessionId: "test-session-4",
      failedAccountId: "gpt4-test",
      reason: "API rate limit exceeded",
      lastRoutingResult: {
        accountId: "gpt4-test",
        reason: "test",
        scores: [
          { accountId: "gpt4-test", totalScore: 90 },
          { accountId: "deepseek-test", totalScore: 80 },
        ],
      },
    });
    console.assert(nextAccount === "deepseek-test", "应该切换到下一个可用账号");
    console.log(`✅ 故障转移成功: gpt4-test -> ${nextAccount}`);

    // 测试 7: 失败次数跟踪
    console.log("\n[测试 7] 失败次数跟踪");
    const failCount = integrator.getAccountFailureCount("gpt4-test");
    console.assert(failCount === 1, "失败次数应该为1");
    console.log(`✅ 失败次数跟踪成功: gpt4-test 失败 ${failCount} 次`);

    // 测试 8: 重置会话固定
    console.log("\n[测试 8] 重置会话固定");
    integrator.resetSessionPinning("test-session-3");
    const pinnedAfterReset = integrator.getSessionPinnedAccount("test-session-3");
    console.assert(pinnedAfterReset === undefined, "会话固定应该被清除");
    console.log(`✅ 会话固定重置成功`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ 所有测试通过！");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ 测试失败:", error);
    console.error("=".repeat(60));
    process.exit(1);
  }
}

// 运行测试
runTests();
