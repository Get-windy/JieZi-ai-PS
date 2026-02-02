export function parseLanguageTag(tag: string): string {
  // 移除标签中的任何变体信息
  tag = tag.replace(/[-_].*$/, '');
  
  // 转换为小写
  tag = tag.toLowerCase();
  
  // 处理语言映射
  const languageMap: Record<string, string> = {
    'zh': 'zh-CN',  // 默认将中文映射到简体中文
    'en': 'en',
  };
  
  return languageMap[tag] || tag;
}