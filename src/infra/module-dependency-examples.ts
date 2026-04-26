/**
 * 模块依赖管理 - 实际使用示例
 * 
 * 演示如何在真实项目中集成和使用依赖管理系统
 */

import {
  ModuleDependencyManager,
  ModulePosition,
  DependencyType,
  createModuleMetadata,
  createModuleDependency,
} from "./module-dependency-manager.js";
import { validateStartupBeforeBoot } from "./startup-validator.js";

// ============ 示例1: 定义项目模块 ============

/**
 * 示例：电商平台的模块定义
 */
function defineECommerceModules(): ModuleDependencyManager {
  const manager = new ModuleDependencyManager();

  // 核心层
  manager.registerModules([
    createModuleMetadata(
      "config",
      "配置中心",
      ModulePosition.CORE,
      "src/config/index.ts",
      [],
      { description: "加载和管理应用配置", version: "2.0.0" }
    ),
    createModuleMetadata(
      "logging",
      "日志系统",
      ModulePosition.CORE,
      "src/logging/index.ts",
      [createModuleDependency("config", DependencyType.REQUIRED, "需要日志配置")],
      { description: "统一的日志和监控", version: "2.0.0" }
    ),
    createModuleMetadata(
      "utils",
      "工具库",
      ModulePosition.CORE,
      "src/utils/index.ts",
      [],
      { description: "通用工具和辅助函数", version: "2.0.0" }
    ),
  ]);

  // 基础设施层
  manager.registerModules([
    createModuleMetadata(
      "database",
      "数据库",
      ModulePosition.INFRASTRUCTURE,
      "src/infrastructure/database.ts",
      [
        createModuleDependency("config", DependencyType.REQUIRED, "需要数据库配置"),
        createModuleDependency("logging", DependencyType.REQUIRED, "需要SQL日志"),
      ],
      { description: "PostgreSQL 数据库连接和 ORM", version: "3.0.0" }
    ),
    createModuleMetadata(
      "cache",
      "缓存服务",
      ModulePosition.INFRASTRUCTURE,
      "src/infrastructure/cache.ts",
      [
        createModuleDependency("config", DependencyType.REQUIRED, "需要Redis配置"),
        createModuleDependency("logging", DependencyType.REQUIRED, "需要缓存日志"),
      ],
      { description: "Redis 缓存层", version: "2.5.0" }
    ),
    createModuleMetadata(
      "queue",
      "消息队列",
      ModulePosition.INFRASTRUCTURE,
      "src/infrastructure/queue.ts",
      [
        createModuleDependency("config", DependencyType.REQUIRED),
        createModuleDependency("logging", DependencyType.REQUIRED),
      ],
      { description: "RabbitMQ 消息队列", version: "2.0.0" }
    ),
  ]);

  // 服务层
  manager.registerModules([
    createModuleMetadata(
      "auth",
      "认证服务",
      ModulePosition.SERVICE,
      "src/services/auth.ts",
      [
        createModuleDependency("database", DependencyType.REQUIRED, "存储用户凭证"),
        createModuleDependency("cache", DependencyType.REQUIRED, "缓存Token"),
        createModuleDependency("logging", DependencyType.REQUIRED),
      ],
      { description: "JWT认证和权限管理", version: "3.1.0" }
    ),
    createModuleMetadata(
      "product",
      "商品服务",
      ModulePosition.SERVICE,
      "src/services/product.ts",
      [
        createModuleDependency("database", DependencyType.REQUIRED, "商品信息存储"),
        createModuleDependency("cache", DependencyType.REQUIRED, "商品缓存"),
      ],
      { description: "商品目录和管理", version: "2.8.0" }
    ),
    createModuleMetadata(
      "order",
      "订单服务",
      ModulePosition.SERVICE,
      "src/services/order.ts",
      [
        createModuleDependency("database", DependencyType.REQUIRED),
        createModuleDependency("product", DependencyType.REQUIRED, "需要商品信息"),
        createModuleDependency("queue", DependencyType.REQUIRED, "订单事件"),
      ],
      { description: "订单处理和管理", version: "3.0.0" }
    ),
    createModuleMetadata(
      "payment",
      "支付服务",
      ModulePosition.SERVICE,
      "src/services/payment.ts",
      [
        createModuleDependency("order", DependencyType.REQUIRED, "需要订单信息"),
        createModuleDependency("queue", DependencyType.REQUIRED, "支付事件"),
      ],
      { description: "支付网关集成", version: "2.5.0" }
    ),
  ]);

  // 应用层
  manager.registerModules([
    createModuleMetadata(
      "api-gateway",
      "API网关",
      ModulePosition.APPLICATION,
      "src/gateway/index.ts",
      [
        createModuleDependency("auth", DependencyType.REQUIRED),
        createModuleDependency("product", DependencyType.REQUIRED),
        createModuleDependency("order", DependencyType.REQUIRED),
        createModuleDependency("payment", DependencyType.REQUIRED),
      ],
      { description: "RESTful API 和路由", version: "3.2.0" }
    ),
    createModuleMetadata(
      "admin-panel",
      "管理后台",
      ModulePosition.APPLICATION,
      "src/admin/index.ts",
      [
        createModuleDependency("api-gateway", DependencyType.REQUIRED),
        createModuleDependency("auth", DependencyType.REQUIRED),
      ],
      { description: "管理员控制面板", version: "2.0.0" }
    ),
  ]);

  // 插件层
  manager.registerModules([
    createModuleMetadata(
      "wechat-pay-plugin",
      "微信支付插件",
      ModulePosition.PLUGIN,
      "src/plugins/wechat-pay/index.ts",
      [
        createModuleDependency("payment", DependencyType.REQUIRED),
        createModuleDependency("api-gateway", DependencyType.REQUIRED),
      ],
      { description: "微信支付集成", version: "1.5.0", owner: "payment-team" }
    ),
    createModuleMetadata(
      "alipay-plugin",
      "支付宝插件",
      ModulePosition.PLUGIN,
      "src/plugins/alipay/index.ts",
      [
        createModuleDependency("payment", DependencyType.REQUIRED),
        createModuleDependency("api-gateway", DependencyType.REQUIRED),
      ],
      { description: "支付宝集成", version: "1.5.0", owner: "payment-team" }
    ),
  ]);

  return manager;
}

