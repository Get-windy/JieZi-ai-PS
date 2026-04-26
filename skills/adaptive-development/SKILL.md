# AI开发规则 - 项目结构自适应

## 🎯 核心原则

**你是AI开发者，每次开发新项目时：**
1. **先分析现有项目结构**
2. **遵循该项目的规范**
3. **不要把自己的习惯强加给项目**
4. **不要改变项目结构**

---

## 📋 第一步：分析项目结构

### 开始开发前必须执行

```bash
# 1. 查看项目整体结构
tree -L 3 -I 'node_modules|.git'

# 2. 查看根目录文件
ls -la

# 3. 查看源代码目录
ls -la src/ 2>/dev/null || echo "没有src目录"

# 4. 查看是否有tests目录
ls -la tests/ 2>/dev/null || ls -la test/ 2>/dev/null || echo "没有tests目录"

# 5. 查看package.json（如果有）
cat package.json | head -30

# 6. 查看是否有规则文件
cat CLAUDE.md 2>/dev/null
cat .cursorrules 2>/dev/null
cat CONTRIBUTING.md 2>/dev/null
```

### 分析结果记录

根据观察，回答以下问题：

```
1. 这个项目使用什么目录结构？
   □ 标准结构（src/, tests/, docs/）
   □ 扁平结构（所有代码在根目录）
   □ 模块化结构（modules/, packages/）
   □ Monorepo结构（apps/, packages/）
   □ 其他：_______________

2. 代码文件放在哪里？
   □ src/
   □ lib/
   □ app/
   □ 根目录
   □ 其他：_______________

3. 测试文件放在哪里？
   □ tests/
   □ test/
   □ __tests__/
   □ 和源码一起
   □ 其他：_______________

4. 配置文件在哪里？
   □ 根目录
   □ src/config/
   □ config/
   □ 其他：_______________

5. 文档在哪里？
   □ docs/
   □ 根目录
   □ wiki/
   □ 没有文档
   □ 其他：_______________

6. 使用什么包管理器？
   □ npm
   □ pnpm
   □ yarn
   □ 其他：_______________

7. 使用什么构建工具？
   □ webpack
   □ vite
   □ rollup
   □ 没有构建工具
   □ 其他：_______________
```

---

## 📁 第二步：遵循项目规范

### 根据分析结果，创建文件时遵循该项目的习惯

#### 场景1：标准结构项目

如果项目使用 `src/` + `tests/` 结构：

```bash
# ✅ 正确：遵循项目结构
# 创建服务
mkdir -p src/services
touch src/services/user-service.ts

# 创建测试
mkdir -p tests/unit/services
touch tests/unit/services/user-service.test.ts

# 创建文档
mkdir -p docs/api
touch docs/api/users.md
```

#### 场景2：扁平结构项目

如果项目所有代码都在根目录：

```bash
# ✅ 正确：遵循项目结构（即使是扁平的）
touch user-service.ts
touch user-service.test.ts
touch utils.ts
touch config.json
```

#### 场景3：模块化项目

如果项目使用模块目录结构：

```bash
# ✅ 正确：按模块组织
mkdir -p modules/user
touch modules/user/service.ts
touch modules/user/types.ts
touch modules/user/service.test.ts

mkdir -p modules/order
touch modules/order/service.ts
touch modules/order/types.ts
```

#### 场景4：Monorepo项目

如果项目使用 apps/ + packages/ 结构：

```bash
# ✅ 正确：区分应用和包
# 添加功能到特定应用
mkdir -p apps/web/src/services
touch apps/web/src/services/user-service.ts

# 创建共享包
mkdir -p packages/user-sdk
touch packages/user-sdk/src/index.ts
touch packages/user-sdk/src/types.ts
```

---

## 🔍 第三步：识别项目约定

### 从现有代码学习项目规范

#### 1. 查看现有文件是怎么命名的

