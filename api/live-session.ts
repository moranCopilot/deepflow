import type { VercelRequest, VercelResponse } from '@vercel/node';
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

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.VUE_APP_GEMINI_API_KEY || '';
}

function createGeminiConnection(sessionId: string, script: string, knowledgeCards: any[]): WebSocket {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const targetUrl = `${GEMINI_URL}?key=${apiKey}`;
  const geminiWs = new WebSocket(targetUrl);

  geminiWs.on('open', () => {
    console.log(`[${sessionId}] Connected to Gemini Live API`);
    
    // Send setup message
    const setupMsg = {
      setup: {
        model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
        generation_config: {
          response_modalities: ["AUDIO"]
        },
        system_instruction: {
          parts: [
            { text: "You are an AI tutor helping the user practice. Here is the context:" },
            { text: script },
            { text: "Here are key knowledge points:" },
            { text: JSON.stringify(knowledgeCards) },
            { text: "Conduct a natural conversation to help the user master these points. Be encouraging but correct mistakes. Do not be too verbose." }
          ]
        }
      }
    };
    geminiWs.send(JSON.stringify(setupMsg));
  });

  geminiWs.on('error', (err) => {
    console.error(`[${sessionId}] Gemini WebSocket Error:`, err);
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[${sessionId}] Gemini Connection Closed:`, code, reason.toString());
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
                  data: part.inlineData.data 
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
      try {
        session.geminiWs = createGeminiConnection(sessionId, session.script, session.knowledgeCards);
        
        session.geminiWs.on('message', handleGeminiMessage);
        
        // Wait for connection to open
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);
          
          session.geminiWs!.on('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          session.geminiWs!.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      } catch (error: any) {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error.message 
        })}\n\n`);
        res.end();
        return;
      }
    } else {
      // Reuse existing connection
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
              mime_type: "audio/pcm",
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
              mime_type: "audio/pcm",
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
