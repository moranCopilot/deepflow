import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  callFlowSpeechDirect,
  callScriptToSpeech,
  checkEpisodeStatus
} from './listenhub-client.js';
import {
  isListenHubConfigured,
  getListenHubConfig,
  getListenHubConfigDiagnostics
} from './config-helper.js';
import { generateGoogleTTS } from './tts-processor.js';

/**
 * TTS API 端点 (Stateless for Serverless)
 * 
 * 放弃内存 Task Manager，改为直接透传 ListenHub ID 或直接返回 Google TTS 结果。
 * 解决 Vercel Serverless Function 无法维持后台长任务和内存状态的问题。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lightweight runtime fingerprint for debugging deployments.
  res.setHeader('X-Deepflow-TTS', 'vercel-stateless-v3');

  // 处理 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: 查询任务状态
  if (req.method === 'GET') {
    const { taskId } = req.query;
    
    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'taskId is required' });
    }

    // 1. 检查是否为 ListenHub Episode ID (通常是 24位 Hex)
    // 简单的正则检查：/^[0-9a-fA-F]{24}$/
    if (/^[0-9a-fA-F]{24}$/.test(taskId)) {
        try {
            const config = getListenHubConfig();
            // 如果查不到 Key，说明环境配置有问题，直接报错
            if (!config.apiKey) {
                return res.status(500).json({ error: 'API Configuration Error' });
            }
            
            // 单次查询 ListenHub 状态
            const statusResult = await checkEpisodeStatus(taskId, config.apiKey);
            
            if (statusResult.status === 'failed') {
                 // 异步生成失败。由于我们没有存储 script，无法在此处 fallback。
                 return res.json({
                     taskId,
                     status: 'failed',
                     error: statusResult.error || 'ListenHub generation failed'
                 });
            }
            
            // 映射状态给前端
            // ListenHub: processing, generating -> Front: processing
            // ListenHub: completed, success -> Front: completed
            // 如果有了 URL，也视为完成 (Fast completion)
            const isCompleted = statusResult.status === 'completed' || !!statusResult.url;
            
            return res.json({
                taskId,
                status: isCompleted ? 'completed' : 'processing', // 前端识别 processing 显示进度
                progress: isCompleted ? undefined : { percentage: 50, message: 'Generating audio...' },
                result: isCompleted && statusResult.url ? { url: statusResult.url, duration: statusResult.duration } : undefined
            });
            
        } catch (error: any) {
             console.error('Check status error:', error);
             return res.status(500).json({ error: error.message });
        }
    }
    
    // 2. 如果是 Google TTS ID (我们在 POST 阶段生成的伪 ID)
    if (taskId.startsWith('google-')) {
        // Google TTS 结果应该在 POST 阶段就返回了。
        // 如果前端还在查这个 ID，说明它丢失了 POST 的结果或者逻辑有问题。
        // 返回 completed 状态，但不带结果（或者返回 404）
        return res.json({
            taskId,
            status: 'completed',
            // 无法重新生成，因为没 script
            error: 'Result already returned in POST request' 
        });
    }

    return res.status(404).json({ error: 'Task not found' });
  }

  // POST: 创建任务
  if (req.method === 'POST') {
    // Parse body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('[TTS] Invalid JSON body:', body);
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    const { script, text, preset, contentType } = body || {};

    const normalizedScript =
      Array.isArray(script)
        ? script
            .map((line: any) => ({
              speaker: typeof line?.speaker === 'string' ? line.speaker : '',
              text: typeof line?.text === 'string' ? line.text : ''
            }))
            .filter((line: { speaker: string; text: string }) => line.text.trim().length > 0)
        : null;

    // 验证输入
    if (!normalizedScript || normalizedScript.length === 0) {
      // Backward compatibility: allow `{ text: string }` payload
      if (typeof text === 'string' && text.trim().length > 0) {
        const urls = generateGoogleTTS([{ speaker: '', text }], false);
        return res.json({
          taskId: 'google-' + Date.now(),
          status: 'completed',
          result: { urls },
          provider: 'google',
          handler: 'vercel-stateless-v3'
        });
      }

      console.error('[TTS] Invalid script payload:', JSON.stringify(body || {}).substring(0, 500));
      return res.status(400).json({
        error:
          "Script is required and must be a non-empty array with non-empty 'text' fields (or provide non-empty 'text' string)",
        handler: 'vercel-stateless-v3',
        received: {
          hasScript: Array.isArray(script),
          scriptLength: Array.isArray(script) ? script.length : 0,
          hasText: typeof text === 'string',
          textLength: typeof text === 'string' ? text.length : 0
        }
      });
    }

    const isQuickSummary = preset === 'quick_summary' || contentType === 'output';
    const isDeepAnalysis = preset === 'deep_analysis' || contentType === 'discussion';
    
    let listenHubError: string | undefined;
    const listenHubDiag = getListenHubConfigDiagnostics();
    const listenHubApplicable = isQuickSummary || isDeepAnalysis;

    // 尝试使用 ListenHub
    if (isListenHubConfigured() && listenHubApplicable) {
        try {
            console.log('[TTS] Attempting ListenHub submission...', {
              baseUrl: listenHubDiag.baseUrl,
              apiKeySource: listenHubDiag.apiKeySource
            });
            let result;
            
            // asyncMode = true: 只提交任务，不轮询
            if (isQuickSummary) {
                result = await callFlowSpeechDirect(normalizedScript, undefined, true);
            } else {
                result = await callScriptToSpeech(normalizedScript, undefined, true);
            }
            
            // 如果拿到了 episodeId，返回 pending 状态让前端轮询
            if (result.episodeId) {
                console.log('[TTS] ListenHub task submitted:', result.episodeId);
                return res.json({
                    taskId: result.episodeId, // 透传 ID
                    status: 'pending',
                    message: 'Task submitted to ListenHub',
                    provider: 'listenhub',
                    handler: 'vercel-stateless-v3'
                });
            } 
            
            // 如果意外地直接拿到了 URL (同步返回)
            if (result.url || result.urls) {
                console.log('[TTS] ListenHub returned result immediately');
                return res.json({
                    taskId: 'completed-' + Date.now(),
                    status: 'completed',
                    result: result,
                    provider: 'listenhub',
                    handler: 'vercel-stateless-v3'
                });
            }

            // Should not happen; treat as failure to make fallback reason visible
            listenHubError = 'ListenHub returned empty response (no episodeId/url)';
            
        } catch (error: any) {
            console.error('[TTS] ListenHub submission failed, falling back to Google TTS:', error);
            // 继续向下执行 Google TTS Fallback
            // 保存错误信息以便返回给前端调试
            listenHubError = error.message || String(error);
        }
    } else {
        console.log('[TTS] ListenHub skipped, using Google TTS', {
          applicable: listenHubApplicable,
          configured: listenHubDiag.apiKeyConfigured,
          apiKeySource: listenHubDiag.apiKeySource
        });
    }
    
    // Google TTS Fallback
    try {
        const urls = generateGoogleTTS(normalizedScript, isDeepAnalysis);
        console.log('[TTS] Google TTS generated successfully');
        
        return res.json({
            taskId: 'google-' + Date.now(),
            status: 'completed',
            result: { urls },
            provider: 'google',
            handler: 'vercel-stateless-v3',
            // 如果是从 ListenHub Fallback 过来的，带上错误原因
            fallbackReason:
              typeof listenHubError !== 'undefined'
                ? listenHubError
                : isListenHubConfigured() && listenHubApplicable
                  ? 'ListenHub failed with unknown error'
                  : 'ListenHub not configured or not applicable'
        });
    } catch (error: any) {
        console.error('[TTS] Google TTS failed:', error);
        return res.status(500).json({ error: error.message || "Failed to generate TTS" });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
