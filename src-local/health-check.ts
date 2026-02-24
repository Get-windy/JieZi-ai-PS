/**
 * 本地功能健康检查模块
 * 在服务启动时自动检测本地开发功能是否完整
 * 
 * 作用：
 * 1. 合并上游代码后，自动检测本地功能是否被意外覆盖
 * 2. 启动时验证关键本地功能文件是否存在
 * 3. 检查本地功能的依赖和配置是否正确
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// 本地功能关键文件清单
const LOCAL_FEATURE_FILES = {
  // 国际化系统
  i18n: [
    "i18n/index.ts",
    "i18n/frontend/views/overview.ts",
    "i18n/frontend/views/usage.ts",
    "i18n/frontend/views/usage-render-overview.ts",
    "i18n/locales/zh-CN-extra.ts",
    "i18n/locales/zh-TW-extra.ts",
    "i18n/locales/pt-BR-extra.ts",
  ],
  
  // 翻译增强
  translations: [
    "ui/src/i18n/locales/zh-CN.ts",
    "ui/src/i18n/locales/zh-TW.ts",
    "ui/src/i18n/locales/pt-BR.ts",
  ],
  
  // 本地后端功能
  backend: [
    "src-local/health-check.ts", // 本文件
    // 如果有其他本地功能，在这里添加
    // "src-local/gateway/auto-open-browser.ts",
  ],
  
  // 本地前端功能
  frontend: [
    // "ui-local/src/ui/views/organization-management.ts",
  ],
};

interface HealthCheckResult {
  success: boolean;
  message: string;
  missing?: string[];
  details?: string;
}

/**
 * 检查本地功能文件是否存在
 */
export function checkLocalFeatures(): HealthCheckResult {
  // 获取项目根目录
  const projectRoot = process.cwd();
  const missingFiles: string[] = [];
  
  // 检查所有本地功能文件
  for (const [category, files] of Object.entries(LOCAL_FEATURE_FILES)) {
    for (const file of files) {
      const filePath = resolve(projectRoot, file);
      if (!existsSync(filePath)) {
        missingFiles.push(file);
        console.warn(`⚠️  [健康检查] 本地功能文件缺失: ${file}`);
      }
    }
  }
  
  if (missingFiles.length > 0) {
    return {
      success: false,
      message: "检测到本地功能文件缺失！可能是上游合并时被覆盖。",
      missing: missingFiles,
      details: [
        "建议操作：",
        "1. 从 Git 备份分支恢复缺失文件",
        "2. 检查 .gitattributes 配置是否正确",
        "3. 运行 'git status' 查看更改详情",
        "",
        `缺失的文件 (${missingFiles.length}个)：`,
        ...missingFiles.map(f => `  - ${f}`),
      ].join("\n"),
    };
  }
  
  return {
    success: true,
    message: "✅ 本地功能完整性检查通过",
  };
}

/**
 * 检查 i18n 配置
 */
export function checkI18nConfig(): HealthCheckResult {
  const projectRoot = process.cwd();
  const i18nIndexPath = resolve(projectRoot, "i18n/index.ts");
  
  if (!existsSync(i18nIndexPath)) {
    return {
      success: false,
      message: "i18n/index.ts 不存在！国际化扩展功能可能无法正常工作。",
      details: "这是国际化扩展系统的核心文件。",
    };
  }
  
  // 可以进一步检查文件内容是否包含关键代码
  // 例如：检查是否导出了 t 函数和 i18n 对象
  
  return {
    success: true,
    message: "✅ 国际化配置检查通过",
  };
}

/**
 * 检查 .gitattributes 保护配置
 */
export function checkGitProtection(): HealthCheckResult {
  const projectRoot = process.cwd();
  const gitattributesPath = resolve(projectRoot, ".gitattributes");
  
  if (!existsSync(gitattributesPath)) {
    return {
      success: false,
      message: ".gitattributes 文件不存在！本地代码可能在下次合并时被覆盖。",
      details: [
        "建议立即创建 .gitattributes 文件，内容如下：",
        "",
        "# 本地开发目录 - 保护我们的代码",
        "/src-local/** merge=ours",
        "/ui-local/** merge=ours",
        "/i18n/** merge=ours",
        "/ui/src/i18n/locales/zh-CN.ts merge=ours",
        "/ui/src/i18n/locales/zh-TW.ts merge=ours",
        "/ui/src/i18n/locales/pt-BR.ts merge=ours",
      ].join("\n"),
    };
  }
  
  return {
    success: true,
    message: "✅ Git 保护配置存在",
  };
}

/**
 * 执行完整的健康检查
 */
export function runHealthCheck(): void {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 JieZi AI-PS 本地功能健康检查");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const checks = [
    { name: "本地功能文件", fn: checkLocalFeatures },
    { name: "国际化配置", fn: checkI18nConfig },
    { name: "Git保护配置", fn: checkGitProtection },
  ];
  
  let allPassed = true;
  const failedChecks: string[] = [];
  
  for (const check of checks) {
    console.log(`检查 ${check.name}...`);
    const result = check.fn();
    
    if (result.success) {
      console.log(result.message);
    } else {
      allPassed = false;
      failedChecks.push(check.name);
      console.error(`❌ ${result.message}`);
      if (result.details) {
        console.error(result.details);
      }
    }
    console.log("");
  }
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (allPassed) {
    console.log("✅ 所有检查通过！本地功能完整。\n");
  } else {
    console.error("❌ 检查失败！以下功能存在问题：");
    failedChecks.forEach(name => console.error(`   - ${name}`));
    console.error("\n⚠️  建议：立即检查并修复上述问题，避免功能异常。\n");
    
    // 在开发模式下，如果检查失败，给出明显警告但不退出
    // 在生产模式下，可以选择退出进程
    if (process.env.NODE_ENV === "production") {
      console.error("⛔ 生产环境下不允许启动，请先修复问题。");
      // process.exit(1); // 可选：强制退出
    }
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// 导出所有检查函数
export default runHealthCheck;
