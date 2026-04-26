/**
 * 模块启动依赖关系管理器
 * 
 * 解决的核心问题：
 * 1. 模块间隐式依赖关系难以发现
 * 2. 启动顺序错误导致系统崩溃
 * 3. 循环依赖导致死锁
 * 4. 模块位置配置不当导致运行失败
 * 
 * 业界最佳实践：
 * - Nx: 依赖图可视化 + 强制层级依赖
 * - Turborepo: 自动任务依赖分析
 * - dependency-cruiser: 循环依赖检测
 * - Spring DI: 依赖注入容器
 */

import * as fs from "fs";
import * as path from "path";

// ============ 类型定义 ============

/**
 * 模块依赖类型
 */
export enum DependencyType {
  /** 强依赖：必须存在且先启动 */
  REQUIRED = "required",
  /** 弱依赖：可选，存在则使用 */
  OPTIONAL = "optional",
  /** 条件依赖：满足特定条件时才需要 */
  CONDITIONAL = "conditional",
  /** 插件依赖：动态加载的扩展 */
  PLUGIN = "plugin",
}

/**
 * 模块位置类型
 */
export enum ModulePosition {
  /** 核心层：无外部依赖的基础模块 */
  CORE = "core",
  /** 基础设施层：数据库、缓存、队列等 */
  INFRASTRUCTURE = "infrastructure",
  /** 服务层：业务逻辑服务 */
  SERVICE = "service",
  /** 应用层：API、网关、CLI */
  APPLICATION = "application",
  /** 插件层：动态扩展 */
  PLUGIN = "plugin",
}

/**
 * 模块依赖声明
 */
export interface ModuleDependency {
  /** 依赖的模块名称 */
  moduleName: string;
  /** 依赖类型 */
  type: DependencyType;
  /** 依赖条件（仅 CONDITIONAL 类型） */
  condition?: string;
  /** 依赖描述 */
  description?: string;
}

/**
 * 模块元数据
 */
export interface ModuleMetadata {
  /** 模块唯一标识 */
  id: string;
  /** 模块名称 */
  name: string;
  /** 模块位置/层级 */
  position: ModulePosition;
  /** 模块路径 */
  modulePath: string;
  /** 依赖列表 */
  dependencies: ModuleDependency[];
  /** 启动超时（毫秒） */
  startupTimeout?: number;
  /** 是否可延迟加载 */
  lazy?: boolean;
  /** 模块描述 */
  description?: string;
  /** 模块版本 */
  version?: string;
  /** 模块负责人 */
  owner?: string;
}

/**
 * 模块状态
 */
export enum ModuleStatus {
  /** 未启动 */
  PENDING = "pending",
  /** 启动中 */
  STARTING = "starting",
  /** 已启动 */
  STARTED = "started",
  /** 启动失败 */
  FAILED = "failed",
  /** 已停止 */
  STOPPED = "stopped",
}

/**
 * 启动验证结果
 */
export interface StartupValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings: string[];
  /** 建议的启动顺序 */
  suggestedOrder?: string[];
  /** 循环依赖链 */
  circularDependencies?: string[][];
}

/**
 * 模块启动上下文
 */
export interface ModuleStartupContext {
  /** 模块 ID */
  moduleId: string;
  /** 启动时间戳 */
  startedAt: number;
  /** 状态 */
  status: ModuleStatus;
  /** 错误信息 */
  error?: string;
  /** 启动耗时（毫秒） */
  startupDuration?: number;
}

/**
 * 启动顺序配置
 */
export interface StartupSequenceConfig {
  /** 启动阶段 */
  phases: StartupPhase[];
  /** 是否严格模式（失败即停止） */
  strict?: boolean;
  /** 全局超时（毫秒） */
  globalTimeout?: number;
}

/**
 * 启动阶段
 */
export interface StartupPhase {
  /** 阶段名称 */
  name: string;
  /** 模块列表 */
  modules: string[];
  /** 阶段超时（毫秒） */
  timeout?: number;
  /** 失败是否可继续 */
  failFast?: boolean;
}

// ============ 核心管理器 ============

/**
 * 模块启动依赖管理器
 */