```bash
# 查看文件命名风格
ls src/services/

# 可能的结果：
# kebab-case: user-service.ts, order-service.ts  ← 使用这种
# camelCase:  userService.ts, orderService.ts    ← 使用这种
# snake_case: user_service.ts, order_service.ts  ← 使用这种
# PascalCase: UserService.ts, OrderService.ts    ← 使用这种
```

#### 2. 查看导入路径是怎么写的

```bash
# 查看现有代码的导入方式
grep -r "import.*from" src/ | head -10

# 可能的结果：
# 相对路径: import { User } from '../types/user'
# 绝对路径: import { User } from '@/types/user'
# 包路径:   import { User } from '@types/user'
```

#### 3. 查看代码风格

```bash
# 查看现有代码的写法
cat src/services/*.ts | head -50

# 注意：
# - 使用 class 还是 function？
# - 使用 async/await 还是 Promise？
# - 使用 TypeScript 还是 JavaScript？
# - 导出方式：default 还是 named？
```

#### 4. 查看测试写法

```bash
# 查看测试文件的写法
cat tests/unit/services/*.test.ts | head -50

# 注意：
# - 使用 describe/it 还是 test？
# - 使用 expect 还是 assert？
# - 测试文件命名：*.test.ts 还是 *.spec.ts？
```

---

## ✅ 第四步：创建符合项目规范的文件

### 根据学习到的项目约定创建新文件

#### 示例：假设你分析后发现

```
项目名称：电商平台
目录结构：src/ + tests/
文件命名：kebab-case（user-service.ts）
导入方式：相对路径
代码风格：TypeScript + class + async/await
测试框架：Vitest + describe/it
```

#### 那么你应该这样创建：

```bash
# 1. 创建服务（遵循 kebab-case）
mkdir -p src/services
touch src/services/product-service.ts

# 2. 编写代码（使用 class + async/await）
cat > src/services/product-service.ts << 'EOF'
import { Product } from '../types/product';
import { Database } from '../utils/database';

export class ProductService {
  async findById(id: string): Promise<Product | null> {
    return await Database.query('SELECT * FROM products WHERE id = ?', [id]);
  }

  async create(data: CreateProductInput): Promise<Product> {
    return await Database.query(
      'INSERT INTO products (name, price) VALUES (?, ?)',
      [data.name, data.price]
    );
  }
}
EOF

# 3. 创建测试（使用相同的命名风格）
mkdir -p tests/unit/services
touch tests/unit/services/product-service.test.ts

# 4. 编写测试（遵循项目的测试风格）
cat > tests/unit/services/product-service.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { ProductService } from '../../../src/services/product-service';

describe('ProductService', () => {
  it('should find product by id', async () => {
    const service = new ProductService();
    const product = await service.findById('123');
    expect(product).toBeDefined();
  });

  it('should create new product', async () => {
    const service = new ProductService();
    const product = await service.create({
      name: 'Test Product',
      price: 99.99
    });
    expect(product.name).toBe('Test Product');
  });
});
EOF
```

---

## 🚫 绝对禁止的行为

### ❌ 不要这样做

```bash
# ❌ 禁止：不管项目结构，按自己的习惯创建目录
mkdir my-services     # 不要创建自己的顶级目录！
mkdir my-tests        # 不要！
mkdir docs            # 如果项目已经有 docs/，不要创建新的！

# ❌ 禁止：改变项目的命名约定
# 项目用 kebab-case，你不要用 camelCase
touch src/services/userService.ts    # 错误！应该用 user-service.ts

# ❌ 禁止：混用不同的风格
# 项目用 class，你不要用 function
function createUserService() { }    # 错误！项目使用 class

# ❌ 禁止：改变导入方式
# 项目用相对路径，你不要用别名
import { User } from '@/types/user'  # 错误！项目用 '../types/user'

# ❌ 禁止：创建不必要的目录
mkdir -p src/core/entities  # 如果项目很简单，不要过度设计！
```

---

## 📝 自适应规则清单

### 每次开发前检查

