import express from 'express';
import { WebSocket } from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

const router = express.Router();
const GEMINI_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Session storage
interface Session {
  geminiWs: WebSocket | null;
  audioQueue: Array<{ data: string; timestamp: number }>;
  isActive: boolean;
  script: string;
  knowledgeCards: any[];
  pendingKnowledgeCards: KnowledgeCard[];
  transcriptHistory: Array<{ source: 'input' | 'output'; text: string; timestamp: number }>;
  pendingPrintIntent: ReturnType<typeof setTimeout> | null;
  printIntentCounter: number;
  lastFunctionCallAt: number | null;
  lastPrintIntentAt: number | null;
  lastFallbackAt: number | null;
  hasSentInitialPrompt: boolean;
}

const sessions = new Map<string, Session>();

// Track accumulated text for each session to handle streaming responses
const sessionTextBuffers = new Map<string, string>();

type KnowledgeCard = {
  type: 'knowledgeCard';
  title: string;
  content: string;
  tags: string[];
  source?: 'ai_realtime_fallback';
};

type FunctionCall = {
  id?: string;
  name?: string;
  args?: any;
};

const PRINT_KEYWORDS = ['已为你整理', '打印', '知识卡片', '知识小票', 'print job', 'printing', 'print'];
const PRINT_FALLBACK_DELAY_MS = 5200;

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function hasPrintKeyword(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }
  return PRINT_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function addTranscriptEntry(
  session: Session,
  source: 'input' | 'output',
  text: string
) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  if (!session.transcriptHistory) {
    session.transcriptHistory = [];
  }
  session.transcriptHistory.push({
    source,
    text: normalized,
    timestamp: Date.now()
  });
  if (session.transcriptHistory.length > 20) {
    session.transcriptHistory = session.transcriptHistory.slice(-20);
  }
}

function getLatestTranscript(session: Session, source: 'input' | 'output'): string | null {
  if (!session.transcriptHistory || session.transcriptHistory.length === 0) {
    return null;
  }
  for (let index = session.transcriptHistory.length - 1; index >= 0; index -= 1) {
    if (session.transcriptHistory[index].source === source) {
      return session.transcriptHistory[index].text;
    }
  }
  return null;
}

let fallbackModel: any = null;

function ensureSourceTag(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return 'Source: 实时对话';
  }
  return trimmed.includes('Source: 实时对话') ? trimmed : `${trimmed} Source: 实时对话`;
}

function buildKnowledgeCardFromGenerated(
  raw: any,
  fallbackText: string
): KnowledgeCard {
  const titleCandidate = typeof raw?.title === 'string' ? raw.title.trim() : '';
  const contentCandidate = typeof raw?.content === 'string' ? raw.content.trim() : '';
  const tagsCandidate = Array.isArray(raw?.tags) ? raw.tags : [];

  const title = titleCandidate || '知识要点';
  const contentBase = contentCandidate || fallbackText || '暂无明确知识点，记录当前对话要点。';
  const content = ensureSourceTag(contentBase);
  const tags = tagsCandidate
    .filter((tag: unknown) => typeof tag === 'string' && tag.trim().length > 0)
    .slice(0, 5);

  return {
    type: 'knowledgeCard',
    title,
    content: content.length > 220 ? `${content.slice(0, 220)}...` : content,
    tags: tags.length > 0 ? tags : ['对话', '要点']
  };
}

function sendInitialPromptIfNeeded(sessionId: string, geminiWs: WebSocket) {
  const session = sessions.get(sessionId);
  if (!session || session.hasSentInitialPrompt) {
    return;
  }
  session.hasSentInitialPrompt = true;
  const initialPrompt = '请直接开始实时练习并说第一句话，不要询问我是否准备好。';
  geminiWs.send(JSON.stringify({
    client_content: {
      turns: [{
        role: 'user',
        parts: [{ text: initialPrompt }]
      }],
      turn_complete: true
    }
  }));
}