export class ModuleDependencyManager {
  private modules: Map<string, ModuleMetadata> = new Map();
  private startupContexts: Map<string, ModuleStartupContext> = new Map();
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    if (configPath && fs.existsSync(configPath)) {
      this.loadFromConfig(configPath);
    }
  }

  /**
   * 注册模块
   */
  registerModule(module: ModuleMetadata): void {
    this.modules.set(module.id, module);
  }

  /**
   * 批量注册模块
   */
  registerModules(modules: ModuleMetadata[]): void {
    for (const mod of modules) {
      this.registerModule(mod);
    }
  }

  /**
   * 从配置文件加载模块
   */
  loadFromConfig(configPath: string): void {
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);
      
      if (config.modules && Array.isArray(config.modules)) {
        this.registerModules(config.modules);
      }
      
      if (config.phases && Array.isArray(config.phases)) {
        this.phases = config.phases;
      }
    } catch (error) {
      console.error(`[ModuleDependencyManager] 加载配置文件失败: ${configPath}`, error);
    }
  }

  /**
   * 保存模块配置到文件
   */
  saveToConfig(configPath: string): void {
    const config = {
      modules: Array.from(this.modules.values()),
      phases: this.phases,
      updatedAt: new Date().toISOString(),
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  // ============ 依赖分析 ============

  /**
   * 检测循环依赖
   * 
   * 算法：深度优先搜索 + 三色标记法
   * - WHITE(0): 未访问
   * - GRAY(1): 访问中
   * - BLACK(2): 已访问
   * 
   * 如果在遍历中遇到 GRAY 节点，说明存在循环依赖
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const colors = new Map<string, number>();
    const parent = new Map<string, string | null>();

    // 初始化所有节点为 WHITE
    for (const moduleId of this.modules.keys()) {
      colors.set(moduleId, 0); // WHITE
      parent.set(moduleId, null);
    }

    const dfs = (moduleId: string, path: string[]) => {
      colors.set(moduleId, 1); // GRAY
      path.push(moduleId);

      const module = this.modules.get(moduleId);
      if (!module) return;

      for (const dep of module.dependencies) {
        const depId = dep.moduleName;
        
        if (!this.modules.has(depId)) {
          continue; // 跳过未注册的模块（可能是外部依赖）
        }

        const depColor = colors.get(depId)!;
        
        if (depColor === 1) {
          // 发现循环依赖：从 depId 到当前路径末尾
          const cycleStart = path.indexOf(depId);
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart).concat([depId]);
            cycles.push(cycle);
          }
        } else if (depColor === 0) {
          parent.set(depId, moduleId);
          dfs(depId, path);
        }
      }

      colors.set(moduleId, 2); // BLACK
      path.pop();
    };

    // 对每个未访问的节点执行 DFS
    for (const moduleId of this.modules.keys()) {
      if (colors.get(moduleId) === 0) {
        dfs(moduleId, []);
      }
    }

    return cycles;
  }

  /**
   * 拓扑排序：计算启动顺序
   * 
   * 算法：Kahn 算法（基于入度）
   * 1. 计算每个节点的入度
   * 2. 入度为 0 的节点加入队列
   * 3. 处理队列中的节点，减少相邻节点的入度
   * 4. 重复直到队列为空
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 初始化
    for (const moduleId of this.modules.keys()) {
      inDegree.set(moduleId, 0);
      adjacency.set(moduleId, []);
    }

    // 构建图
    for (const [moduleId, module] of this.modules.entries()) {
      for (const dep of module.dependencies) {
        if (dep.type === DependencyType.REQUIRED && this.modules.has(dep.moduleName)) {
          inDegree.set(moduleId, (inDegree.get(moduleId) || 0) + 1);
          adjacency.get(dep.moduleName)!.push(moduleId);
        }
      }
    }

    // Kahn 算法
    const queue: string[] = [];
    for (const [moduleId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(moduleId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 如果结果数量不等于模块数量，说明有循环依赖
    if (result.length !== this.modules.size) {
      console.warn("[ModuleDependencyManager] 检测到循环依赖，拓扑排序不完整");
    }

    return result;
  }

  /**
   * 验证启动配置
   */
  validateStartup(): StartupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. 检测循环依赖
    const cycles = this.detectCircularDependencies();
    if (cycles.length > 0) {
      errors.push(
        `发现 ${cycles.length} 个循环依赖链:`,
        ...cycles.map((cycle, i) => `  ${i + 1}. ${cycle.join(" -> ")}`)
      );
    }

    // 2. 检查缺失的依赖
    for (const [moduleId, module] of this.modules.entries()) {
      for (const dep of module.dependencies) {
        if (dep.type === DependencyType.REQUIRED && !this.modules.has(dep.moduleName)) {
          errors.push(
            `模块 ${moduleId} 依赖缺失: ${dep.moduleName}${dep.description ? ` (${dep.description})` : ""}`
          );
        }
      }
    }

    // 3. 检查层级依赖规则（高层不能依赖低层）
    const layerOrder = [
      ModulePosition.CORE,
      ModulePosition.INFRASTRUCTURE,
      ModulePosition.SERVICE,
      ModulePosition.APPLICATION,
      ModulePosition.PLUGIN,
    ];

    for (const [moduleId, module] of this.modules.entries()) {
      const currentLayerIndex = layerOrder.indexOf(module.position);
      
      for (const dep of module.dependencies) {
        const depModule = this.modules.get(dep.moduleName);
        if (!depModule) continue;

        const depLayerIndex = layerOrder.indexOf(depModule.position);
        
        // 警告：跨层依赖（虽然不禁止，但需要确认）
        if (depLayerIndex < currentLayerIndex - 1) {
          warnings.push(
            `模块 ${moduleId}(${module.position}) 直接依赖 ${depModule.name}(${depModule.position})，跳过了中间层`
          );
        }
      }
    }

    // 4. 计算建议的启动顺序
    const suggestedOrder = this.topologicalSort();

    // 5. 检查启动超时配置
    for (const [moduleId, module] of this.modules.entries()) {
      if (module.startupTimeout && module.startupTimeout < 1000) {
        warnings.push(`模块 ${moduleId} 的启动超时过短: ${module.startupTimeout}ms`);
      }
      if (module.startupTimeout && module.startupTimeout > 60000) {
        warnings.push(`模块 ${moduleId} 的启动超时过长: ${module.startupTimeout}ms`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestedOrder,
      circularDependencies: cycles,
    };
  }

  // ============ 启动序列管理 ============

  private phases: StartupPhase[] = [];

  /**
   * 设置启动阶段配置
   */
  setStartupPhases(phases: StartupPhase[]): void {
    this.phases = phases;
  }

  /**
   * 获取启动阶段配置
   */
  getStartupPhases(): StartupPhase[] {
    return this.phases;
  }

  /**
   * 根据依赖关系自动生成启动阶段
   */
  generateStartupPhases(): StartupPhase[] {
    const layers: Record<ModulePosition, string[]> = {
      [ModulePosition.CORE]: [],
      [ModulePosition.INFRASTRUCTURE]: [],
      [ModulePosition.SERVICE]: [],
      [ModulePosition.APPLICATION]: [],
      [ModulePosition.PLUGIN]: [],
    };

    // 按层级分组
    for (const [moduleId, module] of this.modules.entries()) {
      layers[module.position].push(moduleId);
    }

    // 生成阶段
    const phases: StartupPhase[] = [];
    const phaseNames: Record<ModulePosition, string> = {
      [ModulePosition.CORE]: "核心层",
      [ModulePosition.INFRASTRUCTURE]: "基础设施层",
      [ModulePosition.SERVICE]: "服务层",
      [ModulePosition.APPLICATION]: "应用层",
      [ModulePosition.PLUGIN]: "插件层",
    };

    for (const position of Object.values(ModulePosition)) {
      if (layers[position].length > 0) {
        phases.push({
          name: phaseNames[position],
          modules: layers[position],
          failFast: true,
        });
      }
    }

    return phases;
  }

  /**
   * 验证模块是否可以启动（所有依赖已满足）
   */
  canStartModule(moduleId: string): { canStart: boolean; blockingDeps: string[] } {
    const module = this.modules.get(moduleId);
    if (!module) {
      return { canStart: false, blockingDeps: [] };
    }

    const blockingDeps: string[] = [];

    for (const dep of module.dependencies) {
      if (dep.type !== DependencyType.REQUIRED) {
        continue;
      }

      const depContext = this.startupContexts.get(dep.moduleName);
      
      // 依赖未启动或启动失败
      if (!depContext || depContext.status !== ModuleStatus.STARTED) {
        blockingDeps.push(dep.moduleName);
      }
    }

    return {
      canStart: blockingDeps.length === 0,
      blockingDeps,
    };
  }

  /**
   * 记录模块启动状态
   */
  recordModuleStart(moduleId: string, status: ModuleStatus, error?: string): void {
    const context: ModuleStartupContext = {
      moduleId,
      startedAt: Date.now(),
      status,
      error,
      startupDuration: error ? undefined : Date.now() - (this.startupContexts.get(moduleId)?.startedAt || Date.now()),
    };

    this.startupContexts.set(moduleId, context);
  }

  /**
   * 获取所有模块的启动状态
   */
  getStartupStatus(): Map<string, ModuleStartupContext> {
    return new Map(this.startupContexts);
  }

  /**
   * 生成启动顺序可视化文本
   */
  generateStartupOrderVisualization(): string {
    const lines: string[] = [];
    const cycles = this.detectCircularDependencies();
    const order = this.topologicalSort();

    lines.push("📊 模块启动依赖图");
    lines.push("=" .repeat(60));

    if (cycles.length > 0) {
      lines.push("\n❌ 检测到循环依赖:");
      for (const cycle of cycles) {
        lines.push(`  ${cycle.join(" -> ")}`);
      }
      lines.push("");
    }

    lines.push("\n✅ 建议的启动顺序:");
    for (let i = 0; i < order.length; i++) {
      const module = this.modules.get(order[i]);
      const deps = module?.dependencies.filter(d => d.type === DependencyType.REQUIRED) || [];
      const depStr = deps.length > 0 ? ` [依赖: ${deps.map(d => d.moduleName).join(", ")}]` : "";
      lines.push(`  ${i + 1}. ${order[i]}${depStr}`);
    }

    lines.push("\n📁 按层级分组:");
    const phases = this.generateStartupPhases();
    for (const phase of phases) {
      lines.push(`\n  ${phase.name}:`);
      for (const moduleId of phase.modules) {
        lines.push(`    - ${moduleId}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * 导出依赖关系图（JSON 格式，可用于可视化）
   */
  exportDependencyGraph(): {
    nodes: Array<{ id: string; name: string; position: string }>;
    edges: Array<{ from: string; to: string; type: string }>;
  } {
    const nodes: Array<{ id: string; name: string; position: string }> = [];
    const edges: Array<{ from: string; to: string; type: string }> = [];

    for (const [moduleId, module] of this.modules.entries()) {
      nodes.push({
        id: moduleId,
        name: module.name,
        position: module.position,
      });

      for (const dep of module.dependencies) {
        edges.push({
          from: moduleId,
          to: dep.moduleName,
          type: dep.type,
        });
      }
    }

    return { nodes, edges };
  }
}

// ============ 工具函数 ============

/**
 * 创建模块依赖声明辅助函数
 */
export function createModuleDependency(
  moduleName: string,
  type: DependencyType = DependencyType.REQUIRED,
  description?: string
): ModuleDependency {
  return {
    moduleName,
    type,
    description,
  };
}

/**
 * 创建模块元数据辅助函数
 */
export function createModuleMetadata(
  id: string,
  name: string,
  position: ModulePosition,
  modulePath: string,
  dependencies: ModuleDependency[] = [],
  options?: Partial<ModuleMetadata>
): ModuleMetadata {
  return {
    id,
    name,
    position,
    modulePath,
    dependencies,
    startupTimeout: 30000,
    lazy: false,
    ...options,
  };
}

/**
 * 默认配置路径
 */
export const DEFAULT_MODULE_DEPS_CONFIG_PATH = path.join(
  process.cwd(),
  ".module-deps-config.json"
);
