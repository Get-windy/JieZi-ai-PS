/**
 * 智能助手模型账号智能路由引擎单元测试
 */

import { describe, expect, it } from "vitest";
import type { AgentModelAccountsConfig } from "../config/types.agents.js";
import {
  assessComplexity,
  assessCost,
  assessSpeed,
  handleFailover,
  matchCapabilities,
  routeToOptimalModelAccount,
  scoreAllAccounts,
  selectOptimalAccount,
  type AccountScore,
  type ModelInfo,
  type SessionContext,
} from "./model-routing.js";

// ==================== 测试数据 ====================

const simpleContext: SessionContext = {
  sessionId: "test-session-1",
  historyTurns: 2,
  hasCode: false,
  hasImages: false,
  needsTools: false,
  needsReasoning: false,
};

const complexContext: SessionContext = {
  sessionId: "test-session-2",
  historyTurns: 15,
  hasCode: true,
  hasImages: true,
  needsTools: true,
  needsReasoning: true,
};

const basicModel: ModelInfo = {
  id: "gpt-3.5-turbo",
  contextWindow: 16000,
  supportsTools: true,
  supportsVision: false,
  reasoningLevel: 1,
  inputPrice: 0.001,
  outputPrice: 0.002,
  avgResponseTime: 3,
};

const advancedModel: ModelInfo = {
  id: "claude-opus-4-5",
  contextWindow: 200000,
  supportsTools: true,
  supportsVision: true,
  reasoningLevel: 3,
  inputPrice: 0.015,
  outputPrice: 0.075,
  avgResponseTime: 5,
};

// ==================== assessComplexity 测试 ====================

describe("assessComplexity", () => {
  it("should return low score for simple short message", () => {
    const message = "Hello";
    const complexity = assessComplexity(message, simpleContext);
    expect(complexity).toBeLessThan(4);
  });

  it("should return medium score for medium message with history", () => {
    const message = "Can you explain how to implement a binary search tree?";
    const context: SessionContext = {
      ...simpleContext,
      historyTurns: 5,
    };
    const complexity = assessComplexity(message, context);
    expect(complexity).toBeGreaterThanOrEqual(2);
    expect(complexity).toBeLessThanOrEqual(7);
  });

  it("should return high score for complex message requiring tools and reasoning", () => {
    const message =
      "Please analyze this codebase, refactor the main components, write comprehensive tests, and deploy to production with monitoring.";
    const complexity = assessComplexity(message, complexContext);
    expect(complexity).toBeGreaterThanOrEqual(7);
  });

  it("should increase score for code processing", () => {
    const message = "Hello";
    const withoutCode = assessComplexity(message, {
      ...simpleContext,
      hasCode: false,
    });
    const withCode = assessComplexity(message, {
      ...simpleContext,
      hasCode: true,
    });
    expect(withCode).toBeGreaterThan(withoutCode);
  });

  it("should increase score for image processing", () => {
    const message = "Hello";
    const withoutImages = assessComplexity(message, {
      ...simpleContext,
      hasImages: false,
    });
    const withImages = assessComplexity(message, {
      ...simpleContext,
      hasImages: true,
    });
    expect(withImages).toBeGreaterThan(withoutImages);
  });
});

// ==================== matchCapabilities 测试 ====================

describe("matchCapabilities", () => {
  it("should return high score when model fully matches requirements", () => {
    const complexity = 8;
    const score = matchCapabilities(complexity, advancedModel, complexContext);
    expect(score).toBeGreaterThan(70);
  });

  it("should return 0 when model doesn't support required tools", () => {
    const complexity = 5;
    const modelWithoutTools: ModelInfo = {
      ...basicModel,
      supportsTools: false,
    };
    const context: SessionContext = {
      ...simpleContext,
      needsTools: true,
    };
    const score = matchCapabilities(complexity, modelWithoutTools, context);
    expect(score).toBe(0);
  });

  it("should return 0 when model doesn't support required vision", () => {
    const complexity = 5;
    const modelWithoutVision: ModelInfo = {
      ...basicModel,
      supportsVision: false,
    };
    const context: SessionContext = {
      ...simpleContext,
      hasImages: true,
    };
    const score = matchCapabilities(complexity, modelWithoutVision, context);
    expect(score).toBe(0);
  });

  it("should give high score for simple tasks with basic model", () => {
    const complexity = 2;
    const score = matchCapabilities(complexity, basicModel, simpleContext);
    expect(score).toBeGreaterThan(50);
  });
});

// ==================== assessCost 测试 ====================

