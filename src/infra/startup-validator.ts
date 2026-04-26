/**
 * 启动前依赖验证器
 * 
 * 在系统启动前验证所有模块依赖关系，
 * 确保不会出现循环依赖、缺失依赖、启动顺序错误等问题。
 * 
 * 使用方式：
 * ```typescript
 * import { validateStartupBeforeBoot } from "./startup-validator.js";
 * 
 * // 在主入口调用
 * const result = await validateStartupBeforeBoot();
 * if (!result.valid) {
 *   console.error("启动验证失败", result.errors);
 *   process.exit(1);
 * }
 * ```
 */

import {
  ModuleDependencyManager,
  ModuleMetadata,
  ModulePosition,
  DependencyType,
  StartupValidationResult,
  DEFAULT_MODULE_DEPS_CONFIG_PATH,
} from "./module-dependency-manager.js";

/**
 * 启动验证配置
 */
export interface StartupValidatorConfig {
  /** 配置文件路径 */
  configPath?: string;
  /** 是否严格模式（验证失败即退出） */
  strict?: boolean;
  /** 是否自动生成启动顺序 */
  autoGenerateOrder?: boolean;
  /** 是否输出详细日志 */
  verbose?: boolean;
  /** 自定义模块注册函数 */
  customModuleRegistry?: (manager: ModuleDependencyManager) => void;
}

/**
 * 启动前依赖验证
 * 
 * @param config 验证配置
 * @returns 验证结果
 */
export async function validateStartupBeforeBoot(
  config: StartupValidatorConfig = {}
): Promise<StartupValidationResult> {
  const {
    configPath = DEFAULT_MODULE_DEPS_CONFIG_PATH,
    strict = true,
    autoGenerateOrder = true,
    verbose = true,
    customModuleRegistry,
  } = config;

  if (verbose) {
    console.log("\n🔍 开始启动前依赖验证...");
    console.log("=" .repeat(60));
  }

  // 1. 创建依赖管理器
  const manager = new ModuleDependencyManager();

  // 2. 从配置文件加载（如果存在）
  if (configPath && require("fs").existsSync(configPath)) {
    if (verbose) {
      console.log(`📂 加载配置文件: ${configPath}`);
    }
    manager.loadFromConfig(configPath);
  }

  // 3. 注册自定义模块（如果有）
  if (customModuleRegistry) {
    if (verbose) {
      console.log("📝 注册自定义模块...");
    }
    customModuleRegistry(manager);
  }

  // 4. 执行验证
  if (verbose) {
    console.log("✅ 执行依赖验证...");
  }
  const result = manager.validateStartup();

  // 5. 自动生成启动顺序（如果需要）
  if (autoGenerateOrder && result.suggestedOrder) {
    const phases = manager.generateStartupPhases();
    manager.setStartupPhases(phases);
  }

  // 6. 输出验证结果
  if (verbose) {
    printValidationResult(result, manager);
  }

  // 7. 严格模式：验证失败则退出
  if (strict && !result.valid) {
    console.error("\n❌ 启动验证失败，系统无法启动！");
    console.error("请修复以上错误后重试。");
    process.exit(1);
  }

  if (verbose) {
    console.log("=" .repeat(60));
    if (result.valid) {
      console.log("✅ 启动验证通过，可以安全启动系统。\n");
    } else {
      console.log("⚠️  启动验证有警告，但可以继续启动。\n");
    }
  }

  return result;
}

/**
 * 打印验证结果
 */
function printValidationResult(
  result: StartupValidationResult,
  manager: ModuleDependencyManager
): void {
  console.log("");

  // 错误
  if (result.errors.length > 0) {
    console.log("❌ 错误:");
    for (const error of result.errors) {
      console.log(`  ${error}`);
    }
    console.log("");
  }

  // 警告
  if (result.warnings.length > 0) {
    console.log("⚠️  警告:");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
    console.log("");
  }

  // 循环依赖
  if (result.circularDependencies && result.circularDependencies.length > 0) {
    console.log("🔄 循环依赖链:");
    for (let i = 0; i < result.circularDependencies.length; i++) {
      console.log(`  ${i + 1}. ${result.circularDependencies[i].join(" -> ")}`);
    }
    console.log("");
  }

  // 启动顺序
  if (result.suggestedOrder && result.suggestedOrder.length > 0) {
    console.log("📋 建议的启动顺序:");
    for (let i = 0; i < result.suggestedOrder.length; i++) {
      const moduleId = result.suggestedOrder[i];
      console.log(`  ${i + 1}. ${moduleId}`);
    }
    console.log("");
  }

  // 可视化
  console.log(manager.generateStartupOrderVisualization());
}

/**
 * 注册示例模块（用于演示）
 */
