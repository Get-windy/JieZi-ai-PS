#!/usr/bin/env node

/**
 * 模块依赖关系检查命令行工具
 * 
 * 功能：
 * 1. 检测循环依赖
 * 2. 生成启动顺序
 * 3. 验证依赖配置
 * 4. 导出依赖图
 * 5. 可视化依赖关系
 * 
 * 使用方式：
 * ```bash
 * # 检查循环依赖
 * npx tsx src/infra/check-module-deps.ts circular
 * 
 * # 生成启动顺序
 * npx tsx src/infra/check-module-deps.ts order
 * 
 * # 验证配置
 * npx tsx src/infra/check-module-deps.ts validate
 * 
 * # 导出依赖图
 * npx tsx src/infra/check-module-deps.ts graph
 * 
 * # 可视化（生成 DOT 文件）
 * npx tsx src/infra/check-module-deps.ts visualize --output deps.dot
 * ```
 */

import * as fs from "fs";
import * as path from "path";
import {
  ModuleDependencyManager,
  ModulePosition,
  DEFAULT_MODULE_DEPS_CONFIG_PATH,
} from "./module-dependency-manager.js";
import { registerExampleModules } from "./startup-validator.js";

// ============ 命令行参数解析 ============

const args = process.argv.slice(2);
const command = args[0] || "help";
const flags: Record<string, string> = {};

for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].substring(2);
    const value = args[i + 1] || "true";
    flags[key] = value;
    i++;
  }
}

// ============ 主函数 ============

async function main() {
  const configPath = flags.config || DEFAULT_MODULE_DEPS_CONFIG_PATH;
  const outputPath = flags.output || "dependency-graph.json";

  // 创建管理器
  const manager = new ModuleDependencyManager();

  // 尝试加载配置文件
  if (fs.existsSync(configPath)) {
    console.log(`📂 加载配置文件: ${configPath}`);
    manager.loadFromConfig(configPath);
  } else {
    console.log(`⚠️  配置文件不存在: ${configPath}`);
    console.log("📝 使用示例模块进行演示...\n");
    registerExampleModules(manager);
  }

  // 执行命令
  switch (command) {
    case "circular":
      checkCircularDependencies(manager);
      break;

    case "order":
      generateStartupOrder(manager);
      break;

    case "validate":
      validateConfiguration(manager);
      break;

    case "graph":
      exportDependencyGraph(manager, outputPath);
      break;

    case "visualize":
      generateVisualization(manager, outputPath);
      break;

    case "check-can-start":
      const moduleId = args[1];
      if (!moduleId) {
        console.error("❌ 请指定模块 ID");
        console.log("用法: check-can-start <module-id>");
        process.exit(1);
      }
      checkCanStart(manager, moduleId);
      break;

    default:
      showHelp();
      break;
  }
}

// ============ 命令实现 ============

/**
 * 检查循环依赖
 */
function checkCircularDependencies(manager: ModuleDependencyManager): void {
  console.log("\n🔍 检查循环依赖...\n");

  const cycles = manager.detectCircularDependencies();

  if (cycles.length === 0) {
    console.log("✅ 未检测到循环依赖！\n");
  } else {
    console.log(`❌ 发现 ${cycles.length} 个循环依赖链:\n`);
    for (let i = 0; i < cycles.length; i++) {
      console.log(`  ${i + 1}. ${cycles[i].join(" -> ")}`);
    }
    console.log("");

    console.log("💡 建议:");
    console.log("  - 重构代码消除循环依赖");
    console.log("  - 使用依赖注入模式");
    console.log("  - 引入中间层解耦");
    console.log("");
  }
}

/**
 * 生成启动顺序
 */
function generateStartupOrder(manager: ModuleDependencyManager): void {
  console.log("\n📋 生成启动顺序...\n");

  const order = manager.topologicalSort();

  console.log("✅ 建议的启动顺序:\n");
  for (let i = 0; i < order.length; i++) {
    const moduleId = order[i];
    const module = manager["modules"].get(moduleId);
    const deps = module?.dependencies.filter(d => d.type === "required") || [];
    const depStr = deps.length > 0 
      ? ` [依赖: ${deps.map(d => d.moduleName).join(", ")}]` 
      : " [无依赖]";
    
    console.log(`  ${i + 1}. ${moduleId}${depStr}`);
  }
  console.log("");

  // 显示分层
  console.log("📁 按层级分组:\n");
  const phases = manager.generateStartupPhases();
  for (const phase of phases) {
    console.log(`  ${phase.name}:`);
    for (const moduleId of phase.modules) {
      console.log(`    - ${moduleId}`);
    }
    console.log("");
  }
}

/**
 * 验证配置
 */
