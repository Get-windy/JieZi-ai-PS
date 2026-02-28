// i18n/index.ts
// 🎯 国际化合并层：合并上游翻译和本地翻译

import { i18n as upstreamI18n, t as upstreamT } from '../ui/src/i18n/index.ts';
import type { Locale } from '../ui/src/i18n/lib/types.ts';

// 导入本地额外翻译（现在先创建空对象，后面再填充）
import zhCNExtra from './locales/zh-CN-extra.js';
import zhTWExtra from './locales/zh-TW-extra.js';
import ptBRExtra from './locales/pt-BR-extra.js';

class LocalizedI18n {
  private locale: Locale = 'en';
  
  // 本地额外翻译（补充上游）
  private extraTranslations: Record<string, any> = {
    'zh-CN': zhCNExtra,
    'zh-TW': zhTWExtra,
    'pt-BR': ptBRExtra,
  };

  async setLocale(locale: Locale) {
    this.locale = locale;
    // 同步上游 i18n
    if (upstreamI18n?.setLocale) {
      await upstreamI18n.setLocale(locale);
    }
  }

  getLocale(): Locale {
    return this.locale;
  }

  t(key: string, params?: Record<string, any>): string {
    // 1. 优先使用本地额外翻译（本地功能的翻译）
    const localTranslation = this.getNestedValue(
      this.extraTranslations[this.locale], 
      key
    );
    if (localTranslation !== undefined) {
      return this.interpolate(localTranslation, params);
    }

    // 2. fallback 到上游翻译
    if (upstreamT) {
      return upstreamT(key, params);
    }

    // 3. 返回 key 本身
    return key;
  }

  private getNestedValue(obj: any, path: string): any {
    if (!obj) return undefined;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current?.[key] === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  private interpolate(text: string, params?: Record<string, any>): string {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (_, key) => params[key] || '');
  }
}

export const i18n = new LocalizedI18n();
export const t = i18n.t.bind(i18n);
export type { Locale };