describe("assessCost", () => {
  it("should return higher score for cheaper models", () => {
    const message = "Hello world";
    const cheapScore = assessCost(message, simpleContext, basicModel);
    const expensiveScore = assessCost(message, simpleContext, advancedModel);
    expect(cheapScore).toBeGreaterThan(expensiveScore);
  });

  it("should return high score for very low cost", () => {
    const message = "Hi";
    const score = assessCost(message, simpleContext, basicModel);
    expect(score).toBeGreaterThan(80);
  });

  it("should consider message length in cost calculation", () => {
    const shortMessage = "Hi";
    const longMessage = "x".repeat(5000); // 足够长以产生明显的成本差异
    const shortContext: SessionContext = {
      ...simpleContext,
      historyTurns: 1,
    };
    const longContext: SessionContext = {
      ...simpleContext,
      historyTurns: 50, // 增加历史轮次以增加成本
    };
    const shortScore = assessCost(shortMessage, shortContext, basicModel);
    const longScore = assessCost(longMessage, longContext, basicModel);
    expect(shortScore).toBeGreaterThan(longScore);
  });
});

// ==================== assessSpeed 测试 ====================

describe("assessSpeed", () => {
  it("should return high score for fast models", () => {
    const fastModel: ModelInfo = {
      ...basicModel,
      avgResponseTime: 1,
    };
    const score = assessSpeed(fastModel);
    expect(score).toBeGreaterThan(80);
  });

  it("should return low score for slow models", () => {
    const slowModel: ModelInfo = {
      ...basicModel,
      avgResponseTime: 12,
    };
    const score = assessSpeed(slowModel);
    expect(score).toBeLessThan(20);
  });

  it("should return default score when no response time data", () => {
    const modelWithoutData: ModelInfo = {
      ...basicModel,
      avgResponseTime: undefined,
    };
    const score = assessSpeed(modelWithoutData);
    expect(score).toBe(50);
  });
});

// ==================== scoreAllAccounts 测试 ====================

describe("scoreAllAccounts", () => {
  it("should score all accounts and sort by total score", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["account1", "account2"],
      routingMode: "smart",
      smartRouting: {
        enableCostOptimization: true,
        complexityWeight: 40,
        capabilityWeight: 30,
        costWeight: 20,
        speedWeight: 10,
      },
    };

    const modelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
      if (accountId === "account1") return basicModel;
      if (accountId === "account2") return advancedModel;
      return undefined;
    };

    const scores = await scoreAllAccounts("Hello world", simpleContext, config, modelInfoGetter);

    expect(scores).toHaveLength(2);
    expect(scores[0].totalScore).toBeGreaterThanOrEqual(scores[1].totalScore);
  });

  it("should mark account as unavailable if no model info", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["account1", "invalid-account"],
      routingMode: "smart",
    };

    const modelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
      if (accountId === "account1") return basicModel;
      return undefined;
    };

    const scores = await scoreAllAccounts("Hello", simpleContext, config, modelInfoGetter);

    const invalidScore = scores.find((s) => s.accountId === "invalid-account");
    expect(invalidScore?.available).toBe(false);
    expect(invalidScore?.totalScore).toBe(0);
  });

  it("should mark account as unavailable if capability score is 0", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["account1"],
      routingMode: "smart",
    };

    const modelWithoutTools: ModelInfo = {
      ...basicModel,
      supportsTools: false,
    };

    const modelInfoGetter = async (): Promise<ModelInfo | undefined> => {
      return modelWithoutTools;
    };

    const context: SessionContext = {
      ...simpleContext,
      needsTools: true,
    };

    const scores = await scoreAllAccounts("Use tools", context, config, modelInfoGetter);

    expect(scores[0].available).toBe(false);
    expect(scores[0].capabilityScore).toBe(0);
  });
});

// ==================== selectOptimalAccount 测试 ====================

