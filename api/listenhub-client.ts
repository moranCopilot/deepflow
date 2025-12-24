/**
 * ListenHub (MarsWave) API 客户端
 */

import { getListenHubConfig } from './config-helper.js';
import {
  convertScriptToListenHubFormat,
  prepareFlowSpeechDirectRequest,
  type ScriptItem,
  type FlowSpeechDirectRequest
} from './listenhub-utils.js';

const API_TIMEOUT_MS = 180000; // 180 秒
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 秒

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`API 请求超时（${timeoutMs / 1000}秒），请稍后重试`);
    }
    throw error;
  }
}

/**
 * 带重试的 API 调用
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      console.log(`ListenHub API 调用失败，第 ${attempt} 次重试... Error:`, lastError);
    }
  }
  
  throw lastError || new Error('API 调用失败');
}

/**
 * 单次查询 Episode 状态（不轮询）
 */
export async function checkEpisodeStatus(
  episodeId: string,
  apiKey: string
): Promise<{ status: string; url?: string; duration?: number; error?: string }> {
  const config = getListenHubConfig();
  const response = await fetchWithTimeout(
    `${config.baseUrl}/flow-speech/episodes/${episodeId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    },
    10000 // 10 秒超时
  );

  if (!response.ok) {
    throw new Error(`查询 Episode 状态失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // 统一提取数据对象
  let episode = data;
  if ((data.code === 0 || data.code === '0') && data.data) {
    episode = data.data;
  } else if (data.data) {
    episode = data.data;
  }

  const status = episode.status || episode.processStatus || data.status;
  
  // 提取 URL (优先 MP3)
  const mp3Url = 
    episode.audioUrl || 
    episode.audio_url || 
    episode.url || 
    episode.audio?.url || 
    data.audioUrl || 
    data.url;

  const m3u8Url = 
    episode.audioStreamUrl || 
    data.audioStreamUrl;

  const result: { status: string; url?: string; duration?: number; error?: string } = {
    status: status || 'unknown',
    duration: episode.duration || episode.audio?.duration || data.duration
  };

  if (mp3Url && typeof mp3Url === 'string' && mp3Url.trim().length > 0) {
    result.url = mp3Url.trim();
  } else if ((status === 'success' || status === 'completed') && m3u8Url && typeof m3u8Url === 'string') {
    // 只有成功且无 MP3 时才返回 M3U8
    result.url = m3u8Url.trim();
  }

  if (status === 'failed' || status === 'error' || status === 'failure') {
    result.error = episode.error || episode.message || data.error || data.message || '音频生成失败';
    result.status = 'failed';
  } else if (status === 'success' || status === 'completed' || status === 'done') {
    result.status = 'completed';
  } else {
    result.status = 'processing';
  }

  return result;
}

/**
 * 查询 Episode 状态并获取音频 URL
 */
async function getEpisodeAudioUrl(
  episodeId: string,
  apiKey: string,
  onProgress?: (progress: { stage: string; message: string; percentage: number }) => void
): Promise<{ url?: string; duration?: number }> {
  const config = getListenHubConfig();
  const maxPollAttempts = 120; // 最多轮询 120 次（每次 5 秒，共 10 分钟）
  let attempts = 0;

  while (attempts < maxPollAttempts) {
    onProgress?.({
      stage: 'generating',
      message: `查询音频生成状态... (${attempts + 1}/${maxPollAttempts})`,
      percentage: 70 + Math.floor((attempts / maxPollAttempts) * 25)
    });

    try {
      // 修改轮询频率：首次等待 10s，之后每 5s 一次
      const delayMs = attempts === 0 ? 10000 : 5000;
      await new Promise(resolve => setTimeout(resolve, delayMs));

      const response = await fetchWithTimeout(
        `${config.baseUrl}/flow-speech/episodes/${episodeId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        },
        10000 // 10 秒超时
      );

      if (response.status === 429) {
        console.warn(`[ListenHub] Rate limit hit (attempt ${attempts + 1}), backing off...`);
        // 如果遇到 429，额外等待 5 秒
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`查询 Episode 状态失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // 详细打印完整响应，以便调试
      console.log(`[ListenHub] Episode Status Response (attempt ${attempts + 1}):`, JSON.stringify(data, null, 2));

      // 统一提取数据对象，兼容多种结构
      let episode = data;
      if ((data.code === 0 || data.code === '0') && data.data) {
        episode = data.data;
      } else if (data.data) {
        // 某些情况下可能没有 code 但有 data
        episode = data.data;
      }

      console.log(`[ListenHub] Extracted episode data:`, JSON.stringify(episode, null, 2));

      // 分别检查 MP3 URL 和 M3U8 URL
      const mp3Url = 
        episode.audioUrl || 
        episode.audio_url || 
        episode.url || 
        episode.audio?.url || 
        data.audioUrl || 
        data.url;

      const m3u8Url = 
        episode.audioStreamUrl || 
        data.audioStreamUrl;

      // 1. 优先返回 MP3 (audioUrl)
      if (mp3Url && typeof mp3Url === 'string' && mp3Url.trim().length > 0) {
         const trimmedUrl = mp3Url.trim();
         console.log(`[ListenHub] MP3 Audio URL found: ${trimmedUrl}`);
         
         const status = episode.status || episode.processStatus || data.status;
         if (status !== 'failed' && status !== 'error' && status !== 'failure') {
           console.log(`[ListenHub] MP3 URL found and status is '${status}' (not failed). Returning URL.`);
           return {
             url: trimmedUrl,
             duration: episode.duration || episode.audio?.duration || data.duration
           };
         }
      }

      // 检查状态字段
      const status = episode.status || episode.processStatus || data.status;
      
      // 2. 如果任务已完成 (success/completed)，且没有 MP3，则尝试返回 M3U8
      if (status === 'success' || status === 'completed' || status === 'done') {
        if (m3u8Url && typeof m3u8Url === 'string' && m3u8Url.trim().length > 0) {
           console.log(`[ListenHub] Task completed. MP3 missing but M3U8 found. Returning M3U8.`);
           return {
             url: m3u8Url.trim(),
             duration: episode.duration || episode.audio?.duration || data.duration
           };
        }
        
        // 如果 MP3 也没有，M3U8 也没有，但状态是成功... 可能是异常
        if (mp3Url) { // 再次检查 mp3Url (理论上上面已经返回了，这里防守)
           return {
             url: mp3Url.trim(),
             duration: episode.duration || episode.audio?.duration || data.duration
           };
        }
        console.warn('[ListenHub] 状态为 success 但未找到任何 audioUrl 或 audioStreamUrl:', episode);
      } else if (status === 'failed' || status === 'error' || status === 'failure') {
        throw new Error(episode.error || episode.message || data.error || data.message || '音频生成失败');
      }
      
      // 3. 如果还在处理中 (processing/pending)，且发现了 M3U8
      if (m3u8Url && typeof m3u8Url === 'string' && m3u8Url.trim().length > 0) {
          console.log(`[ListenHub] Status is '${status}', M3U8 found but waiting for MP3... (Stream URL: ${m3u8Url})`);
          // 这里我们选择继续轮询，以优先获取 MP3。
          // 如果用户希望能尽快播放（流式），可以改为直接返回 m3u8Url。
          // 但根据需求 "优先采用 audio url 来匹配"，我们选择等待。
      } else {
          console.log(`[ListenHub] Status is '${status}', continuing poll... (Next attempt in 5s)`);
      }

    } catch (error: any) {
      // 如果是最后一次尝试，抛出错误
      if (attempts >= maxPollAttempts - 1) {
        throw error;
      }
      // 否则继续重试
      console.warn(`[ListenHub] Episode 查询错误 (attempt ${attempts + 1}):`, error.message);
    }

    attempts++;
  }

  throw new Error('音频生成超时，请稍后重试');
}

/**
 * 调用 Flow Speech Direct API（速听精华模式）
 */
export async function callFlowSpeechDirect(
  script: ScriptItem[],
  onProgress?: (progress: { stage: string; message: string; percentage: number }) => void,
  asyncMode: boolean = false
): Promise<{ url?: string; urls?: string[]; duration?: number; episodeId?: string }> {
  const config = getListenHubConfig();
  if (!config.apiKey) {
    throw new Error('ListenHub API Key 未配置');
  }

  onProgress?.({
    stage: 'preparing',
    message: '准备 Flow Speech Direct 请求...',
    percentage: 10
  });

  const requestBody = prepareFlowSpeechDirectRequest(script);

  console.log(`[ListenHub] Preparing Flow Speech Direct Request:`, JSON.stringify(requestBody, null, 2));

  onProgress?.({
    stage: 'calling-api',
    message: '调用 ListenHub Flow Speech API...',
    percentage: 30
  });

  const response = await callWithRetry(async () => {
    const url = `${config.baseUrl}/flow-speech/episodes`;
    console.log(`[ListenHub] POST ${url}`);
    return await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      },
      API_TIMEOUT_MS
    );
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[ListenHub] API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Flow Speech API 错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  onProgress?.({
    stage: 'processing',
    message: '处理 API 响应...',
    percentage: 50
  });

  const data = await response.json();
  console.log(`[ListenHub] API Response:`, JSON.stringify(data, null, 2));

  // 处理响应格式：{ code: 0, data: { episodeId: '...' } }
  // 注意：code 可能是数字 0 或字符串 "0"
  let episodeId: string | undefined;
  
  // 检查标准响应格式 { code: 0, data: { episodeId: '...' } }
  if ((data.code === 0 || data.code === '0') && data.data) {
    episodeId = data.data.episodeId || data.data.episode_id || data.data.id;
    console.log(`[ListenHub] Found episodeId in data.data:`, episodeId);
  } 
  // 检查其他可能的格式
  else if (data.episodeId) {
    episodeId = data.episodeId;
    console.log(`[ListenHub] Found episodeId in root:`, episodeId);
  } else if (data.episode_id) {
    episodeId = data.episode_id;
    console.log(`[ListenHub] Found episode_id in root:`, episodeId);
  } else if (data.id) {
    episodeId = data.id;
    console.log(`[ListenHub] Found id in root:`, episodeId);
  } else if (data.data?.episodeId) {
    episodeId = data.data.episodeId;
    console.log(`[ListenHub] Found episodeId in data (no code check):`, episodeId);
  } else if (data.data?.episode_id) {
    episodeId = data.data.episode_id;
    console.log(`[ListenHub] Found episode_id in data (no code check):`, episodeId);
  } else if (data.data?.id) {
    episodeId = data.data.id;
    console.log(`[ListenHub] Found id in data (no code check):`, episodeId);
  }

  // 如果没有 episodeId，尝试直接获取 URL（向后兼容）
  if (!episodeId) {
    console.log(`[ListenHub] No episodeId found, trying to extract URL directly`);
    let result: { url?: string; urls?: string[]; duration?: number } = {};
    
    if (data.url) {
      result.url = data.url;
      console.log(`[ListenHub] Found url in root:`, result.url);
    } else if (data.urls && Array.isArray(data.urls)) {
      result.urls = data.urls;
      console.log(`[ListenHub] Found urls array in root:`, result.urls);
    } else if (data.audioUrl) {
      result.url = data.audioUrl;
      console.log(`[ListenHub] Found audioUrl in root:`, result.url);
    } else if (data.audio_url) {
      result.url = data.audio_url;
      console.log(`[ListenHub] Found audio_url in root:`, result.url);
    } else if (data.data?.url) {
      result.url = data.data.url;
      console.log(`[ListenHub] Found url in data:`, result.url);
    } else if (data.data?.audioUrl) {
      result.url = data.data.audioUrl;
      console.log(`[ListenHub] Found audioUrl in data:`, result.url);
    } else if (data.data?.audio_url) {
      result.url = data.data.audio_url;
      console.log(`[ListenHub] Found audio_url in data:`, result.url);
    } else {
      console.error('[ListenHub] 未识别的 API 响应格式:', JSON.stringify(data, null, 2));
      console.error('[ListenHub] 响应结构分析:', {
        hasCode: 'code' in data,
        codeValue: data.code,
        hasData: 'data' in data,
        dataKeys: data.data ? Object.keys(data.data) : null,
        rootKeys: Object.keys(data)
      });
      throw new Error('API 响应格式异常，无法提取 episodeId 或音频 URL。响应: ' + JSON.stringify(data));
    }

    if (data.duration || data.data?.duration) {
      result.duration = data.duration || data.data.duration;
    }

    onProgress?.({
      stage: 'completed',
      message: '完成',
      percentage: 100
    });

    return result;
  }

    if (asyncMode) {
      console.log(`[ListenHub] Async mode: returning episodeId immediately:`, episodeId);
      return { episodeId };
    }

    console.log(`[ListenHub] Using episodeId to query audio:`, episodeId);

    // 使用 episodeId 查询音频 URL
  onProgress?.({
    stage: 'generating',
    message: '等待音频生成...',
    percentage: 60
  });

  const audioResult = await getEpisodeAudioUrl(episodeId, config.apiKey, onProgress);

  onProgress?.({
    stage: 'completed',
    message: '完成',
    percentage: 100
  });

  return audioResult;
}

/**
 * 调用 Script-to-Speech API（深度剖析模式）
 */
export async function callScriptToSpeech(
  script: ScriptItem[],
  onProgress?: (progress: { stage: string; message: string; percentage: number }) => void,
  asyncMode: boolean = false
): Promise<{ url?: string; urls?: string[]; duration?: number; episodeId?: string }> {
  const config = getListenHubConfig();
  if (!config.apiKey) {
    throw new Error('ListenHub API Key 未配置');
  }

  onProgress?.({
    stage: 'preparing',
    message: '准备 Script-to-Speech 请求...',
    percentage: 10
  });

  const scripts = convertScriptToListenHubFormat(script);
  console.log(`[ListenHub] Preparing Script-to-Speech Request:`, JSON.stringify({ scripts }, null, 2));

  onProgress?.({
    stage: 'calling-api',
    message: '调用 ListenHub Speech API...',
    percentage: 30
  });

  const response = await callWithRetry(async () => {
    const url = `${config.baseUrl}/speech`;
    console.log(`[ListenHub] POST ${url}`);
    return await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ scripts })
      },
      API_TIMEOUT_MS
    );
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[ListenHub] API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Speech API 错误: ${response.status} ${response.statusText} - ${errorText}`);
  }

  onProgress?.({
    stage: 'processing',
    message: '处理 API 响应...',
    percentage: 50
  });

  const data = await response.json();
  console.log(`[ListenHub] API Response:`, JSON.stringify(data, null, 2));

  // 处理响应格式：可能是 { code: 0, data: { url: '...' } } 或 { code: 0, data: { episodeId: '...' } }
  let result: { url?: string; urls?: string[]; duration?: number } = {};
  
  if (data.code === 0 && data.data) {
    // 标准响应格式
    if (data.data.url) {
      result.url = data.data.url;
    } else if (data.data.urls && Array.isArray(data.data.urls)) {
      result.urls = data.data.urls;
    } else if (data.data.audioUrl || data.data.audio_url) {
      result.url = data.data.audioUrl || data.data.audio_url;
    } else if (data.data.episodeId || data.data.episode_id) {
      // 如果返回 episodeId，需要查询状态
      const episodeId = data.data.episodeId || data.data.episode_id;
      
      if (asyncMode) {
        console.log(`[ListenHub] Async mode: returning episodeId immediately:`, episodeId);
        return { episodeId };
      }

      onProgress?.({
        stage: 'generating',
        message: '等待音频生成...',
        percentage: 60
      });
      const audioResult = await getEpisodeAudioUrl(episodeId, config.apiKey, onProgress);
      onProgress?.({
        stage: 'completed',
        message: '完成',
        percentage: 100
      });
      return audioResult;
    }
    result.duration = data.data.duration;
  } else if (data.url) {
    result.url = data.url;
    result.duration = data.duration;
  } else if (data.urls && Array.isArray(data.urls)) {
    result.urls = data.urls;
    result.duration = data.duration;
  } else if (data.audioUrl) {
    result.url = data.audioUrl;
    result.duration = data.duration;
  } else if (data.audio_url) {
    result.url = data.audio_url;
    result.duration = data.duration;
  } else if (data.episodeId || data.episode_id) {
    // 直接返回了 episodeId（不在 data 中）
    const episodeId = data.episodeId || data.episode_id;

    if (asyncMode) {
        console.log(`[ListenHub] Async mode: returning episodeId immediately:`, episodeId);
        return { episodeId };
    }

    onProgress?.({
      stage: 'generating',
      message: '等待音频生成...',
      percentage: 60
    });
    const audioResult = await getEpisodeAudioUrl(episodeId, config.apiKey, onProgress);
    onProgress?.({
      stage: 'completed',
      message: '完成',
      percentage: 100
    });
    return audioResult;
  } else {
    console.warn('未识别的 API 响应格式:', data);
    throw new Error('API 响应格式异常，无法提取音频 URL');
  }

  onProgress?.({
    stage: 'completed',
    message: '完成',
    percentage: 100
  });

  return result;
}