function validateConfiguration(manager: ModuleDependencyManager): void {
  console.log("\n✅ 验证配置...\n");

  const result = manager.validateStartup();

  if (result.valid) {
    console.log("✅ 配置验证通过！\n");
  } else {
    console.log("❌ 配置验证失败:\n");
    for (const error of result.errors) {
      console.log(`  ${error}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("⚠️  警告:\n");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
    console.log("");
  }

  // 显示可视化
  console.log(manager.generateStartupOrderVisualization());
}

/**
 * 导出依赖图
 */
function exportDependencyGraph(manager: ModuleDependencyManager, outputPath: string): void {
  console.log(`\n📊 导出依赖图到: ${outputPath}\n`);

  const graph = manager.exportDependencyGraph();
  const output = JSON.stringify(graph, null, 2);

  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`✅ 依赖图已导出: ${outputPath}`);
  console.log(`  - 节点数: ${graph.nodes.length}`);
  console.log(`  - 边数: ${graph.edges.length}`);
  console.log("");
}

/**
 * 生成可视化（DOT 格式）
 */
function generateVisualization(manager: ModuleDependencyManager, outputPath: string): void {
  console.log(`\n🎨 生成可视化 DOT 文件: ${outputPath}\n`);

  const graph = manager.exportDependencyGraph();
  const lines: string[] = ["digraph ModuleDependencies {"];
  lines.push("  rankdir=TB;");
  lines.push("  node [shape=box, style=filled];");
  lines.push("");

  // 定义颜色
  const colors: Record<string, string> = {
    core: "#90EE90",
    infrastructure: "#87CEEB",
    service: "#FFD700",
    application: "#FFA07A",
    plugin: "#DDA0DD",
  };

  // 添加节点
  for (const node of graph.nodes) {
    const color = colors[node.position] || "#FFFFFF";
    lines.push(`  "${node.id}" [label="${node.name}", fillcolor="${color}"];`);
  }

  lines.push("");

  // 添加边
  for (const edge of graph.edges) {
    const style = edge.type === "required" ? "[style=bold]" : "[style=dashed]";
    lines.push(`  "${edge.from}" -> "${edge.to}" ${style};`);
  }

  lines.push("}");

  const dotContent = lines.join("\n");
  fs.writeFileSync(outputPath, dotContent, "utf-8");

  console.log(`✅ DOT 文件已生成: ${outputPath}`);
  console.log("");
  console.log("💡 使用 Graphviz 查看:");
  console.log(`  dot -Tpng ${outputPath} -o dependency-graph.png`);
  console.log(`  open dependency-graph.png`);
  console.log("");
}

/**
 * 检查模块是否可以启动
 */
function checkCanStart(manager: ModuleDependencyManager, moduleId: string): void {
  console.log(`\n🔍 检查模块是否可以启动: ${moduleId}\n`);

  const { canStart, blockingDeps } = manager.canStartModule(moduleId);

  if (canStart) {
    console.log(`✅ 模块 ${moduleId} 可以启动`);
    console.log("   所有依赖已满足");
  } else {
    console.log(`❌ 模块 ${moduleId} 无法启动`);
    console.log(`   阻塞的依赖: ${blockingDeps.join(", ")}`);
    console.log("");
    console.log("💡 建议:");
    console.log("   先启动以下模块:");
    for (const dep of blockingDeps) {
      console.log(`   - ${dep}`);
    }
  }
  console.log("");
}

/**
 * 显示帮助
 */
function showHelp(): void {
  console.log(`
📦 模块依赖关系检查工具

用法:
  npx tsx src/infra/check-module-deps.ts <command> [options]

命令:
  circular              检查循环依赖
  order                 生成启动顺序
  validate              验证配置
  graph                 导出依赖图 (JSON)
  visualize             生成可视化 (DOT)
  check-can-start       检查模块是否可以启动
  help                  显示此帮助

选项:
  --config <path>       配置文件路径 (默认: .module-deps-config.json)
  --output <path>       输出文件路径

示例:
  # 检查循环依赖
  npx tsx src/infra/check-module-deps.ts circular

  # 生成启动顺序
  npx tsx src/infra/check-module-deps.ts order

  # 验证配置
  npx tsx src/infra/check-module-deps.ts validate

  # 导出依赖图
  npx tsx src/infra/check-module-deps.ts graph --output deps.json

  # 生成可视化
  npx tsx src/infra/check-module-deps.ts visualize --output deps.dot

配置文件:
  在 .module-deps-config.json 中定义模块依赖关系
  参考 .module-deps-config.example.json 示例
`);
}

// ============ 运行 ============

main().catch((error) => {
  console.error("❌ 执行失败:", error);
  process.exit(1);
});
