import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as googleTTS from 'google-tts-api';

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

  const { text } = body || {};
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const urls = googleTTS.getAllAudioUrls(text, {
      lang: 'zh-CN',
      slow: false,
      host: 'https://translate.google.com',
    });
    res.json({ urls });
  } catch (error: any) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: error.message || "TTS failed" });
  }
}