async function generateKnowledgeCardFromTranscript(
  session: Session,
  fallbackText: string
): Promise<KnowledgeCard> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const card = buildKnowledgeCardFromGenerated(null, fallbackText);
    card.source = 'ai_realtime_fallback';
    return card;
  }

  if (!fallbackModel) {
    const genAI = new GoogleGenerativeAI(apiKey);
    fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  const history = session.transcriptHistory || [];
  const recent = history.slice(-12);
  const conversationText = recent
    .map((entry) => `${entry.source === 'input' ? '用户' : 'AI'}: ${entry.text}`)
    .join('\n');

  const prompt = `你是一位学习助手。请从以下实时对话中提取一个明确、具体的知识点，生成一张知识小票。

对话：
${conversationText || fallbackText}

要求：
1. 只提取具体事实性知识点（概念/定义/公式/关键方法）
2. 一张卡片只包含一个概念
3. title 简短（<=20字）
4. content 简洁（<=200字），必须包含 “Source: 实时对话”
5. 输出 JSON，格式：
{
  "title": "知识点标题",
  "content": "知识点内容... Source: 实时对话",
  "tags": ["标签1", "标签2"]
}
只输出 JSON，不要额外文字。`;

  try {
    const result = await fallbackModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    const card = buildKnowledgeCardFromGenerated(parsed, fallbackText);
    card.source = 'ai_realtime_fallback';
    return card;
  } catch (error) {
    const card = buildKnowledgeCardFromGenerated(null, fallbackText);
    card.source = 'ai_realtime_fallback';
    return card;
  }
}

function schedulePrintFallback(
  sessionId: string,
  session: Session,
  res: any,
  triggerText: string
) {
  if (!hasPrintKeyword(triggerText)) {
    return;
  }

  const now = Date.now();
  session.lastPrintIntentAt = now;
  session.printIntentCounter = (session.printIntentCounter ?? 0) + 1;
  const intentId = session.printIntentCounter;

  if (session.pendingPrintIntent) {
    clearTimeout(session.pendingPrintIntent);
    session.pendingPrintIntent = null;
  }

  session.pendingPrintIntent = setTimeout(() => {
    const currentSession = sessions.get(sessionId);
    if (!currentSession) {
      return;
    }
    if (currentSession.printIntentCounter !== intentId) {
      return;
    }
    if (currentSession.lastFunctionCallAt && currentSession.lastFunctionCallAt >= now) {
      return;
    }
    if (currentSession.lastFallbackAt && Date.now() - currentSession.lastFallbackAt < 3000) {
      return;
    }

    const outputText = getLatestTranscript(currentSession, 'output') || triggerText;
    const trimmed = outputText.trim();
    if (!trimmed) {
      return;
    }

    void (async () => {
      if (currentSession.lastFunctionCallAt && currentSession.lastFunctionCallAt >= now) {
        return;
      }
      currentSession.lastFallbackAt = Date.now();
      const knowledgeCard = await generateKnowledgeCardFromTranscript(currentSession, trimmed);
      const sent = trySendKnowledgeCard(sessionId, currentSession, res, knowledgeCard);
      if (!sent) {
        console.warn(`[${sessionId}] Print intent fallback queued`);
      } else {
        console.warn(`[${sessionId}] Print intent fallback triggered`);
      }
    })();
  }, PRINT_FALLBACK_DELAY_MS);
}

function extractFunctionCalls(message: any): FunctionCall[] {
  const calls: FunctionCall[] = [];

  const pushCall = (call: any) => {
    if (call && (call.name || call.functionName)) {
      calls.push({
        id: call.id,
        name: call.name || call.functionName,
        args: call.args ?? call.arguments ?? call.params
      });
    }
  };

  if (Array.isArray(message?.toolCall?.functionCalls)) {
    message.toolCall.functionCalls.forEach((call: any) => pushCall(call));
  }

  if (message?.serverContent?.modelTurn?.functionCall) {
    pushCall(message.serverContent.modelTurn.functionCall);
  }

  if (Array.isArray(message?.serverContent?.modelTurn?.parts)) {
    message.serverContent.modelTurn.parts.forEach((part: any) => {
      if (part?.functionCall) {
        pushCall(part.functionCall);
      }
    });
  }

  if (Array.isArray(message?.candidates)) {
    message.candidates.forEach((candidate: any) => {
      if (Array.isArray(candidate?.content?.parts)) {
        candidate.content.parts.forEach((part: any) => {
          if (part?.functionCall) {
            pushCall(part.functionCall);
          }
        });
      }
    });
  }

  return calls;
}

function normalizeArgsObject(raw: any): { content?: string; type?: string } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const content = raw.content ?? raw.text ?? raw.note ?? raw.value;
  const type = raw.type ?? raw.category ?? raw.kind;
  return {
    content: typeof content === 'string' ? content.trim() : content != null ? String(content).trim() : undefined,
    type: typeof type === 'string' ? type.trim() : undefined
  };
}

