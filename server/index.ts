import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as googleTTS from 'google-tts-api';
import axios from 'axios';
import { promptManager } from './prompts/index.js';
import { config } from './config.js';

import { createServer } from 'http';
import net from 'net';
import liveSessionRouter from './live-session.js';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WordExtractor = require('word-extractor');

// Configure global proxy for all HTTP/HTTPS requests
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  console.log(`🔌 Detected proxy configuration: ${proxyUrl}`);
  
  // Configure global-agent for http/https modules (used by axios, etc.)
  try {
    const { bootstrap } = require('global-agent');
    if (!process.env.GLOBAL_AGENT_HTTP_PROXY && process.env.HTTP_PROXY) {
        process.env.GLOBAL_AGENT_HTTP_PROXY = process.env.HTTP_PROXY;
    }
    if (!process.env.GLOBAL_AGENT_HTTPS_PROXY && process.env.HTTPS_PROXY) {
        process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.HTTPS_PROXY;
    }
    bootstrap();
    console.log(`✅ global-agent configured`);
  } catch (e: any) {
    console.warn(`⚠️  Failed to load global-agent: ${e.message}`);
  }
  
  // Configure undici (Node.js 18+ fetch) to use proxy - FORCE override
  try {
    const { ProxyAgent, setGlobalDispatcher, fetch: undiciFetch } = require('undici');
    
    // Create ProxyAgent with extended timeout
    const proxyAgent = new ProxyAgent({
        uri: proxyUrl,
        connect: {
            timeout: 60000
        }
    });
    
    // 1. Set as global dispatcher
    setGlobalDispatcher(proxyAgent);
    
    // 2. Force override global fetch (Crucial for some environments)
    // @ts-ignore
    global.fetch = (input, init) => {
        return undiciFetch(input, {
            ...init,
            dispatcher: proxyAgent
        });
    };
    
    console.log(`✅ Undici proxy configured & global.fetch overridden: ${proxyUrl}`);
    
    // 3. Test connection immediately
    undiciFetch('https://generativelanguage.googleapis.com', { dispatcher: proxyAgent, method: 'HEAD' })
        .then(() => console.log('✅ Proxy connection test successful (Google API reachable)'))
        .catch((e: any) => console.warn(`⚠️  Proxy connection test failed: ${e.message}`));
        
  } catch (e: any) {
    console.warn(`⚠️  Could not configure undici proxy: ${e.message}`);
  }
} else {
    console.log("ℹ️  No proxy configuration detected. If you are in China, please set HTTPS_PROXY in .env or .env.local");
}

const app = express();
const port = Number(config.port);

// Global error handling to prevent crash
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

// Create HTTP server
const server = createServer(app);

// Serve static files
app.use('/audio', express.static('public/audio'));

// Configure CORS
app.use(cors());
app.use(express.json());

// Mount Live Session API
app.use('/api/live-session', liveSessionRouter);

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini
// Config loaded from config.ts
const apiKey = config.geminiApiKey;

const genAI = new GoogleGenerativeAI(apiKey || '');
const fileManager = new GoogleAIFileManager(apiKey || '');
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// Helper to wait for file to be processed
async function waitForFileActive(name: string) {
  let file = await fileManager.getFile(name);
  while (file.state === "PROCESSING") {
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await fileManager.getFile(name);
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`File ${file.name} failed to process`);
  }
  return file;
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DeepFlow Server is running' });
});

