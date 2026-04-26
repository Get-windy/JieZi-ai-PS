/**
 * 模块依赖管理系统测试
 * 
 * 测试覆盖：
 * 1. 循环依赖检测
 * 2. 拓扑排序
 * 3. 启动验证
 * 4. 层级规则
 */

import { describe, it, expect } from "vitest";
import {
  ModuleDependencyManager,
  ModulePosition,
  DependencyType,
  createModuleMetadata,
  createModuleDependency,
} from "./module-dependency-manager.js";

describe("ModuleDependencyManager", () => {
  describe("循环依赖检测", () => {
    it("应该检测到简单的循环依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("A", "Module A", ModulePosition.CORE, "src/a.ts", [
          createModuleDependency("B", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("B", "Module B", ModulePosition.CORE, "src/b.ts", [
          createModuleDependency("C", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("C", "Module C", ModulePosition.CORE, "src/c.ts", [
          createModuleDependency("A", DependencyType.REQUIRED), // 循环！
        ]),
      ]);

      const cycles = manager.detectCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      
      // 验证循环链包含 A -> B -> C -> A
      const firstCycle = cycles[0];
      expect(firstCycle).toContain("A");
      expect(firstCycle).toContain("B");
      expect(firstCycle).toContain("C");
    });

    it("应该通过无循环依赖的验证", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("logging", "Logging", ModulePosition.CORE, "src/logging.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("database", "Database", ModulePosition.INFRASTRUCTURE, "src/db.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
          createModuleDependency("logging", DependencyType.REQUIRED),
        ]),
      ]);

      const cycles = manager.detectCircularDependencies();
      expect(cycles.length).toBe(0);
    });

    it("应该检测复杂的循环依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("A", "Module A", ModulePosition.CORE, "src/a.ts", [
          createModuleDependency("B", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("B", "Module B", ModulePosition.CORE, "src/b.ts", [
          createModuleDependency("C", DependencyType.REQUIRED),
          createModuleDependency("D", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("C", "Module C", ModulePosition.CORE, "src/c.ts", [
          createModuleDependency("A", DependencyType.REQUIRED), // 循环1: A -> B -> C -> A
        ]),
        createModuleMetadata("D", "Module D", ModulePosition.CORE, "src/d.ts", [
          createModuleDependency("E", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("E", "Module E", ModulePosition.CORE, "src/e.ts", [
          createModuleDependency("B", DependencyType.REQUIRED), // 循环2: B -> D -> E -> B
        ]),
      ]);

      const cycles = manager.detectCircularDependencies();
      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("拓扑排序", () => {
    it("应该生成正确的启动顺序", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("logging", "Logging", ModulePosition.CORE, "src/logging.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("database", "Database", ModulePosition.INFRASTRUCTURE, "src/db.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
          createModuleDependency("logging", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("auth", "Auth", ModulePosition.SERVICE, "src/auth.ts", [
          createModuleDependency("database", DependencyType.REQUIRED),
        ]),
      ]);

      const order = manager.topologicalSort();
      
      // config 应该在最前面（无依赖）
      expect(order.indexOf("config")).toBeLessThan(order.indexOf("logging"));
      expect(order.indexOf("config")).toBeLessThan(order.indexOf("database"));
      
      // logging 应该在 database 之前
      expect(order.indexOf("logging")).toBeLessThan(order.indexOf("database"));
      
      // database 应该在 auth 之前
      expect(order.indexOf("database")).toBeLessThan(order.indexOf("auth"));
    });

    it("应该处理可选依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("core", "Core", ModulePosition.CORE, "src/core.ts"),
        createModuleMetadata("api", "API", ModulePosition.SERVICE, "src/api.ts", [
          createModuleDependency("core", DependencyType.REQUIRED),
          createModuleDependency("cache", DependencyType.OPTIONAL), // 可选
        ]),
        createModuleMetadata("cache", "Cache", ModulePosition.INFRASTRUCTURE, "src/cache.ts", [
          createModuleDependency("core", DependencyType.REQUIRED),
        ]),
      ]);

      const order = manager.topologicalSort();
      
      // core 应该在最前面
      expect(order.indexOf("core")).toBeLessThan(order.indexOf("api"));
      expect(order.indexOf("core")).toBeLessThan(order.indexOf("cache"));
    });
  });

  describe("启动验证", () => {
    it("应该通过有效的配置验证", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("logging", "Logging", ModulePosition.CORE, "src/logging.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
        ]),
      ]);

      const result = manager.validateStartup();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("应该检测到缺失的依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("api", "API", ModulePosition.SERVICE, "src/api.ts", [
          createModuleDependency("database", DependencyType.REQUIRED), // database 未注册
        ]),
      ]);

      const result = manager.validateStartup();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("database"))).toBe(true);
    });

    it("应该检测到循环依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("A", "Module A", ModulePosition.CORE, "src/a.ts", [
          createModuleDependency("B", DependencyType.REQUIRED),
        ]),
        createModuleMetadata("B", "Module B", ModulePosition.CORE, "src/b.ts", [
          createModuleDependency("A", DependencyType.REQUIRED),
        ]),
      ]);

      const result = manager.validateStartup();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("循环依赖"))).toBe(true);
    });
  });

  describe("层级规则", () => {
    it("应该警告跨层依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("gateway", "Gateway", ModulePosition.APPLICATION, "src/gateway.ts", [
          createModuleDependency("config", DependencyType.REQUIRED), // 跳过中间层
        ]),
      ]);

      const result = manager.validateStartup();
      
      // 应该产生警告（不是错误）
      expect(result.warnings.some(w => w.includes("直接依赖") && w.includes("跳过了中间层"))).toBe(true);
    });

    it("应该允许相邻层依赖", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("database", "Database", ModulePosition.INFRASTRUCTURE, "src/db.ts", [
          createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        ]),
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("auth", "Auth", ModulePosition.SERVICE, "src/auth.ts", [
          createModuleDependency("database", DependencyType.REQUIRED), // 相邻层
        ]),
      ]);

      const result = manager.validateStartup();
      
      // 不应该有跨层警告
      expect(result.warnings.some(w => w.includes("跳过了中间层"))).toBe(false);
    });
  });

  describe("启动阶段生成", () => {
    it("应该根据层级生成启动阶段", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("database", "Database", ModulePosition.INFRASTRUCTURE, "src/db.ts"),
        createModuleMetadata("auth", "Auth", ModulePosition.SERVICE, "src/auth.ts"),
        createModuleMetadata("gateway", "Gateway", ModulePosition.APPLICATION, "src/gateway.ts"),
      ]);

      const phases = manager.generateStartupPhases();
      
      expect(phases.length).toBe(4);
      expect(phases[0].name).toBe("核心层");
      expect(phases[1].name).toBe("基础设施层");
      expect(phases[2].name).toBe("服务层");
      expect(phases[3].name).toBe("应用层");
    });
  });

  describe("模块启动状态", () => {
    it("应该正确检查模块是否可以启动", () => {
      const manager = new ModuleDependencyManager();
      
      manager.registerModules([
        createModuleMetadata("config", "Config", ModulePosition.CORE, "src/config.ts"),
        createModuleMetadata("database", "Database", ModulePosition.INFRASTRUCTURE, "src/db.ts", [
          createModuleDependency("config", DependencyType.REQUIRED),
        ]),
      ]);

      // config 无依赖，应该可以启动
      const configCheck = manager.canStartModule("config");
      expect(configCheck.canStart).toBe(true);
      expect(configCheck.blockingDeps).toHaveLength(0);

      // database 依赖 config，但 config 未启动
      const dbCheck1 = manager.canStartModule("database");
      expect(dbCheck1.canStart).toBe(false);
      expect(dbCheck1.blockingDeps).toContain("config");

      // 标记 config 为已启动
      manager.recordModuleStart("config", "started" as any);

      // 现在 database 应该可以启动
      const dbCheck2 = manager.canStartModule("database");
      expect(dbCheck2.canStart).toBe(true);
    });
  });
});

describe("辅助函数", () => {
  it("createModuleDependency 应该创建正确的依赖对象", () => {
    const dep = createModuleDependency("database", DependencyType.REQUIRED, "需要数据库");
    
    expect(dep.moduleName).toBe("database");
    expect(dep.type).toBe(DependencyType.REQUIRED);
    expect(dep.description).toBe("需要数据库");
  });

  it("createModuleMetadata 应该创建正确的模块元数据", () => {
    const mod = createModuleMetadata(
      "auth",
      "Auth Service",
      ModulePosition.SERVICE,
      "src/auth.ts",
      [createModuleDependency("database", DependencyType.REQUIRED)],
      { version: "1.0.0", owner: "team-a" }
    );
    
    expect(mod.id).toBe("auth");
    expect(mod.name).toBe("Auth Service");
    expect(mod.position).toBe(ModulePosition.SERVICE);
    expect(mod.dependencies).toHaveLength(1);
    expect(mod.version).toBe("1.0.0");
    expect(mod.owner).toBe("team-a");
  });
});
