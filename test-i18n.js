// 测试i18n功能
import { t, getLanguage } from './src/i18n/index.js';

console.log('当前语言:', getLanguage());
console.log('标题翻译:', t('cli.banner.title'));
console.log('默认标语:', t('tagline.default'));
console.log('第一条标语:', t('tagline.0'));

// 测试环境变量设置
process.env.OPENCLAW_LANGUAGE = 'zh-CN';

// 重新导入以应用环境变量
import('./src/i18n/index.js').then((i18n) => {
  console.log('\n设置环境变量后:');
  console.log('当前语言:', i18n.getLanguage());
  console.log('标题翻译:', i18n.t('cli.banner.title'));
  console.log('默认标语:', i18n.t('tagline.default'));
  console.log('第一条标语:', i18n.t('tagline.0'));
});