export function registerExampleModules(manager: ModuleDependencyManager): void {
  // 核心层
  manager.registerModules([
    {
      id: "config-loader",
      name: "配置加载器",
      position: ModulePosition.CORE,
      modulePath: "src/config/loader.ts",
      dependencies: [],
      description: "加载系统配置文件",
      version: "1.0.0",
      owner: "system",
    },
    {
      id: "logging",
      name: "日志系统",
      position: ModulePosition.CORE,
      modulePath: "src/logging/index.ts",
      dependencies: [
        {
          moduleName: "config-loader",
          type: DependencyType.REQUIRED,
          description: "需要日志配置",
        },
      ],
      description: "统一的日志系统",
      version: "1.0.0",
      owner: "system",
    },
    {
      id: "utils",
      name: "工具函数库",
      position: ModulePosition.CORE,
      modulePath: "src/utils/index.ts",
      dependencies: [],
      description: "通用工具函数",
      version: "1.0.0",
      owner: "system",
    },
  ]);

  // 基础设施层
  manager.registerModules([
    {
      id: "database",
      name: "数据库连接",
      position: ModulePosition.INFRASTRUCTURE,
      modulePath: "src/infrastructure/database.ts",
      dependencies: [
        {
          moduleName: "config-loader",
          type: DependencyType.REQUIRED,
          description: "需要数据库配置",
        },
        {
          moduleName: "logging",
          type: DependencyType.REQUIRED,
          description: "需要日志记录",
        },
      ],
      description: "数据库连接和 ORM",
      version: "1.0.0",
      owner: "backend-team",
    },
    {
      id: "cache",
      name: "缓存服务",
      position: ModulePosition.INFRASTRUCTURE,
      modulePath: "src/infrastructure/cache.ts",
      dependencies: [
        {
          moduleName: "config-loader",
          type: DependencyType.REQUIRED,
          description: "需要缓存配置",
        },
        {
          moduleName: "logging",
          type: DependencyType.REQUIRED,
          description: "需要日志记录",
        },
      ],
      description: "Redis 缓存服务",
      version: "1.0.0",
      owner: "backend-team",
    },
    {
      id: "queue",
      name: "消息队列",
      position: ModulePosition.INFRASTRUCTURE,
      modulePath: "src/infrastructure/queue.ts",
      dependencies: [
        {
          moduleName: "config-loader",
          type: DependencyType.REQUIRED,
          description: "需要队列配置",
        },
        {
          moduleName: "logging",
          type: DependencyType.REQUIRED,
          description: "需要日志记录",
        },
      ],
      description: "消息队列服务",
      version: "1.0.0",
      owner: "backend-team",
    },
  ]);

  // 服务层
  manager.registerModules([
    {
      id: "auth",
      name: "认证服务",
      position: ModulePosition.SERVICE,
      modulePath: "src/services/auth.ts",
      dependencies: [
        {
          moduleName: "database",
          type: DependencyType.REQUIRED,
          description: "需要存储用户数据",
        },
        {
          moduleName: "cache",
          type: DependencyType.REQUIRED,
          description: "需要缓存 token",
        },
        {
          moduleName: "logging",
          type: DependencyType.REQUIRED,
          description: "需要日志记录",
        },
      ],
      description: "用户认证和授权",
      version: "1.0.0",
      owner: "security-team",
    },
    {
      id: "api",
      name: "API 服务",
      position: ModulePosition.SERVICE,
      modulePath: "src/services/api.ts",
      dependencies: [
        {
          moduleName: "auth",
          type: DependencyType.REQUIRED,
          description: "需要认证",
        },
        {
          moduleName: "database",
          type: DependencyType.REQUIRED,
          description: "需要数据访问",
        },
        {
          moduleName: "cache",
          type: DependencyType.OPTIONAL,
          description: "可选缓存",
        },
      ],
      description: "RESTful API 服务",
      version: "1.0.0",
      owner: "backend-team",
    },
  ]);

  // 应用层
  manager.registerModules([
    {
      id: "gateway",
      name: "API 网关",
      position: ModulePosition.APPLICATION,
      modulePath: "src/gateway/index.ts",
      dependencies: [
        {
          moduleName: "api",
          type: DependencyType.REQUIRED,
          description: "需要 API 服务",
        },
        {
          moduleName: "auth",
          type: DependencyType.REQUIRED,
          description: "需要认证",
        },
        {
          moduleName: "queue",
          type: DependencyType.OPTIONAL,
          description: "可选异步任务",
        },
      ],
      description: "API 网关和路由",
      version: "1.0.0",
      owner: "platform-team",
    },
    {
      id: "cli",
      name: "命令行工具",
      position: ModulePosition.APPLICATION,
      modulePath: "src/cli/index.ts",
      dependencies: [
        {
          moduleName: "config-loader",
          type: DependencyType.REQUIRED,
          description: "需要配置",
        },
        {
          moduleName: "logging",
          type: DependencyType.REQUIRED,
          description: "需要日志",
        },
      ],
      description: "CLI 命令行界面",
      version: "1.0.0",
      owner: "devtools-team",
    },
  ]);

  // 插件层
  manager.registerModules([
    {
      id: "feishu-plugin",
      name: "飞书插件",
      position: ModulePosition.PLUGIN,
      modulePath: "src/plugins/feishu/index.ts",
      dependencies: [
        {
          moduleName: "gateway",
          type: DependencyType.REQUIRED,
          description: "需要网关",
        },
        {
          moduleName: "auth",
          type: DependencyType.REQUIRED,
          description: "需要认证",
        },
      ],
      description: "飞书通道集成",
      version: "1.0.0",
      owner: "channel-team",
    },
    {
      id: "wechat-plugin",
      name: "微信插件",
      position: ModulePosition.PLUGIN,
      modulePath: "src/plugins/wechat/index.ts",
      dependencies: [
        {
          moduleName: "gateway",
          type: DependencyType.REQUIRED,
          description: "需要网关",
        },
        {
          moduleName: "auth",
          type: DependencyType.REQUIRED,
          description: "需要认证",
        },
      ],
      description: "微信通道集成",
      version: "1.0.0",
      owner: "channel-team",
    },
  ]);
}

/**
 * 演示：运行启动验证
 */
export async function runStartupValidationDemo(): Promise<void> {
  console.log("\n🚀 启动验证演示开始...\n");

  const manager = new ModuleDependencyManager();
  
  // 注册示例模块
  registerExampleModules(manager);

  // 执行验证
  const result = manager.validateStartup();

  // 输出结果
  printValidationResult(result, manager);

  // 导出依赖图（可用于可视化）
  const graph = manager.exportDependencyGraph();
  console.log("\n📊 依赖图数据（JSON）:");
  console.log(JSON.stringify(graph, null, 2));
}