// TTS Endpoint - 支持异步任务模式和 ListenHub API
app.post('/api/tts', async (req, res): Promise<any> => {
    // 设置较长的超时时间（5 分钟）
    req.setTimeout(300000);
    res.setTimeout(300000);

    const { script, text, preset, contentType } = req.body;

    let normalizedScript: Array<{ speaker: string; text: string }> | null =
        Array.isArray(script)
            ? script
                  .map((line: any) => ({
                      speaker: typeof line?.speaker === 'string' ? line.speaker : '',
                      text: typeof line?.text === 'string' ? line.text : (typeof line?.content === 'string' ? line.content : '')
                  }))
                  .filter((line: { speaker: string; text: string }) => line.text.trim().length > 0)
            : null;

    // 验证输入
    if (!normalizedScript || normalizedScript.length === 0) {
        // Backward compatibility: allow `{ text: string }` payload
        if (typeof text === 'string' && text.trim().length > 0) {
            normalizedScript = [{ speaker: '', text }];
        } else {
        return res.status(400).json({
            error: "Script is required and must be a non-empty array with non-empty 'text' fields"
        });
        }
    }

    // 验证 script 格式
    const isValidScript = normalizedScript.every((item: any) =>
        item && typeof item.speaker === 'string' && typeof item.text === 'string'
    );
    if (!isValidScript) {
        return res.status(400).json({ error: "Invalid script format. Each item must have 'speaker' and 'text' fields" });
    }

    try {
        // 导入任务管理（使用动态导入避免在 Vercel 环境中的问题）
        const { generateTaskId, createTask } = await import('./tts-task-manager.js');
        const { processTTSAsync } = await import('./tts-processor.js');

        // 创建任务
        const taskId = generateTaskId();
        createTask(taskId);

        // 异步处理（不等待完成）
        processTTSAsync(taskId, normalizedScript as any, preset || '', contentType || '').catch((err) => {
            console.error(`Task ${taskId} processing error:`, err);
        });

        // 立即返回任务 ID
        return res.json({
            taskId,
            status: 'pending',
            message: 'Task created, use GET /api/tts?taskId=' + taskId + ' to check status'
        });
    } catch (error: any) {
        console.error("TTS Task Creation Error:", error);
        return res.status(500).json({ error: error.message || "Failed to create TTS task" });
    }
});

// TTS 任务状态查询端点
app.get('/api/tts', async (req, res): Promise<any> => {
    const { taskId } = req.query;
    
    if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: 'taskId is required' });
    }

    try {
        const { getTask } = await import('./tts-task-manager.js');
        const task = getTask(taskId);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        return res.json({
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            result: task.result,
            error: task.error
        });
    } catch (error: any) {
        console.error("TTS Task Query Error:", error);
        return res.status(500).json({ error: error.message || "Failed to query TTS task" });
    }
});

// Conversation Summary Endpoint
app.post('/api/summarize-conversation', async (req, res): Promise<any> => {
    const { conversationHistory } = req.body;

    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
        return res.status(400).json({ error: "conversationHistory is required and must be a non-empty array" });
    }

    const apiKey = config.geminiApiKey;
    if (!apiKey) {
        return res.status(500).json({ error: "Server API Key not configured" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const summaryModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Helper for retry logic
    const generateWithRetry = async (prompt: string, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await summaryModel.generateContent(prompt);
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
            summaryData = {
                type: "knowledgeCard",
                title: "对话知识点",
                content: conversationHistory.length > 0 
                    ? `从最近 ${conversationHistory.length} 轮对话中提取的知识点尚不明确。Source: 实时对话`
                    : "暂无可提取的知识点。Source: 实时对话",
                tags: ["对话", "知识点"]
            };
        }

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

        return res.json({
            type: summaryData.type,
            title: summaryData.title,
            content: summaryData.content,
            tags: summaryData.tags
        });
    } catch (error: any) {
        console.error("Conversation summary generation error:", error);
        return res.status(500).json({ 
            error: error.message || "对话总结失败",
            details: error.toString()
        });
    }
});

// Review Endpoint
app.post('/api/review', async (req, res): Promise<any> => {
    const { items, knowledgeCards } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items are required" });
    }

    const apiKey = config.geminiApiKey;
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
        
        const result = await generateWithRetry(prompt);
        const response = await result.response;
        const text = response.text();

        // 解析 JSON 响应
        let reviewData: any;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                reviewData = JSON.parse(jsonMatch[0]);
            } else {
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
                        text: text.substring(0, 500)
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
});

