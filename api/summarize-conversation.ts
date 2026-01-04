import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey } from './config-helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "Server API Key not configured" });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  // Helper for retry logic
  const generateWithRetry = async (prompt: string, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await model.generateContent(prompt);
      } catch (error: any) {
        const isRateLimit = error.status === 429 || 
                          error.message?.includes('429') || 
                          error.message?.includes('quota') ||
                          error.message?.includes('Too Many Requests');
        
        if (i < maxRetries - 1 && isRateLimit) {
          // Exponential backoff: 5s, 10s, 15s
          const delay = 5000 * (i + 1);
          console.log(`[Gemini] Rate limit hit (429). Retrying in ${delay/1000}s... (Attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  };

  try {
    const { conversationHistory } = req.body;

    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return res.status(400).json({ error: "conversationHistory is required and must be a non-empty array" });
    }

    // 构建对话文本
    const conversationText = conversationHistory.map((entry: { source: string; text: string }) => {
      const speaker = entry.source === 'input' ? '用户' : 'AI';
      return `${speaker}: ${entry.text}`;
    }).join('\n');

    const prompt = `你是一位学习助手。请基于以下对话生成一张知识卡片，严格遵循知识卡片格式规范。

对话内容：
${conversationText}

【知识卡片格式规范 - 必须严格遵循】
1. 内容要求：
- 只提取具体事实性内容（不要全局评论、一般性总结或框架级描述）
- 每张卡片只聚焦一个概念
- 解释必须简洁、事实性
2. 格式结构：
- type: 固定为 "knowledgeCard"
- title: 概念名称（简洁明了，如“虚拟语气”“勾股定理”）
- content: 具体的事实性解释，必须包含：
  * 核心定义或要点
  * 关键细节、数字、日期等具体信息（如适用）
  * 来源标记（必须包含 "Source: 实时对话"）
- tags: 相关标签数组（如 ["英语", "语法"]）
3. 示例格式：
{
  "type": "knowledgeCard",
  "title": "虚拟语气",
  "content": "用于表达假设、愿望或与事实相反的情况。正确用法：If I were you...（如果我是你）。错误用法：If I was you...。Source: 实时对话",
  "tags": ["英语", "语法", "虚拟语气"]
}

请直接返回 JSON，不要包含其他文字。`;

    console.log("Generating conversation summary...");
    
    const result = await generateWithRetry(prompt);
    const response = await result.response;
    const text = response.text();

    // 解析 JSON 响应
    let summaryData: any;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[0]);
      } else {
        summaryData = JSON.parse(text);
      }
    } catch (parseError) {
      console.error("Failed to parse summary response:", parseError);
      console.log("Raw response:", text);
      // 如果解析失败，创建一个默认的总结内容
        summaryData = {
          type: "knowledgeCard",
          title: "对话知识点",
          content: conversationHistory.length > 0 
            ? `从最近 ${conversationHistory.length} 轮对话中提取的知识点尚不明确。Source: 实时对话`
            : "暂无可提取的知识点。Source: 实时对话",
          tags: ["对话", "知识点"]
        };
    }

    // 确保返回格式正确
    if (!summaryData.type) {
      summaryData.type = "knowledgeCard";
    }
    if (!summaryData.title) {
      summaryData.title = "对话知识点";
    }
    if (!summaryData.content) {
      summaryData.content = "暂无可提取的知识点。Source: 实时对话";
    }
    if (!summaryData.tags || !Array.isArray(summaryData.tags)) {
      summaryData.tags = ["对话", "知识点"];
    }

    res.json({
      type: summaryData.type,
      title: summaryData.title,
      content: summaryData.content,
      tags: summaryData.tags
    });

  } catch (error: any) {
    console.error("Conversation summary generation error:", error);
    res.status(500).json({ 
      error: error.message || "对话总结失败",
      details: error.toString()
    });
  }
}
