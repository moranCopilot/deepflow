/**
 * 配置辅助函数
 * 用于 Vercel serverless functions 环境
 * 统一管理环境变量读取，支持 VUE_APP_ / VITE_ 前缀兼容
 */

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function pickEnv(keys: string[]): { value: string; source?: string } {
  for (const key of keys) {
    const value = normalizeEnvValue(process.env[key]);
    if (value) return { value, source: key };
  }
  return { value: '' };
}

/**
 * 获取 Gemini API Key
 * 优先级：GEMINI_API_KEY > VUE_APP_GEMINI_API_KEY
 */
export function getGeminiApiKey(): string {
  return pickEnv(['GEMINI_API_KEY', 'VUE_APP_GEMINI_API_KEY', 'VITE_GEMINI_API_KEY']).value;
}

/**
 * 获取豆包 API 配置
 * 优先级：DOUBAO_* > VUE_APP_DOUBAO_*
 */
export function getDoubaoConfig() {
  const apiKey = pickEnv(['DOUBAO_API_KEY', 'VUE_APP_DOUBAO_API_KEY', 'VITE_DOUBAO_API_KEY']);
  const secretKey = pickEnv(['DOUBAO_SECRET_KEY', 'VUE_APP_DOUBAO_SECRET_KEY', 'VITE_DOUBAO_SECRET_KEY']);
  const appId = pickEnv(['DOUBAO_APP_ID', 'VUE_APP_DOUBAO_APP_ID', 'VITE_DOUBAO_APP_ID']);
  const baseUrl =
    pickEnv([
      'DOUBAO_API_BASE_URL',
      'VUE_APP_DOUBAO_API_BASE_URL',
      'VITE_DOUBAO_API_BASE_URL'
    ]).value || 'https://openspeech.bytedance.com';

  return {
    apiKey: apiKey.value,
    secretKey: secretKey.value,
    appId: appId.value,
    baseUrl,
  };
}

/**
 * 检查豆包 API 是否已配置
 */
export function isDoubaoConfigured(): boolean {
  const config = getDoubaoConfig();
  return !!(config.apiKey && config.secretKey && config.appId);
}

/**
 * 获取 ListenHub (MarsWave) API 配置
 * 优先级：LISTENHUB_API_KEY > MARSWAVE_API_KEY
 */
export function getListenHubConfig() {
  const apiKey = pickEnv([
    // Preferred (server-only) names
    'LISTENHUB_API_KEY',
    'MARSWAVE_API_KEY',
    // Common alternates
    'LISTENHUB_KEY',
    'MARSWAVE_KEY',
    'LISTENHUB_API_TOKEN',
    'MARSWAVE_API_TOKEN',
    'LISTENHUB_TOKEN',
    'MARSWAVE_TOKEN',
    // Legacy / compatibility (avoid using these for secrets in client code)
    'VUE_APP_LISTENHUB_API_KEY',
    'VUE_APP_MARSWAVE_API_KEY',
    'VITE_LISTENHUB_API_KEY',
    'VITE_MARSWAVE_API_KEY'
  ]);

  const baseUrl =
    pickEnv([
      'LISTENHUB_API_BASE_URL',
      'MARSWAVE_API_BASE_URL',
      'VUE_APP_LISTENHUB_API_BASE_URL',
      'VUE_APP_MARSWAVE_API_BASE_URL',
      'VITE_LISTENHUB_API_BASE_URL',
      'VITE_MARSWAVE_API_BASE_URL'
    ]).value || 'https://api.marswave.ai/openapi/v1';

  return {
    apiKey: apiKey.value,
    baseUrl
  };
}

export function getListenHubConfigDiagnostics(): {
  apiKeyConfigured: boolean;
  apiKeySource: string | null;
  baseUrl: string;
} {
  const apiKey = pickEnv([
    'LISTENHUB_API_KEY',
    'MARSWAVE_API_KEY',
    'LISTENHUB_KEY',
    'MARSWAVE_KEY',
    'LISTENHUB_API_TOKEN',
    'MARSWAVE_API_TOKEN',
    'LISTENHUB_TOKEN',
    'MARSWAVE_TOKEN',
    'VUE_APP_LISTENHUB_API_KEY',
    'VUE_APP_MARSWAVE_API_KEY',
    'VITE_LISTENHUB_API_KEY',
    'VITE_MARSWAVE_API_KEY'
  ]);

  const baseUrl =
    pickEnv([
      'LISTENHUB_API_BASE_URL',
      'MARSWAVE_API_BASE_URL',
      'VUE_APP_LISTENHUB_API_BASE_URL',
      'VUE_APP_MARSWAVE_API_BASE_URL',
      'VITE_LISTENHUB_API_BASE_URL',
      'VITE_MARSWAVE_API_BASE_URL'
    ]).value || 'https://api.marswave.ai/openapi/v1';

  return {
    apiKeyConfigured: !!apiKey.value,
    apiKeySource: apiKey.source || null,
    baseUrl
  };
}

/**
 * 检查 ListenHub API 是否已配置
 */
export function isListenHubConfigured(): boolean {
  return !!getListenHubConfig().apiKey;
}