// Audio Proxy Endpoint
app.get('/api/proxy-audio', async (req, res): Promise<any> => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).send("Missing url parameter");
    }

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://translate.google.com/',
                'Accept': '*/*',
            },
            timeout: 30000 // 30 seconds timeout
        });

        res.set('Content-Type', 'audio/mpeg');
        // Forward the content length if available
        if (response.headers['content-length']) {
            res.set('Content-Length', response.headers['content-length']);
        }
        
        response.data.pipe(res);
    } catch (error: any) {
        console.error("Proxy Error details:", {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            url: url
        });
        
        if (!res.headersSent) {
            res.status(500).send(`Failed to fetch audio: ${error.message}`);
        }
    }
});

// Analyze endpoint
app.post('/api/analyze', upload.array('files'), async (req, res): Promise<any> => {
  if (!apiKey) {
    return res.status(500).json({ error: "Server API Key not configured" });
  }

  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    console.log(`Received ${files.length} files for analysis...`);
    const uploadResponses = [];

    // 1. Upload files to Gemini
    const processedFiles = [];
    for (const file of files) {
      // Fix filename encoding (Multer often messes up UTF-8 filenames)
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      console.log(`Processing ${originalName} (${file.mimetype})...`);
      
      // Handle Word Documents (.doc, .docx)
      if (
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
          console.log(`Converting Word document ${originalName} to text...`);
          try {
             let textContent = '';

             // Check if it's .doc (binary) or .docx (XML/Zip)
             // Using mimetype is unreliable, check extension or try both
             const isDocx = originalName.toLowerCase().endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
             
             if (isDocx) {
                // Use mammoth for .docx
                const result = await mammoth.extractRawText({ path: file.path });
                textContent = result.value;
             } else {
                // Use word-extractor for .doc
                const extractor = new WordExtractor();
                const extracted = await extractor.extract(file.path);
                textContent = extracted.getBody();
             }
             
             if (!textContent) {
                throw new Error('No text content extracted from document');
             }

             // Create a temporary text file
             const txtPath = file.path + '.txt';
             fs.writeFileSync(txtPath, textContent);
             
             // Upload the TEXT file instead
             try {
               const uploadResponse = await fileManager.uploadFile(txtPath, {
                  mimeType: 'text/plain',
                  displayName: originalName + '.txt',
               });
               
               console.log(`Uploaded converted text for ${originalName} as ${uploadResponse.file.name}`);
               uploadResponses.push(uploadResponse);
               
               // Clean up
               fs.unlinkSync(txtPath);
               fs.unlinkSync(file.path);
               continue; // Skip standard upload
             } catch (uploadError: any) {
               // Clean up on error
               if (fs.existsSync(txtPath)) {
                 fs.unlinkSync(txtPath);
               }
               if (fs.existsSync(file.path)) {
                 fs.unlinkSync(file.path);
               }
               
               // Check if it's a network error
               const errorMessage = uploadError?.message || String(uploadError);
               if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
                 throw new Error(`无法连接到 Google API 服务器。请检查：\n1. 网络连接是否正常\n2. 是否需要配置代理（如果在中国大陆）\n3. API Key 是否有效\n\n原始错误: ${errorMessage}`);
               }
               throw uploadError;
             }

          } catch (conversionError) {
              console.error(`Failed to convert ${originalName}:`, conversionError);
              
              // Clean up the original file since we failed
              fs.unlinkSync(file.path);

              // Throw error to stop processing this request or just skip this file?
              // Better to inform frontend, but for now let's skip this file and let others proceed if any.
              // OR throw to fail the whole request as the user expects this file to be analyzed.
              throw new Error(`Failed to process Word document: ${originalName}. Please ensure it is a valid .doc or .docx file.`);
          }
      }

      // Standard Upload for supported types (PDF, Image, Audio, Video)
      // Use the fixed originalName for display
      try {
        const uploadResponse = await fileManager.uploadFile(file.path, {
          mimeType: file.mimetype,
          displayName: originalName,
        });
        
        console.log(`Uploaded ${originalName} as ${uploadResponse.file.name}`);
        uploadResponses.push(uploadResponse);

        // Clean up local file immediately after upload
        fs.unlinkSync(file.path);
      } catch (uploadError: any) {
        // Clean up local file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
        // Check if it's a network error
        const errorMessage = uploadError?.message || String(uploadError);
        if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
          throw new Error(`无法连接到 Google API 服务器。请检查：\n1. 网络连接是否正常\n2. 是否需要配置代理（如果在中国大陆）\n3. API Key 是否有效\n\n原始错误: ${errorMessage}`);
        }
        throw uploadError;
      }
    }

    // 2. Wait for processing
    console.log("Waiting for files to be processed...");
    for (const response of uploadResponses) {
      await waitForFileActive(response.file.name);
    }
    console.log("All files ready.");

    // 3. Generate Content
    const fileParts = uploadResponses.map(response => ({
      fileData: {
        mimeType: response.file.mimeType,
        fileUri: response.file.uri,
      },
    }));

    // Calculate context for prompt selection
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    const types = [...new Set(files.map(file => file.mimetype))];
    
    const fileStats = {
        totalSize,
        fileCount: files.length,
        types
    };

    let preferences;
    try {
        if (req.body.preferences) {
            preferences = JSON.parse(req.body.preferences);
            console.log("Using user preferences:", preferences);
        }
    } catch (e) {
        console.warn("Failed to parse preferences:", e);
    }

    const promptTemplate = promptManager.getBestMatch({
        fileStats,
        preferences
    });

    console.log(`Selected prompt template: ${promptTemplate.name} (${promptTemplate.id})`);

    const prompt = promptTemplate.generate({
        fileStats,
        preferences
    });

    console.log("Generating content (streaming)...");
    
    try {
        const result = await model.generateContentStream([
            prompt,
            ...fileParts
        ]);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(chunkText);
        }
        res.end();
        console.log("Stream generation complete.");
    } catch (streamError) {
        console.error("Stream generation failed:", streamError);
        // If we haven't sent headers yet, send JSON error
        if (!res.headersSent) {
            throw streamError;
        } else {
            // If headers sent, we can't send JSON error. 
            // End the stream with a specific error marker if needed, or just end it.
            // For now, just end. The client will fail to parse JSON.
            res.end();
        }
    }

  } catch (error: any) {
    console.error("Error processing request:", error);
    const errorMessage = error?.message || String(error) || "Internal Server Error";
    
    // Provide more helpful error messages
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes('无法连接到 Google API')) {
      userFriendlyMessage = errorMessage;
    } else if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout')) {
      userFriendlyMessage = `网络连接失败：无法访问 Google API 服务器。\n\n可能的原因：\n1. 网络连接问题\n2. 需要配置代理（如果在中国大陆）\n3. 防火墙阻止了连接\n\n原始错误: ${errorMessage}`;
    }
    
    res.status(500).json({ error: userFriendlyMessage });
  }
});

function checkPortInUse(targetPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(targetPort);
  });
}

server.on('error', (err: any) => {
  if (err && err.code === 'EADDRINUSE') {
    console.warn(`⚠️  Port ${port} is already in use. A server instance may already be running.`);
    console.warn(`   This process will exit gracefully without crashing.`);
    try {
      server.close();
    } catch {}
    process.exit(0);
  } else {
    console.error('Server error:', err);
  }
});

(async () => {
  const inUse = await checkPortInUse(port);
  if (inUse) {
    console.warn(`⚠️  Detected existing server at http://localhost:${port}. Skipping new start.`);
    process.exit(0);
    return;
  }
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`API Key configured: ${!!apiKey}`);
  });
})();