- [ ] **已分析项目结构**（运行 tree 或 ls）
- [ ] **已识别目录组织方式**（标准/扁平/模块/monorepo）
- [ ] **已确认代码位置**（src/ 或根目录或其他）
- [ ] **已确认测试位置**（tests/ 或 __tests__/ 或其他）
- [ ] **已学习文件命名风格**（kebab/camel/snake/Pascal）
- [ ] **已学习导入方式**（相对/绝对/别名）
- [ ] **已学习代码风格**（class/function/其他）
- [ ] **已学习测试风格**（describe/test/其他）
- [ ] **遵循项目现有约定**（不引入自己的习惯）

---

## 🎯 常见项目类型快速参考

### 类型1：Node.js Web应用

```
典型结构：
├── src/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   ├── routes/
│   └── middleware/
├── tests/
├── config/
└── package.json

遵循：
- 创建 service → src/services/xxx-service.ts
- 创建 controller → src/controllers/xxx-controller.ts
- 创建测试 → tests/unit/services/xxx-service.test.ts
```

### 类型2：前端React/Vue应用

```
典型结构：
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   └── styles/
├── tests/
└── package.json

遵循：
- 创建组件 → src/components/xxx-component.tsx
- 创建页面 → src/pages/xxx-page.tsx
- 创建hook → src/hooks/use-xxx.ts
- 创建测试 → tests/components/xxx-component.test.tsx
```

### 类型3：CLI工具

```
典型结构：
├── src/
│   ├── commands/
│   ├── utils/
│   └── types/
├── bin/
└── package.json

遵循：
- 创建命令 → src/commands/xxx-command.ts
- 创建工具 → src/utils/xxx-utils.ts
- 创建类型 → src/types/xxx-types.ts
```

### 类型4：库/SDK

```
典型结构：
├── src/
│   ├── core/
│   ├── services/
│   └── types/
├── tests/
└── package.json

遵循：
- 创建核心功能 → src/core/xxx.ts
- 创建服务 → src/services/xxx-service.ts
- 创建类型 → src/types/xxx.ts
- 创建测试 → tests/unit/xxx.test.ts
```

### 类型5：Python项目

```
典型结构：
├── src/
│   └── package_name/
│       ├── __init__.py
│       ├── models.py
│       ├── services.py
│       └── utils.py
├── tests/
│   └── test_services.py
└── pyproject.toml

遵循：
- 创建模块 → src/package_name/xxx.py
- 创建测试 → tests/test_xxx.py
- 使用 snake_case 命名
```

---

## 💡 最佳实践

### 1. 尊重现有项目

```bash
# ✅ 好的做法：观察并学习
ls -la                    # 查看项目结构
cat package.json          # 了解配置
ls src/services/          # 查看现有服务
# 然后遵循相同的模式创建

# ❌ 坏的做法：强行改变
mkdir my-way              # 不要！
touch README.md           # 如果已有，不要覆盖！
```

### 2. 保持一致性

```bash
# 查看项目其他部分是怎么写的
cat src/services/user-service.ts

# 使用相同的：
# - 命名风格
# - 导入方式
# - 导出方式
# - 代码组织
```

### 3. 询问用户

```
如果你不确定，应该：
1. 问用户："这个项目使用什么目录结构？"
2. 问用户："文件应该放在哪里？"
3. 问用户："使用什么命名约定？"

不要假设，要询问！
```

---

## 📌 总结

### 核心原则

1. **先观察，后行动** - 分析项目结构再创建文件
2. **入乡随俗** - 遵循项目的现有约定
3. **保持一致** - 和项目其他部分使用相同风格
4. **不要强加** - 不要把自己的习惯强加给项目
5. **不确定就问** - 不要假设，询问用户

### 工作流

```
1. 分析项目结构
   ↓
2. 识别约定和风格
   ↓
3. 确认文件应该放哪里
   ↓
4. 创建符合项目规范的文件
   ↓
5. 验证是否一致
```

**记住：没有"最好的"结构，只有"最适合这个项目的"结构！**
