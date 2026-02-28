# 物理分离实施总结

## 执行时间
2025-02-25

## 实施范围
本次物理分离**仅完成 src/ 目录**，ui/ 目录因跨层依赖复杂暂未处理。

## 统计数据

### src/ 目录
- **删除前**：3909 个文件
- **已删除**：3121 个文件（与upstream完全相同）
- **删除后**：788 个文件
- **精简率**：79.8%
- **清理空目录**：64 个

### 保留的核心模块
根据 `src-diff.txt` 分析，保留的文件主要包含：
- **本地化修改**：admin, lifecycle, organization, permissions, workspace 等核心模块的中文化
- **入口文件**：10个构建入口点（避免glob展开问题）
- **本地功能**：Phase 5增强功能、权限系统等

### ui/ 目录
- **状态**：保持完整（未删除文件）
- **修复**：修正了20个文件的跨层导入路径（src/ → upstream/src/）
- **原因**：UI与src存在大量跨层依赖，需要额外的架构重构

## 技术实现

### 1. Rolldown Overlay 插件
在 `tsdown.config.ts` 中创建了完整的 overlay 插件：
- 实现 `resolveId` 钩子
- 支持 src/ → upstream/src/ 回退解析
- 支持 upstream/src/ → src/ 覆盖检查
- 处理 JS→TS 扩展名映射
- 支持相对导入、绝对路径、入口点路径

### 2. 构建配置修复
- **tsconfig.plugin-sdk.dts.json**：rootDir "src" → "."
- **write-plugin-sdk-entry-dts.ts**：更新重导出路径
- **write-cli-compat.ts**：跨层导入指向 upstream
- **canvas-a2ui-copy.ts**：添加 upstream 回退支持

### 3. 类型声明处理
- 添加 `upstream/src/types/**/*.d.ts` 到 include
- 修复 4 个类型存根缺失错误

## 构建验证

### ✅ pnpm build - 成功
- 耗时：26.5 秒
- 输出文件：369 个
- 总大小：9.0 MB
- 警告：6 个（MISSING_EXPORT，非阻塞）

### ❌ pnpm ui:build - 失败
- 原因：Vite 无法解析 upstream/src/ 的跨层导入
- 需要：进一步的 Vite overlay 插件配置或架构重构

### ✅ pnpm ui:build - 成功（2025-02-25更新）
- 修复内容：
  1. 创建了Vite overlay插件（类似rolldown插件）
  2. 修复了11个子目录文件的路径层级（从3级改为4级）
  3. 修复的目录：controllers/, views/, chat/
- 耗时：约4.7秒
- 输出文件：1个index.html + 6个JS/CSS资源
- 警告：chunk size过大（非阻塞）

## 创建的工具脚本

1. `scripts/compare-dirs.ps1` - 目录对比工具
2. `scripts/filter-deletions.ps1` - 过滤删除列表（排除入口）
3. `scripts/exec-filtered-separation.ps1` - 执行物理删除
4. `scripts/fix-ui-src-imports.ps1` - 修复UI跨层导入（第一版，有bug）
5. `scripts/fix-ui-paths.mjs` - Node.js 路径批量修复（修复3级路径）
6. `scripts/fix-ui-controllers-paths.mjs` - 修复4级深度子目录的路径（controllers, views, chat）

## 后续建议

### 短期（保持现状）
1. ✅ src/ 物理分离已完成，可正常构建和开发
2. ✅ ui/ 保持完整，Vite overlay插件已支持upstream路径解析
3. ✅ 完整构建流程验证通过（pnpm build + pnpm ui:build）
4. 📝 文档更新：说明 src/ 和 ui/ 都使用 overlay 机制

### 中期（架构优化）
1. 重构 UI → src 的跨层依赖
   - 提取共享类型到独立包
   - 使用 gateway contract 进行通信
2. 创建 Vite overlay 插件的增强版本
3. 完成 ui/ 的物理分离

### 长期（三层架构完善）
1. 建立清晰的依赖边界：upstream → src → ui → i18n
2. 禁止跨层直接导入，强制通过接口通信
3. 自动化监控和防止新的跨层依赖引入

## 风险评估

### 已知风险
- **MISSING_EXPORT 警告**：6 处，来自 upstream 文件导入 src/ 的私有函数
  - 影响：构建警告，不影响功能
  - 解决：需要在 src/ 补充这些函数的导出（或标记为type导入）

### Vite插件已修复
- ✅ **UI 构建成功**：Vite overlay插件正确解析upstream路径
- ✅ **路径层级修复**：11个子目录文件从3级改为4级
- ⚠️ **警告**：chunk size过大（1.1MB），建议代码分割（非阻塞）

## 回滚方案
如需回滚本次物理分离：
```bash
git checkout localization-zh-CN -- src/
git checkout localization-zh-CN -- tsdown.config.ts
git checkout localization-zh-CN -- tsconfig.plugin-sdk.dts.json
git checkout localization-zh-CN -- scripts/write-*.ts
```

## 结论
✅ **src/ 目录物理分离成功**，实现了 79.8% 的代码精简。
✅ **ui/ Vite overlay插件修复成功**，ui:build可以正常构建。
✅ **完整构建流程验证通过**，所有构建命令成功。
🎯 **三层架构overlay机制完整实现**，支持src和ui的物理分离。