// ============ 示例2: 集成到应用入口 ============

/**
 * 示例：在应用启动时验证依赖
 */
async function bootstrapApplication(): Promise<void> {
  console.log("🚀 应用启动中...\n");

  try {
    // 1. 验证模块依赖
    console.log("📋 步骤1: 验证模块依赖...");
    const validation = await validateStartupBeforeBoot({
      configPath: ".module-deps-config.json",
      strict: true, // 验证失败则阻止启动
      verbose: true,
    });

    if (!validation.valid) {
      console.error("❌ 依赖验证失败，应用无法启动");
      process.exit(1);
    }

    console.log("\n✅ 依赖验证通过！\n");

    // 2. 按顺序启动模块
    console.log("📋 步骤2: 按依赖顺序启动模块...");
    const manager = new ModuleDependencyManager(".module-deps-config.json");
    const startupOrder = manager.topologicalSort();

    for (const moduleId of startupOrder) {
      console.log(`  启动模块: ${moduleId}`);
      
      // 检查依赖是否已满足
      const { canStart, blockingDeps } = manager.canStartModule(moduleId);
      
      if (!canStart) {
        console.error(`  ❌ 模块 ${moduleId} 无法启动`);
        console.error(`     阻塞的依赖: ${blockingDeps.join(", ")}`);
        process.exit(1);
      }

      // 模拟启动（这里应该是实际的启动逻辑）
      await startModule(moduleId);
      
      // 记录启动状态
      manager.recordModuleStart(moduleId, "started" as any);
      
      console.log(`  ✅ 模块 ${moduleId} 启动成功`);
    }

    console.log("\n🎉 所有模块启动成功！应用已就绪。\n");
  } catch (error) {
    console.error("❌ 应用启动失败:", error);
    process.exit(1);
  }
}

/**
 * 模拟模块启动函数
 */