function parseFunctionArgs(raw: any): { content?: string; type?: string } | null {
  if (raw == null) {
    return null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const jsonCandidates = [trimmed];
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch && jsonMatch[0] !== trimmed) {
      jsonCandidates.push(jsonMatch[0]);
    }

    for (const candidate of jsonCandidates) {
      try {
        const parsed = JSON.parse(candidate);
        const normalized = normalizeArgsObject(parsed);
        if (normalized) {
          return normalized;
        }
      } catch {
        // ignore
      }
    }

    const contentMatch = trimmed.match(/content\s*[:=]\s*["']?([\s\S]*?)["']?(?:,|$)/i);
    const typeMatch = trimmed.match(/type\s*[:=]\s*["']?([a-zA-Z_-]+)["']?/i);
    if (contentMatch) {
      return {
        content: contentMatch[1].trim(),
        type: typeMatch?.[1]?.trim()
      };
    }

    return { content: trimmed };
  }

  return normalizeArgsObject(raw);
}

function buildKnowledgeCard(content: string, type?: string): KnowledgeCard {
  const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'fact';
  const typeKey = normalizedType === 'formula' || normalizedType === 'definition' || normalizedType === 'summary'
    ? normalizedType
    : 'fact';
  const titleMap: Record<string, string> = {
    formula: '数学公式',
    definition: '核心定义',
    fact: '知识点',
    summary: '精彩摘要'
  };
  const tagsMap: Record<string, string[]> = {
    formula: ['数学', '公式'],
    definition: ['定义'],
    fact: ['知识点'],
    summary: ['摘要']
  };
  const normalizedContent = content.includes('Source: 实时对话')
    ? content
    : `${content} Source: 实时对话`;

  return {
    type: 'knowledgeCard',
    title: titleMap[typeKey],
    content: normalizedContent,
    tags: tagsMap[typeKey]
  };
}

function enqueueKnowledgeCard(session: Session, card: KnowledgeCard) {
  if (!session.pendingKnowledgeCards) {
    session.pendingKnowledgeCards = [];
  }
  session.pendingKnowledgeCards.push(card);
}

function trySendKnowledgeCard(sessionId: string, session: Session, res: any, card: KnowledgeCard): boolean {
  if (res.writableEnded || res.destroyed) {
    enqueueKnowledgeCard(session, card);
    return false;
  }
  try {
    res.write(`data: ${JSON.stringify({ type: 'knowledgeCard', card })}\n\n`);
    return true;
  } catch (writeError) {
    console.error(`[${sessionId}] Failed to write knowledge card SSE data:`, writeError);
    enqueueKnowledgeCard(session, card);
    return false;
  }
}

function flushPendingKnowledgeCards(sessionId: string, session: Session, res: any) {
  if (!session.pendingKnowledgeCards || session.pendingKnowledgeCards.length === 0) {
    return;
  }
  const pending = [...session.pendingKnowledgeCards];
  session.pendingKnowledgeCards = [];
  for (let index = 0; index < pending.length; index += 1) {
    const card = pending[index];
    const sent = trySendKnowledgeCard(sessionId, session, res, card);
    if (!sent) {
      session.pendingKnowledgeCards = [card, ...pending.slice(index + 1)];
      break;
    }
  }
}

// Cleanup old sessions (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (!session.isActive && now - (session.audioQueue[0]?.timestamp || 0) > 5 * 60 * 1000) {
      if (session.geminiWs) {
        session.geminiWs.close();
      }
      sessions.delete(sessionId);
    }
  }
}, 60000); // Cleanup every minute

function getGeminiApiKey(): string {
  return config.geminiApiKey;
}

