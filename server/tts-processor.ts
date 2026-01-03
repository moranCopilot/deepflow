/**
 * 异步 TTS 处理器
 */

import { isListenHubConfigured } from './config-helper.js';
import { callFlowSpeechDirect, callScriptToSpeech } from './listenhub-client.js';
import { updateTaskProgress, updateTaskStatus, type TTSTask } from './tts-task-manager.js';
import type { ScriptItem } from './listenhub-utils.js';
import * as googleTTS from 'google-tts-api';

type GoogleTTSAudio = { url: string };

/**
 * 处理 TTS 生成（异步）
 */
export async function processTTSAsync(
  taskId: string,
  script: ScriptItem[],
  preset: string,
  contentType: string
): Promise<void> {
  try {
    // 更新进度：准备中
    updateTaskProgress(taskId, {
      stage: 'preparing',
      message: '准备脚本格式...',
      percentage: 10,
      details: {
        scriptLength: script.length
      }
    });

    const isQuickSummary = preset === 'quick_summary' || contentType === 'output';
    const isDeepAnalysis = preset === 'deep_analysis' || contentType === 'discussion';

    // 检查是否使用 ListenHub
    const useListenHub = isListenHubConfigured() && (isQuickSummary || isDeepAnalysis);

    if (useListenHub) {
      // 使用 ListenHub API
      try {
        let result: { url?: string; urls?: string[]; duration?: number };

        if (isQuickSummary) {
          // 速听精华：使用 flow speech direct
          result = await callFlowSpeechDirect(script, (progress) => {
            updateTaskProgress(taskId, {
              stage: progress.stage as any,
              message: progress.message,
              percentage: progress.percentage
            });
          });
        } else {
          // 深度剖析：使用 script-to-speech
          result = await callScriptToSpeech(script, (progress) => {
            updateTaskProgress(taskId, {
              stage: progress.stage as any,
              message: progress.message,
              percentage: progress.percentage
            });
          });
        }

        // 更新任务状态为完成
        updateTaskStatus(taskId, 'completed', {
          url: result.url,
          urls: result.urls,
          duration: result.duration
        });
      } catch (error: any) {
        console.error('ListenHub API 错误:', error);
        // Fallback 到 Google TTS
        await fallbackToGoogleTTS(taskId, script, isDeepAnalysis);
      }
    } else {
      // 直接使用 Google TTS
      await fallbackToGoogleTTS(taskId, script, isDeepAnalysis);
    }
  } catch (error: any) {
    console.error('TTS 处理错误:', error);
    updateTaskStatus(taskId, 'failed', {
      error: error.message || 'TTS 生成失败'
    });
  }
}

/**
 * 生成 Google TTS URL（纯函数，无状态）
 */
export function generateGoogleTTS(script: ScriptItem[], isDeepAnalysis: boolean): string[] {
  let finalText: string;
  if (isDeepAnalysis && script.length > 0) {
    finalText = script.map((line) => {
      const speaker = line.speaker || '';
      const content = line.text || '';
      return speaker ? `${speaker}: ${content}` : content;
    }).join('\n');
  } else {
    finalText = script.map(line => line.text).join('\n');
  }

  if (!finalText || finalText.trim().length === 0) {
    throw new Error('文本内容为空');
  }

  // 调用 Google TTS
  const audioData = googleTTS.getAllAudioUrls(finalText, {
    lang: 'zh-CN',
    slow: false,
    host: 'https://translate.google.com'
  }) as GoogleTTSAudio[];

  return audioData.map(item => item.url);
}

/**
 * Fallback 到 Google TTS
 */
async function fallbackToGoogleTTS(
  taskId: string,
  script: ScriptItem[],
  isDeepAnalysis: boolean
): Promise<void> {
  updateTaskProgress(taskId, {
    stage: 'preparing',
    message: '使用 Google TTS...',
    percentage: 20
  });

  // 准备文本
  let finalText: string;
  if (isDeepAnalysis && script.length > 0) {
    finalText = script.map((line) => {
      const speaker = line.speaker || '';
      const content = line.text || '';
      return speaker ? `${speaker}: ${content}` : content;
    }).join('\n');
  } else {
    finalText = script.map(line => line.text).join('\n');
  }

  if (!finalText || finalText.trim().length === 0) {
    throw new Error('文本内容为空');
  }

  updateTaskProgress(taskId, {
    stage: 'generating',
    message: '生成音频...',
    percentage: 50
  });

  // 调用 Google TTS
  const audioData = googleTTS.getAllAudioUrls(finalText, {
    lang: 'zh-CN',
    slow: false,
    host: 'https://translate.google.com'
  }) as GoogleTTSAudio[];

  updateTaskProgress(taskId, {
    stage: 'completed',
    message: '完成',
    percentage: 100
  });

  // 更新任务状态
  updateTaskStatus(taskId, 'completed', {
    urls: audioData.map(item => item.url)
  });
}
