// Lit 模块类型声明
// 这个文件用于解决 TypeScript 找不到 lit 模块类型的问题
declare module "lit" {
  export * from "lit/index.js";
}

declare module "lit/decorators.js" {
  export * from "lit/decorators";
}

declare module "lit/directives/class-map.js" {
  export * from "lit/directives/class-map";
}

declare module "lit/directives/style-map.js" {
  export * from "lit/directives/style-map";
}

declare module "lit/directives/repeat.js" {
  export * from "lit/directives/repeat";
}

declare module "lit/directives/until.js" {
  export * from "lit/directives/until";
}

declare module "lit/directives/when.js" {
  export * from "lit/directives/when";
}

declare module "lit/directives/ref.js" {
  export * from "lit/directives/ref";
}
