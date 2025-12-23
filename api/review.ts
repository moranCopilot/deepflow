import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey } from './config-helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "Server API Key not configured" });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  try {
    const { items, knowledgeCards } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items are required" });
    }

    // 构建复盘 Prompt
    const itemsText = items.map((item: any) => `
- ${item.title}（播放进度：${item.playbackProgress?.progressPercentage || 0}%）
  内容摘要：${item.content}
  ${item.dialogueContent ? `对话内容：${item.dialogueContent.map((d: any) => `${d.speaker}: ${d.text}`).join('\n')}` : ''}
`).join('\n');

    const knowledgeCardsText = knowledgeCards && knowledgeCards.length > 0
      ? knowledgeCards.map((card: any) => `
- ${card.title}：${card.content}
`).join('\n')
      : '暂无重点知识点';

    const prompt = `你是一位学习助手，需要基于用户今天的学习内容生成一份"今日复盘"总结。

用户今天学习了以下内容：
${itemsText}

重点知识点：
${knowledgeCardsText}

请生成一份对话式的复盘总结，包括：
1. 今天学习内容的简要回顾
2. 学习进度和完成情况
3. 重点知识点的强化记忆
4. 学习建议和下一步行动

格式要求：
- 使用对话式语言，speaker 为 "AI"
- 语言自然流畅，适合音频播放
- 时长控制在5-10分钟
- 返回 JSON 格式：
{
  "title": "今日复盘标题",
  "summary": "简要摘要",
  "script": [
    {"speaker": "AI", "text": "第一段内容"},
    {"speaker": "AI", "text": "第二段内容"}
  ]
}`;

    console.log("Generating review content...");
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 解析 JSON 响应
    let reviewData: any;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewData = JSON.parse(jsonMatch[0]);
      } else {
        // 如果没有找到 JSON，尝试解析整个文本
        reviewData = JSON.parse(text);
      }
    } catch (parseError) {
      console.error("Failed to parse review response:", parseError);
      console.log("Raw response:", text);
      // 如果解析失败，创建一个默认的复盘内容
      reviewData = {
        title: "今日复盘",
        summary: "基于你今天的学习内容生成的复盘总结",
        script: [
          {
            speaker: "AI",
            text: "今天你学习了多个内容，让我们来回顾一下。"
          },
          {
            speaker: "AI",
            text: text.substring(0, 500) // 使用原始响应的前500字符
          }
        ]
      };
    }

    // 确保返回格式正确
    if (!reviewData.script || !Array.isArray(reviewData.script)) {
      reviewData.script = [
        {
          speaker: "AI",
          text: reviewData.summary || "今日学习复盘总结"
        }
      ];
    }

    res.json({
      title: reviewData.title || "今日复盘",
      summary: reviewData.summary || "基于你今天的学习内容生成的复盘总结",
      script: reviewData.script
    });

  } catch (error: any) {
    console.error("Review generation error:", error);
    res.status(500).json({ 
      error: error.message || "复盘生成失败",
      details: error.toString()
    });
  }
}

