import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGeminiApiKey } from './config-helper.js';
import { WebSocket } from 'ws';

const GEMINI_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Session storage (in production, use Redis or similar)
interface Session {
  geminiWs: WebSocket | null;
  audioQueue: Array<{ data: string; timestamp: number }>;
  isActive: boolean;
  script: string;
  knowledgeCards: any[];
}

const sessions = new Map<string, Session>();

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
        generation_config: {
          response_modalities: ["AUDIO"],
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
            { text: "你是一位亲切友好的AI导师，正在帮助用户进行学习练习。请使用中文进行对话，偶尔可以包含英文单词或短语。使用自然、亲切的语调，就像一位耐心的老师在与学生交流。以下是练习脚本和知识点：" },
            { text: script },
            { text: "关键知识点：" },
            { text: JSON.stringify(knowledgeCards) },
            { text: "请进行自然的中文对话，鼓励学习者，但要及时纠正错误。回答要简洁明了，避免冗长。使用亲切、温和的女声语调，让对话更加自然流畅。" }
          ]
        }
      }
    };
    console.log(`[${sessionId}] Using model: ${modelName}`);
    geminiWs.send(JSON.stringify(setupMsg));
  });

  geminiWs.on('error', (err) => {
    console.error(`[${sessionId}] Gemini WebSocket Error:`, err);
  });

  geminiWs.on('close', (code, reason) => {
    const reasonStr = reason.toString();
    console.log(`[${sessionId}] Gemini Connection Closed:`, code, reasonStr);
    
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const sessionId = req.query.sessionId as string || req.body?.sessionId;

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

    // Get or create session
    let session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found. Please initialize with POST first.' });
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
        
        // Handle Server Content (Audio)
        if (message.serverContent?.modelTurn?.parts) {
          for (const part of message.serverContent.modelTurn.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
              // Send audio chunk via SSE
              try {
                res.write(`data: ${JSON.stringify({ 
                  type: 'audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                })}\n\n`);
              } catch (writeError) {
                console.error(`[${sessionId}] Failed to write SSE data:`, writeError);
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
              session.geminiWs!.removeListener('open', onOpen);
              session.geminiWs!.removeListener('error', onError);
              session.geminiWs!.removeListener('close', onClose);
              resolve();
            };
            
            const onError = (err: Error) => {
              clearTimeout(timeout);
              session.geminiWs!.removeListener('open', onOpen);
              session.geminiWs!.removeListener('error', onError);
              session.geminiWs!.removeListener('close', onClose);
              reject(err);
            };
            
            const onClose = (code: number, reason: Buffer) => {
              const reasonStr = reason.toString();
              if (code === 400 && (reasonStr.includes('model') || reasonStr.includes('invalid'))) {
                clearTimeout(timeout);
                session.geminiWs!.removeListener('open', onOpen);
                session.geminiWs!.removeListener('error', onError);
                session.geminiWs!.removeListener('close', onClose);
                reject(new Error(`Model ${modelName} not available`));
              }
            };
            
            session.geminiWs!.on('open', onOpen);
            session.geminiWs!.on('error', onError);
            session.geminiWs!.on('close', onClose);
          });

          connectionSuccess = true;
          console.log(`[${sessionId}] Successfully connected with model: ${modelName}`);
          break;
        } catch (error: any) {
          console.warn(`[${sessionId}] Failed to connect with model ${modelName}:`, error.message);
          if (session.geminiWs) {
            try {
              session.geminiWs.close();
            } catch (e) {}
            session.geminiWs = null;
          }
          
          // If this is the last model, fail
          if (modelName === modelsToTry[modelsToTry.length - 1]) {
            res.write(`data: ${JSON.stringify({ 
              type: 'error', 
              message: `Failed to connect: ${error.message}` 
            })}\n\n`);
            res.end();
            return;
          }
          // Otherwise, try next model
          continue;
        }
      }
      
      if (connectionSuccess) {
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      }
    } else {
      // Reuse existing connection - remove old listeners first to prevent duplicates
      session.geminiWs.removeAllListeners('message');
      session.geminiWs.on('message', handleGeminiMessage);
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
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
      console.log(`[${sessionId}] SSE connection closed`);
      session.isActive = false;
      // Don't close Gemini connection immediately, keep it for a bit
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
    }, 30000);

    // Cleanup on close
    req.on('close', () => {
      clearInterval(keepAlive);
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
        knowledgeCards: knowledgeCards || []
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
    res.status(500).json({ 
      error: `实时练习服务出错：${error.message || '未知错误'}` 
    });
  }
}