function createGeminiConnection(sessionId: string, script: string, knowledgeCards: any[], modelName: string = "models/gemini-2.5-flash-native-audio-preview-12-2025"): WebSocket {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const targetUrl = `${GEMINI_URL}?key=${apiKey}`;
  const geminiWs = new WebSocket(targetUrl);

  geminiWs.on('open', () => {
    console.log(`[${sessionId}] Connected to Gemini Live API`);
    
    // Send setup message
    // Using latest native audio model: gemini-2.5-flash-native-audio-preview-12-2025
    // Fallback to gemini-2.0-flash-exp if this model is not available
    const setupMsg = {
      setup: {
        model: modelName,
        // Tools should be at setup level, not in generation_config
        tools: [{
          function_declarations: [{
            name: "autoPrintNote",
            description: "当检测到用户犹豫或重要知识点时，自动生成知识卡片以便打印保存。在调用此函数前，请通过自然语言告知用户。",
            parameters: {
              type: "OBJECT",
              description: "当检测到重要的公式、定义或核心知识点时，自动打印一张知识小票。",
              properties: {
                content: {
                  type: "STRING",
                  description: "要打印的知识内容（如数学公式、化学方程式或核心定义）。"
                },
                type: {
                  type: "STRING",
                  enum: ["formula", "summary", "definition", "fact"],
                  description: "知识的类别。"
                }
              },
              required: ["content", "type"]
            }
          }]
        }],
        tool_config: {
          function_calling_config: {
            mode: "AUTO",
            allowed_function_names: ["autoPrintNote"]
          }
        },
        generation_config: {
          response_modalities: ["AUDIO"], // Audio mode for voice responses
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: "Aoede"
              }
            }
          }
        },
        system_instruction: {
          parts: [
            { text: `你是一位亲切友好的AI导师，正在帮助用户进行学习练习。请使用中文进行对话，偶尔可以包含英文单词或短语。使用自然、亲切的语调，就像一位耐心的老师在与学生交流。

【重要】在实时对话模式下，请完全基于当前对话内容生成知识卡片，不要使用预生成的知识卡片。

以下是练习脚本：
${script}

【用户犹豫检测规则】
当检测到以下情况时，判定用户处于犹豫状态，需要生成知识卡片：
1. 用户沉默超过 3 秒钟（无语音输入）
2. 说话卡壳，伴随口癖：
   - "呃..."、"啊..."、"嗯..."、"那个..."
   - 重复性表达："这个...这个..."、"就是...就是..."
   - 长时间停顿："...（停顿）..."
3. 困惑性表达：
   - "我不太明白"、"什么意思"、"没听懂"
   - "这个怎么..."、"为什么..."
4. 重复询问相同问题

【重要内容判定规则】
当对话中出现以下内容时，判定为重要知识点，需要生成知识卡片：
1. 关键概念、公式、定义
2. 易混淆的知识点对比
3. 需要强调的重点内容
4. 常见错误或易错点

【知识卡片生成流程】
1. 检测到用户犹豫或重要内容时，立即生成知识卡片
2. 在生成知识卡片的同时，通过自然语言进行引导
3. 引导话术示例（必须自然融入对话）：
   - "我注意到你可能需要一些帮助，已为您生成知识总结，可打印保存以便复习巩固。"
   - "这个知识点很重要，我已经为你整理好了，可以打印出来方便复习。"
   - "让我为你总结一下这个要点，已生成知识卡片，可打印保存。"
4. 引导话术应自然、友好，不要显得机械

【知识卡片格式规范 - 严格遵循全局格式要求】
知识卡片格式必须严格遵循全局知识小票生成的格式规范：

1. **内容要求**：
   - Extract ONLY specific factual content（只提取具体事实性内容）
   - DO NOT include global comments, general summaries, or framework-level descriptions（不要包含全局评论、一般性总结或框架级描述）
   - Focus on ONE concept per card（每张卡片聚焦一个概念）
   - A concise factual explanation（简洁的事实性解释，避免冗长段落）

2. **格式结构**：
   - title: 概念名称（简洁明了，如 "虚拟语气"、"勾股定理"）
   - content: 具体的事实性解释，必须包含：
     * 核心定义或要点
     * 关键细节、数字、日期等具体信息（如果适用）
     * 来源标记（在实时对话中标记为 "Source: 实时对话"）
   - tags: 相关标签数组（如 ["英语", "语法", "错题"]）

3. **示例格式**：
   {
     "type": "knowledgeCard",
     "title": "虚拟语气",
     "content": "用于表达假设、愿望或与事实相反的情况。正确用法：If I were you...（如果我是你）。错误用法：If I was you...。Source: 实时对话",
     "tags": ["英语", "语法", "虚拟语气"]
   }

4. **注意事项**：
   - 避免抽象描述，聚焦具体事实
   - 每张卡片只包含一个核心概念
   - 内容简洁，控制在合理长度内
   - 必须包含来源标记

【知识卡片生成方式 - 使用函数调用】
当检测到用户犹豫或重要内容时，请调用 autoPrintNote 函数生成知识卡片。
只要你在对话中提到“打印 / 知识卡片 / 知识小票 / print”，必须同步调用 autoPrintNote。

函数参数说明：
- content: 要打印的知识内容（如数学公式、化学方程式或核心定义），内容必须简洁明了，适合小票尺寸
- type: 知识的类别，可选值：formula（数学公式）、definition（核心定义）、fact（知识点）、summary（精彩摘要）

调用函数前，请通过自然语言告知用户，例如：
- "我注意到你可能需要一些帮助，让我为你生成知识总结，可打印保存以便复习巩固。"
- "这个知识点很重要，让我为你整理一下，可以打印出来方便复习。"
- "让我为你总结一下这个要点，已生成知识卡片，可打印保存。"

注意：
- 必须在调用函数前或后通过语音告知用户
- 引导话术应自然、友好，不要显得机械
- content 参数应包含核心知识点，简洁明了，避免冗长
- 根据内容类型选择合适的 type 值

请进行自然的中文对话，鼓励学习者，但要及时纠正错误。回答要简洁明了，避免冗长。使用亲切、温和的女声语调，让对话更加自然流畅。` }
          ]
        }
      }
    };
    geminiWs.send(JSON.stringify(setupMsg));
    sendInitialPromptIfNeeded(sessionId, geminiWs);
  });

  geminiWs.on('error', (err) => {
    console.error(`[${sessionId}] Gemini WebSocket Error:`, err);
  });

  geminiWs.on('close', (code, reason) => {
    const reasonStr = reason.toString();
    
    // Check if it's a model-related error
    if (code === 400 && (reasonStr.includes('model') || reasonStr.includes('invalid'))) {
      console.warn(`[${sessionId}] Model ${modelName} may not be available, consider using fallback model`);
    }
    
    const session = sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.geminiWs = null;
    }
  });

  return geminiWs;
}

