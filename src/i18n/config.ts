import { parseLanguageTag } from "./utils.js";

export const SUPPORTED_LANGUAGES = {
  en: "English",
  "zh-CN": "中文(简体)",
} as const;

// 在 Windows 中文环境下默认使用中文
export const DEFAULT_LANGUAGE = "zh-CN";

function detectSystemLanguage(): string {
  if (process.env.LANG) {
    return parseLanguageTag(process.env.LANG);
  }

  if (process.env.LANGUAGE) {
    return parseLanguageTag(process.env.LANGUAGE);
  }

  if (process.env.LC_ALL) {
    return parseLanguageTag(process.env.LC_ALL);
  }

  if (process.env.LC_MESSAGES) {
    return parseLanguageTag(process.env.LC_MESSAGES);
  }

  // 尝试使用Intl API检测系统语言
  if (typeof Intl !== "undefined" && "DateTimeFormat" in Intl) {
    const language = Intl.DateTimeFormat().resolvedOptions().locale;
    const parsed = parseLanguageTag(language);
    // 检测到中文相关的locale，统一返回 zh-CN
    if (parsed === "zh" || language.toLowerCase().startsWith("zh")) {
      return "zh-CN";
    }
    return parsed;
  }

  return DEFAULT_LANGUAGE;
}

// 缓存检测到的语言，避免重复检测
let cachedLanguage: keyof typeof SUPPORTED_LANGUAGES | null = null;

export function getLanguage(): keyof typeof SUPPORTED_LANGUAGES {
  // 返回缓存的语言
  if (cachedLanguage) {
    return cachedLanguage;
  }

  // 优先使用环境变量设置的语言
  const envLanguage = process.env.OPENCLAW_LANGUAGE;
  if (envLanguage) {
    const parsed = parseLanguageTag(envLanguage);
    if (parsed in SUPPORTED_LANGUAGES) {
      cachedLanguage = parsed as keyof typeof SUPPORTED_LANGUAGES;
      return cachedLanguage;
    }
  }

  // 检测系统语言
  try {
    const systemLanguage = detectSystemLanguage();
    if (systemLanguage in SUPPORTED_LANGUAGES) {
      cachedLanguage = systemLanguage as keyof typeof SUPPORTED_LANGUAGES;
      return cachedLanguage;
    }
  } catch (err) {
    // 如果检测失败，使用默认语言
    console.warn("[i18n] Failed to detect system language:", err);
  }

  cachedLanguage = DEFAULT_LANGUAGE;
  return cachedLanguage;
}
