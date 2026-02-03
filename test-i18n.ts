// 测试i18n功能
import { t } from './src/i18n/index.js';

// 测试英文翻译
process.env.OPENCLAW_LANGUAGE = 'en';
console.log('英文测试：');
console.log('标题:', t('cli.banner.title'));
console.log('默认标语:', t('tagline.default'));
console.log('标语1:', t('tagline.1'));

// 测试中文翻译
process.env.OPENCLAW_LANGUAGE = 'zh-CN';
console.log('\n中文测试：');
console.log('标题:', t('cli.banner.title'));
console.log('默认标语:', t('tagline.default'));
console.log('标语1:', t('tagline.1'));