async function startModule(moduleId: string): Promise<void> {
  // 这里应该是实际的模块启动逻辑
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// ============ 示例3: 动态模块注册 ============

/**
 * 示例：根据环境动态注册模块
 */
function registerEnvironmentModules(
  manager: ModuleDependencyManager,
  environment: "development" | "staging" | "production"
): void {
  // 开发环境特有模块
  if (environment === "development") {
    manager.registerModule(
      createModuleMetadata(
        "hot-reload",
        "热重载",
        ModulePosition.PLUGIN,
        "src/plugins/hot-reload.ts",
        [createModuleDependency("api-gateway", DependencyType.OPTIONAL)],
        { description: "开发时热重载" }
      )
    );

    manager.registerModule(
      createModuleMetadata(
        "debug-panel",
        "调试面板",
        ModulePosition.PLUGIN,
        "src/plugins/debug-panel.ts",
        [createModuleDependency("api-gateway", DependencyType.OPTIONAL)],
        { description: "开发调试工具" }
      )
    );
  }

  // 生产环境特有模块
  if (environment === "production") {
    manager.registerModule(
      createModuleMetadata(
        "monitoring",
        "监控系统",
        ModulePosition.PLUGIN,
        "src/plugins/monitoring.ts",
        [
          createModuleDependency("logging", DependencyType.REQUIRED),
          createModuleDependency("api-gateway", DependencyType.REQUIRED),
        ],
        { description: "生产环境监控和告警" }
      )
    );

    manager.registerModule(
      createModuleMetadata(
        "rate-limiter",
        "限流器",
        ModulePosition.PLUGIN,
        "src/plugins/rate-limiter.ts",
        [
          createModuleDependency("cache", DependencyType.REQUIRED),
          createModuleDependency("api-gateway", DependencyType.REQUIRED),
        ],
        { description: "API限流保护" }
      )
    );
  }
}

// ============ 示例4: 处理循环依赖 ============

/**
 * 示例：检测并修复循环依赖
 */
async function detectAndFixCircularDeps(): Promise<void> {
  const manager = new ModuleDependencyManager();

  // 定义有循环依赖的模块
  manager.registerModules([
    createModuleMetadata(
      "userService",
      "用户服务",
      ModulePosition.SERVICE,
      "src/services/user.ts",
      [createModuleDependency("orderService", DependencyType.REQUIRED, "需要订单信息")],
      { description: "用户管理" }
    ),
    createModuleMetadata(
      "orderService",
      "订单服务",
      ModulePosition.SERVICE,
      "src/services/order.ts",
      [createModuleDependency("paymentService", DependencyType.REQUIRED)],
      { description: "订单管理" }
    ),
    createModuleMetadata(
      "paymentService",
      "支付服务",
      ModulePosition.SERVICE,
      "src/services/payment.ts",
      [createModuleDependency("userService", DependencyType.REQUIRED, "需要用户验证")], // 循环！
      { description: "支付处理" }
    ),
  ]);

  console.log("🔍 检测循环依赖...\n");

  const cycles = manager.detectCircularDependencies();

  if (cycles.length > 0) {
    console.log("❌ 发现循环依赖:");
    for (const cycle of cycles) {
      console.log(`  ${cycle.join(" -> ")}`);
    }

    console.log("\n💡 修复建议:");
    console.log("  问题: userService -> orderService -> paymentService -> userService");
    console.log("  方案: 引入事件总线解耦");
    console.log("");
    console.log("  修改前:");
    console.log("    paymentService 直接调用 userService.validateUser()");
    console.log("");
    console.log("  修改后:");
    console.log("    paymentService 发布 'payment:created' 事件");
    console.log("    userService 监听事件并自动验证");
    console.log("");
  } else {
    console.log("✅ 未检测到循环依赖");
  }
}

// ============ 示例5: 导出依赖图用于可视化 ============

/**
 * 示例：导出依赖图供团队查看
 */
async function exportTeamDependencyGraph(): Promise<void> {
  const manager = defineECommerceModules();

  console.log("📊 导出依赖图用于团队文档...\n");

  const graph = manager.exportDependencyGraph();

  // 保存为 JSON 文件（可以用 D3.js 等工具可视化）
  const fs = await import("fs");
  fs.writeFileSync(
    "team-dependency-graph.json",
    JSON.stringify(graph, null, 2),
    "utf-8"
  );

  console.log("✅ 依赖图已导出: team-dependency-graph.json");
  console.log(`   节点数: ${graph.nodes.length}`);
  console.log(`   边数: ${graph.edges.length}`);
  console.log("");
  console.log("💡 团队使用建议:");
  console.log("  1. 将依赖图添加到项目文档");
  console.log("  2. 在 Onboarding 时展示给新成员");
  console.log("  3. PR 审查时检查依赖变更");
}

// ============ 运行所有示例 ============

async function runAllExamples(): Promise<void> {
  console.log("=" .repeat(60));
  console.log("模块依赖管理系统 - 使用示例");
  console.log("=" .repeat(60));
  console.log("");

  // 示例1: 定义电商模块
  console.log("📦 示例1: 定义电商平台模块");
  const ecommerceManager = defineECommerceModules();
  const order = ecommerceManager.topologicalSort();
  console.log(`✅ 已定义 ${ecommerceManager["modules"].size} 个模块`);
  console.log(`   启动顺序: ${order.join(" -> ")}\n`);

  // 示例2: 应用启动验证
  console.log("-".repeat(60));
  console.log("🚀 示例2: 应用启动验证（模拟）");
  await bootstrapApplication();

  // 示例3: 循环依赖检测
  console.log("-".repeat(60));
  console.log("🔄 示例3: 循环依赖检测与修复");
  await detectAndFixCircularDeps();

  // 示例4: 导出团队依赖图
  console.log("-".repeat(60));
  console.log("📊 示例4: 导出团队依赖图");
  await exportTeamDependencyGraph();

  console.log("=" .repeat(60));
  console.log("🎉 所有示例运行完成！");
  console.log("=" .repeat(60));
}

// 如果直接运行此文件
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runAllExamples().catch(console.error);
}

export {
  defineECommerceModules,
  bootstrapApplication,
  detectAndFixCircularDeps,
  exportTeamDependencyGraph,
};
