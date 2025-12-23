import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as googleTTS from 'google-tts-api';
import { getDoubaoConfig, isDoubaoConfigured } from './config-helper.js';

// 注意：Vercel serverless functions 不支持直接导入 server/ 目录下的模块
// 如果需要使用豆包API，需要将调用逻辑内联或使用其他方式
// 这里暂时保持Google TTS作为fallback，实际部署时可以考虑使用edge functions或外部服务

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body - Vercel may not auto-parse JSON
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { text, script, preset, contentType } = body || {};
  
  // 判断使用哪个API
  const isQuickSummary = preset === 'quick_summary' || contentType === 'output';
  const isDeepAnalysis = preset === 'deep_analysis' || contentType === 'discussion';
  const useDoubao = isDoubaoConfigured() && (isQuickSummary || isDeepAnalysis);
  
  try {
    if (useDoubao) {
      // TODO: 在Vercel环境中实现豆包API调用
      // 由于Vercel serverless functions的限制，可能需要：
      // 1. 使用edge functions
      // 2. 调用外部API服务
      // 3. 或使用Vercel的serverless function调用本地server
      
      // 临时fallback到Google TTS
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      const urls = googleTTS.getAllAudioUrls(text, {
        lang: 'zh-CN',
        slow: false,
        host: 'https://translate.google.com',
      });
      res.json({ urls });
    } else {
      // 向后兼容：使用Google TTS（多片段）
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      const urls = googleTTS.getAllAudioUrls(text, {
        lang: 'zh-CN',
        slow: false,
        host: 'https://translate.google.com',
      });
      res.json({ urls });
    }
  } catch (error: any) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: error.message || "TTS failed" });
  }
}