// Handler
router.all('/', async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || req.body?.sessionId;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    
    // Check if API key is configured
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      res.status(500).json({ error: '实时练习服务未配置 API Key，请联系管理员。' });
      return;
    }

    // GET: SSE stream for receiving audio
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.write(':ok\n\n');

      // Get or create session
      let session = sessions.get(sessionId);
      if (!session) {
        // Instead of 404, we can send an error via SSE and close
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found. Please initialize with POST first.' })}\n\n`);
        res.end();
        return;
      }

      session.isActive = true;

      // Set up Gemini WebSocket message handler
      const handleGeminiMessage = (data: Buffer) => {
        try {
          // Check if response is still writable
          if (res.writableEnded || res.destroyed) {
            return;
          }

          const message = JSON.parse(data.toString());
          
          // Handle Function Calls (Tool Use) - Check all possible locations
          const functionCalls = extractFunctionCalls(message);
          if (functionCalls.length > 0) {
            const callNames = functionCalls
              .map((call) => call.name)
              .filter((name) => Boolean(name))
              .join(', ');
            console.log(`[${sessionId}] Function call detected`, callNames ? `: ${callNames}` : '');
            const seenCalls = new Set<string>();
            for (const fc of functionCalls) {
              const callKey = fc.id
                ? `id:${fc.id}`
                : `name:${fc.name || 'unknown'}|args:${JSON.stringify(fc.args ?? {})}`;
              if (seenCalls.has(callKey)) {
                continue;
              }
              seenCalls.add(callKey);

              if (fc.name !== 'autoPrintNote') {
                continue;
              }

              const parsedArgs = parseFunctionArgs(fc.args);
              const content = parsedArgs?.content;
              const type = parsedArgs?.type;

              if (!content) {
                console.warn(`[${sessionId}] Function call missing content:`, fc.args);
                continue;
              }

              session.lastFunctionCallAt = Date.now();
              const knowledgeCard = buildKnowledgeCard(content, type);
              const sent = trySendKnowledgeCard(sessionId, session, res, knowledgeCard);
              if (sent) {
                console.log(`[${sessionId}] Knowledge card generated via function call:`, knowledgeCard.title);
              } else {
                console.warn(`[${sessionId}] SSE not writable, queued knowledge card:`, knowledgeCard.title);
              }

              // Send function response back to Gemini
              if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
                session.geminiWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      id: fc.id,
                      name: fc.name,
                      response: { result: "已打印" }
                    }]
                  }
                }));
              }
            }
          }
          
          // Handle transcription (as per competitor code)
          if (message.serverContent?.inputTranscription) {
            const transcription = message.serverContent.inputTranscription;
            // Send transcription to client for display
            if (transcription?.text || typeof transcription === 'string') {
              addTranscriptEntry(session, 'input', transcription.text || transcription);
            }
            try {
              res.write(`data: ${JSON.stringify({ 
                type: 'transcription',
                source: 'input',
                text: transcription.text || transcription
              })}\n\n`);
            } catch (writeError) {
              console.error(`[${sessionId}] Failed to write transcription SSE data:`, writeError);
            }
          }
          
          if (message.serverContent?.outputTranscription) {
            const transcription = message.serverContent.outputTranscription;
            // Send transcription to client for display
            const outputText = transcription?.text || transcription;
            if (outputText) {
              addTranscriptEntry(session, 'output', outputText);
              schedulePrintFallback(sessionId, session, res, outputText);
            }
            try {
              res.write(`data: ${JSON.stringify({ 
                type: 'transcription',
                source: 'output',
                text: outputText
              })}\n\n`);
            } catch (writeError) {
              console.error(`[${sessionId}] Failed to write transcription SSE data:`, writeError);
            }
          }
          
          // Check for partial responses (streaming text) - accumulate text
          if (message.serverContent?.modelTurn?.partial) {
            const partialText = message.serverContent.modelTurn.partial;
            
            // Accumulate text for this session
            const currentBuffer = sessionTextBuffers.get(sessionId) || '';
            const newBuffer = currentBuffer + partialText;
            sessionTextBuffers.set(sessionId, newBuffer);
            
            // Check if we have a complete knowledge card in the accumulated buffer
            const knowledgeCardMatch = newBuffer.match(/\[KNOWLEDGE_CARD_START\]([\s\S]*?)\[KNOWLEDGE_CARD_END\]/);
            if (knowledgeCardMatch) {
              try {
                const cardJson = knowledgeCardMatch[1].trim();
                const knowledgeCard = JSON.parse(cardJson);
                
                if (knowledgeCard.type === 'knowledgeCard' && 
                    knowledgeCard.title && 
                    knowledgeCard.content && 
                    Array.isArray(knowledgeCard.tags)) {
                  
                  // Clear buffer after successful extraction
                  sessionTextBuffers.delete(sessionId);
                  
                  try {
                    res.write(`data: ${JSON.stringify({ 
                      type: 'knowledgeCard',
                      card: knowledgeCard
                    })}\n\n`);
                  } catch (writeError) {
                    console.error(`[${sessionId}] Failed to write knowledge card SSE data:`, writeError);
                  }
                }
              } catch (parseError) {
                // JSON might be incomplete, keep accumulating
              }
            }
          }
          
          // Handle Server Content (Audio and Text)
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                // Send audio chunk via SSE
                try {
                  const audioDataLength = part.inlineData.data?.length || 0;
                  res.write(`data: ${JSON.stringify({ 
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType
                  })}\n\n`);
                } catch (writeError) {
                  console.error(`[${sessionId}] Failed to write SSE data:`, writeError);
                }
              } else if (part.text) {
                // Check for knowledge card in complete text response
                const text = part.text;
                // Forward output text as transcription for UI/fallback
                addTranscriptEntry(session, 'output', text);
                schedulePrintFallback(sessionId, session, res, text);
                try {
                  res.write(`data: ${JSON.stringify({ 
                    type: 'transcription',
                    source: 'output',
                    text
                  })}\n\n`);
                } catch (writeError) {
                  console.error(`[${sessionId}] Failed to write transcription SSE data:`, writeError);
                }
                // Also add to buffer for potential streaming scenarios
                const currentBuffer = sessionTextBuffers.get(sessionId) || '';
                const combinedText = currentBuffer + text;
                
                const knowledgeCardMatch = combinedText.match(/\[KNOWLEDGE_CARD_START\]([\s\S]*?)\[KNOWLEDGE_CARD_END\]/);
                
                if (knowledgeCardMatch) {
                  try {
                    const cardJson = knowledgeCardMatch[1].trim();
                    const knowledgeCard = JSON.parse(cardJson);
                    
                    // Clear buffer after successful extraction
                    sessionTextBuffers.delete(sessionId);
                    
                    // Validate knowledge card format
                    if (knowledgeCard.type === 'knowledgeCard' && 
                        knowledgeCard.title && 
                        knowledgeCard.content && 
                        Array.isArray(knowledgeCard.tags)) {
                      
                      // Send knowledge card via SSE
                      try {
                        res.write(`data: ${JSON.stringify({ 
                          type: 'knowledgeCard',
                          card: knowledgeCard
                        })}\n\n`);
                      } catch (writeError) {
                        console.error(`[${sessionId}] Failed to write knowledge card SSE data:`, writeError);
                      }
                    } else {
                      console.warn(`[${sessionId}] Invalid knowledge card format:`, knowledgeCard);
                    }
                  } catch (parseError) {
                    console.error(`[${sessionId}] Failed to parse knowledge card JSON:`, parseError);
                    console.error(`[${sessionId}] Raw JSON string:`, knowledgeCardMatch[1]?.substring(0, 500));
                  }
                } else {
                  // Store in buffer if markers not found yet (might be streaming)
                  if (text.includes('[KNOWLEDGE_CARD_START]') || currentBuffer.includes('[KNOWLEDGE_CARD_START]')) {
                    sessionTextBuffers.set(sessionId, combinedText);
                  }
                }
              }
            }
          }
          
          // Also check for text in other possible locations (candidates, etc.)
          if (message.candidates && Array.isArray(message.candidates)) {
            for (const candidate of message.candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    const text = part.text;
                    const knowledgeCardMatch = text.match(/\[KNOWLEDGE_CARD_START\]([\s\S]*?)\[KNOWLEDGE_CARD_END\]/);
                    
                    if (knowledgeCardMatch) {
                      try {
                        const cardJson = knowledgeCardMatch[1].trim();
                        const knowledgeCard = JSON.parse(cardJson);
                        
                        if (knowledgeCard.type === 'knowledgeCard' && 
                            knowledgeCard.title && 
                            knowledgeCard.content && 
                            Array.isArray(knowledgeCard.tags)) {
                          
                          try {
                            res.write(`data: ${JSON.stringify({ 
                              type: 'knowledgeCard',
                              card: knowledgeCard
                            })}\n\n`);
                          } catch (writeError) {
                            console.error(`[${sessionId}] Failed to write knowledge card SSE data:`, writeError);
                          }
                        }
                      } catch (parseError) {
                        console.error(`[${sessionId}] Failed to parse knowledge card JSON from candidates:`, parseError);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`[${sessionId}] Failed to parse Gemini message:`, e);
        }
      };

      // Create Gemini connection if not exists
      if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN) {
        let connectionSuccess = false;
        const modelsToTry = [
          "models/gemini-2.5-flash-native-audio-preview-12-2025",
          "models/gemini-2.0-flash-exp"
        ];
        
        for (const modelName of modelsToTry) {
          try {
            // If there was a closed/closing socket, clean it up
            if (session.geminiWs) {
              try {
                session.geminiWs.terminate();
              } catch (e) {}
              session.geminiWs = null;
            }

            session.geminiWs = createGeminiConnection(sessionId, session.script, session.knowledgeCards, modelName);
            
            // Remove any existing message listeners before adding new one
            session.geminiWs.removeAllListeners('message');
            session.geminiWs.on('message', handleGeminiMessage);
            
            // Wait for connection to open
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
              }, 10000);
              
              const onOpen = () => {
                clearTimeout(timeout);
                session?.geminiWs?.removeListener('open', onOpen);
                session?.geminiWs?.removeListener('error', onError);
                session?.geminiWs?.removeListener('close', onClose);
                resolve();
              };

              const onError = (err: Error) => {
                clearTimeout(timeout);
                session?.geminiWs?.removeListener('open', onOpen);
                session?.geminiWs?.removeListener('error', onError);
                session?.geminiWs?.removeListener('close', onClose);
                reject(err);
              };
              
              const onClose = (code: number, reason: Buffer) => {
                const reasonStr = reason.toString();
                if (code === 400 && (reasonStr.includes('model') || reasonStr.includes('invalid'))) {
                  clearTimeout(timeout);
                  session?.geminiWs?.removeListener('open', onOpen);
                  session?.geminiWs?.removeListener('error', onError);
                  session?.geminiWs?.removeListener('close', onClose);
                  reject(new Error(`Model ${modelName} not available`));
                }
              };
              
              session!.geminiWs!.on('open', onOpen);
              session!.geminiWs!.on('error', onError);
              session!.geminiWs!.on('close', onClose);
            });

            connectionSuccess = true;
            console.log(`[${sessionId}] Successfully connected with model: ${modelName}`);
            break;
          } catch (error: any) {
            console.warn(`[${sessionId}] Failed to connect with model ${modelName}:`, error.message);
            if (session.geminiWs) {
              try {
                session.geminiWs.terminate();
              } catch (e) {}
              session.geminiWs = null;
            }
            
            // If this is the last model, fail
            if (modelName === modelsToTry[modelsToTry.length - 1]) {
              if (!res.headersSent) {
                res.write(`data: ${JSON.stringify({ 
                  type: 'error', 
                  message: `Failed to connect: ${error.message}` 
                })}\n\n`);
              }
              res.end();
              return;
            }
            // Otherwise, try next model
            continue;
          }
        }
        
        if (connectionSuccess) {
          res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
          flushPendingKnowledgeCards(sessionId, session, res);
        }
      } else {
        // Reuse existing connection - remove old listeners first to prevent duplicates
        session.geminiWs.removeAllListeners('message');
        session.geminiWs.on('message', handleGeminiMessage);
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
        flushPendingKnowledgeCards(sessionId, session, res);
      }

      // Send queued audio chunks
      while (session.audioQueue.length > 0) {
        const chunk = session.audioQueue.shift();
        if (chunk && session.geminiWs?.readyState === WebSocket.OPEN) {
          session.geminiWs.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm;rate=16000",
                data: chunk.data
              }]
            }
          }));
        }
      }

      // Handle client disconnect
      req.on('close', () => {
        // Clean up text buffer
        sessionTextBuffers.delete(sessionId);
        if (session) {
          session.isActive = false;
          // Remove this response's listener to prevent writing to closed response
          if (session.geminiWs) {
             session.geminiWs.removeListener('message', handleGeminiMessage);
          }
          if (session.pendingPrintIntent) {
            clearTimeout(session.pendingPrintIntent);
            session.pendingPrintIntent = null;
          }
        }
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
        }
      }, 30000);

      // Cleanup on close
      req.on('close', () => {
        clearInterval(keepAlive);
        if (session) {
          session.isActive = false;
          // Remove this response's listener to prevent writing to closed response
          if (session.geminiWs) {
             session.geminiWs.removeListener('message', handleGeminiMessage);
          }
          if (session.pendingPrintIntent) {
            clearTimeout(session.pendingPrintIntent);
            session.pendingPrintIntent = null;
          }
        }
      });

      return;
    }

    // POST: Send audio data or initialize session
    if (req.method === 'POST') {
      const { audioData, script, knowledgeCards, action } = req.body;

      // Initialize session
      if (action === 'init') {
        if (!script) {
          res.status(400).json({ error: 'script is required for initialization' });
          return;
        }

        const session: Session = {
          geminiWs: null,
          audioQueue: [],
          isActive: false,
          script: script,
          knowledgeCards: knowledgeCards || [],
          pendingKnowledgeCards: [],
          transcriptHistory: [],
          pendingPrintIntent: null,
          printIntentCounter: 0,
          lastFunctionCallAt: null,
          lastPrintIntentAt: null,
          lastFallbackAt: null,
          hasSentInitialPrompt: false
        };

        sessions.set(sessionId, session);
        res.json({ success: true, sessionId });
        return;
      }

      // Send audio data
      if (action === 'send' && audioData) {
        const session = sessions.get(sessionId);
        if (!session) {
          res.status(404).json({ error: 'Session not found. Please initialize first.' });
          return;
        }

        // If Gemini WebSocket is ready, send immediately
        if (session.geminiWs && session.geminiWs.readyState === WebSocket.OPEN) {
          session.geminiWs.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm;rate=16000",
                data: audioData
              }]
            }
          }));
          res.json({ success: true });
        } else {
          // Queue for later
          session.audioQueue.push({
            data: audioData,
            timestamp: Date.now()
          });
          res.json({ success: true, queued: true });
        }
        return;
      }

      // Disconnect session
      if (action === 'disconnect') {
        const session = sessions.get(sessionId);
        if (session) {
          if (session.geminiWs) {
            // Remove all listeners before closing
            session.geminiWs.removeAllListeners();
            session.geminiWs.close();
          }
          if (session.pendingPrintIntent) {
            clearTimeout(session.pendingPrintIntent);
            session.pendingPrintIntent = null;
          }
          sessions.delete(sessionId);
        }
        res.json({ success: true });
        return;
      }

      res.status(400).json({ error: 'Invalid action or missing data' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Live session error:', error);
    // If headers already sent, we can't send JSON error, but Express might handle it
    if (!res.headersSent) {
        res.status(500).json({ 
        error: `实时练习服务出错：${error.message || '未知错误'}` 
        });
    }
  }
});

export default router;