describe("selectOptimalAccount", () => {
  const mockScores: AccountScore[] = [
    {
      accountId: "account1",
      totalScore: 80,
      complexityScore: 70,
      capabilityScore: 90,
      costScore: 80,
      speedScore: 70,
      available: true,
    },
    {
      accountId: "account2",
      totalScore: 60,
      complexityScore: 60,
      capabilityScore: 70,
      costScore: 50,
      speedScore: 60,
      available: true,
    },
  ];

  it("should select account with highest score", () => {
    const selected = selectOptimalAccount(mockScores, simpleContext, false);
    expect(selected).toBe("account1");
  });

  it("should prefer pinned account if available and session pinning enabled", () => {
    const contextWithPinned: SessionContext = {
      ...simpleContext,
      pinnedAccountId: "account2",
    };
    const selected = selectOptimalAccount(mockScores, contextWithPinned, true);
    expect(selected).toBe("account2");
  });

  it("should not use pinned account if unavailable", () => {
    const scoresWithUnavailablePinned: AccountScore[] = [
      ...mockScores,
      {
        accountId: "pinned-account",
        totalScore: 90,
        complexityScore: 0,
        capabilityScore: 0,
        costScore: 0,
        speedScore: 0,
        available: false,
      },
    ];
    const contextWithPinned: SessionContext = {
      ...simpleContext,
      pinnedAccountId: "pinned-account",
    };
    const selected = selectOptimalAccount(scoresWithUnavailablePinned, contextWithPinned, true);
    expect(selected).not.toBe("pinned-account");
    expect(selected).toBe("account1");
  });

  it("should return undefined if all accounts unavailable", () => {
    const unavailableScores: AccountScore[] = mockScores.map((s) => ({
      ...s,
      available: false,
    }));
    const selected = selectOptimalAccount(unavailableScores, simpleContext, false);
    expect(selected).toBeUndefined();
  });
});

// ==================== handleFailover 测试 ====================

describe("handleFailover", () => {
  const mockScores: AccountScore[] = [
    {
      accountId: "account1",
      totalScore: 80,
      complexityScore: 70,
      capabilityScore: 90,
      costScore: 80,
      speedScore: 70,
      available: true,
    },
    {
      accountId: "account2",
      totalScore: 60,
      complexityScore: 60,
      capabilityScore: 70,
      costScore: 50,
      speedScore: 60,
      available: true,
    },
    {
      accountId: "account3",
      totalScore: 50,
      complexityScore: 50,
      capabilityScore: 60,
      costScore: 40,
      speedScore: 50,
      available: true,
    },
  ];

  it("should return next available account after failed one", () => {
    const nextAccount = handleFailover("account1", mockScores, "Rate limited");
    expect(nextAccount).toBe("account2");
  });

  it("should skip unavailable accounts", () => {
    const scoresWithUnavailable: AccountScore[] = [
      mockScores[0],
      { ...mockScores[1], available: false },
      mockScores[2],
    ];
    const nextAccount = handleFailover("account1", scoresWithUnavailable, "Rate limited");
    expect(nextAccount).toBe("account3");
  });

  it("should wrap around to beginning if needed", () => {
    const nextAccount = handleFailover("account3", mockScores, "Rate limited");
    expect(nextAccount).toBe("account1");
  });

  it("should return undefined if all accounts exhausted", () => {
    const allUnavailable: AccountScore[] = mockScores.map((s) => ({
      ...s,
      available: false,
    }));
    const nextAccount = handleFailover("account1", allUnavailable, "All failed");
    expect(nextAccount).toBeUndefined();
  });
});

// ==================== routeToOptimalModelAccount 测试 ====================

describe("routeToOptimalModelAccount", () => {
  it("should return default account in manual mode", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["account1", "account2"],
      routingMode: "manual",
      defaultAccountId: "account2",
    };

    const modelInfoGetter = async (): Promise<ModelInfo | undefined> => {
      return basicModel;
    };

    const result = await routeToOptimalModelAccount(
      "Hello",
      simpleContext,
      config,
      modelInfoGetter,
    );

    expect(result.accountId).toBe("account2");
    expect(result.reason).toContain("手动模式");
  });

  it("should perform smart routing in smart mode", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["cheap-account", "expensive-account"],
      routingMode: "smart",
      smartRouting: {
        enableCostOptimization: true,
        costWeight: 80,
        capabilityWeight: 20,
      },
    };

    const modelInfoGetter = async (accountId: string): Promise<ModelInfo | undefined> => {
      if (accountId === "cheap-account") return basicModel;
      if (accountId === "expensive-account") return advancedModel;
      return undefined;
    };

    const result = await routeToOptimalModelAccount(
      "Hello",
      simpleContext,
      config,
      modelInfoGetter,
    );

    expect(result.accountId).toBe("cheap-account"); // Should prefer cheaper model for simple task
    expect(result.reason).toContain("智能路由");
  });

  it("should fallback to first account if all unavailable", async () => {
    const config: AgentModelAccountsConfig = {
      accounts: ["account1", "account2"],
      routingMode: "smart",
    };

    const modelInfoGetter = async (): Promise<ModelInfo | undefined> => {
      return undefined; // All models unavailable
    };

    const result = await routeToOptimalModelAccount(
      "Hello",
      simpleContext,
      config,
      modelInfoGetter,
    );

    expect(result.accountId).toBe("account1");
    expect(result.reason).toContain("故障兜底");
  });
});
