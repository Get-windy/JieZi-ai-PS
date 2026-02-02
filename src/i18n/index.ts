import { DEFAULT_LANGUAGE, getLanguage, SUPPORTED_LANGUAGES } from './config.js';
import { translations } from './translations.js';
import type { TranslationKey, Translations } from './types.js';

export function t(key: TranslationKey, options: Record<string, unknown> = {}): string {
  const language = getLanguage();
  
  let translation = translations[language]?.[key] || translations[DEFAULT_LANGUAGE][key];
  
  // 如果没有找到翻译，返回键名
  if (!translation) {
    return key;
  }
  
  // 替换模板变量
  Object.entries(options).forEach(([key, value]) => {
    translation = translation!.replace(new RegExp(`\{${key}\}`, 'g'), String(value));
  });
  
  return translation;
}

export function getSupportedLanguages(): string[] {
  return Object.keys(SUPPORTED_LANGUAGES);
}

export function isLanguageSupported(language: string): boolean {
  return getSupportedLanguages().includes(language);
}

export { DEFAULT_LANGUAGE, getLanguage, SUPPORTED_LANGUAGES } from './config.js';
export type { TranslationKey, Translations } from './types.js';