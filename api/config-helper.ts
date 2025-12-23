/**
 * 配置辅助函数
 * 用于 Vercel serverless functions 环境
 * 统一管理环境变量读取，支持 VUE_APP_ 前缀兼容
 */

/**
 * 获取 Gemini API Key
 * 优先级：GEMINI_API_KEY > VUE_APP_GEMINI_API_KEY
 */
export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.VUE_APP_GEMINI_API_KEY || '';
}

/**
 * 获取豆包 API 配置
 * 优先级：DOUBAO_* > VUE_APP_DOUBAO_*
 */
export function getDoubaoConfig() {
  return {
    apiKey: process.env.DOUBAO_API_KEY || process.env.VUE_APP_DOUBAO_API_KEY || '',
    secretKey: process.env.DOUBAO_SECRET_KEY || process.env.VUE_APP_DOUBAO_SECRET_KEY || '',
    appId: process.env.DOUBAO_APP_ID || process.env.VUE_APP_DOUBAO_APP_ID || '',
    baseUrl: process.env.DOUBAO_API_BASE_URL || process.env.VUE_APP_DOUBAO_API_BASE_URL || 'https://openspeech.bytedance.com',
  };
}

/**
 * 检查豆包 API 是否已配置
 */
export function isDoubaoConfigured(): boolean {
  const config = getDoubaoConfig();
  return !!(config.apiKey && config.secretKey && config.appId);
}

