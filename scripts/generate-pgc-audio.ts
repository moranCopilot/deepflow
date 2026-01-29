/**
 * [INPUT]: 依赖 {ListenHub API} 的 {音频生成能力}
 * [OUTPUT]: 提供 {PGC音频文件}
 * [POS]: scripts 的 {PGC音频生成器}
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, 'server/.env.local') });

/* ========== 类型定义 ========== */

interface ScriptItem {
  speaker: string;
  text: string;
}

interface GeneratedScript {
  itemId: string;
  title: string;
  mode: string;
  script: ScriptItem[];
}

/* ========== 配置 ========== */

const LISTENHUB_API_KEY = process.env.LISTENHUB_API_KEY || process.env.MARSWAVE_API_KEY;
const LISTENHUB_BASE_URL = process.env.LISTENHUB_API_BASE_URL || process.env.MARSWAVE_API_BASE_URL || 'https://api.marswave.ai/openapi/v1';

// PGC Speaker 映射（使用女声）
const PGC_SPEAKER_ID_MAP: Record<string, string> = {
  '女老师': 'chat-girl-105-cn',
  '学生': 'chat-girl-105-cn',
};

const PGC_DEFAULT_SPEAKER_ID = 'chat-girl-105-cn';

/* ========== 工具函数 ========== */

function getPGCSpeakerId(speaker: string): string {
  return PGC_SPEAKER_ID_MAP[speaker] || PGC_DEFAULT_SPEAKER_ID;
}

function prepareFlowSpeechDirectRequest(script: ScriptItem[]) {
  const fullText = script.map(item => item.text).join('\n');
  return {
    sources: [{ type: 'text', content: fullText }],
    speakers: [{ speakerId: PGC_DEFAULT_SPEAKER_ID }],
    language: 'zh',
    mode: 'direct'
  };
}

function convertScriptToListenHubFormat(script: ScriptItem[]) {
  return script.map(item => ({
    speakerId: getPGCSpeakerId(item.speaker),
    content: item.text
  }));
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 180000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`API 请求超时（${timeoutMs / 1000}秒）`);
    }
    throw error;
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      const delay = 2000 * attempt;
      console.log(`  重试 ${attempt}/${maxRetries}... (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error('API 调用失败');
}

// 轮询获取音频 URL
async function getEpisodeAudioUrl(episodeId: string): Promise<{ url?: string; duration?: number }> {
  const maxPollAttempts = 120; // 10分钟
  let attempts = 0;

  while (attempts < maxPollAttempts) {
    const delayMs = attempts === 0 ? 10000 : 5000;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const response = await fetchWithTimeout(
      `${LISTENHUB_BASE_URL}/flow-speech/episodes/${episodeId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LISTENHUB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      },
      10000
    );

    if (!response.ok) {
      throw new Error(`查询 Episode 状态失败: ${response.status}`);
    }

    const data = await response.json();
    let episode = data;
    if ((data.code === 0 || data.code === '0') && data.data) {
      episode = data.data;
    } else if (data.data) {
      episode = data.data;
    }

    const mp3Url = episode.audioUrl || episode.audio_url || episode.url || episode.audio?.url || data.audioUrl || data.url;
    const status = episode.status || episode.processStatus || data.status;

    if (mp3Url && typeof mp3Url === 'string' && mp3Url.trim().length > 0) {
      if (status !== 'failed' && status !== 'error') {
        console.log(`  ✓ 音频就绪`);
        return {
          url: mp3Url.trim(),
          duration: episode.duration || data.duration
        };
      }
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(episode.error || data.error || '音频生成失败');
    }

    attempts++;
    process.stdout.write(`  轮询中... (${attempts}/${maxPollAttempts})\r`);
  }

  throw new Error('音频生成超时');
}

// 下载音频文件
async function downloadAudio(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载音频失败: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

/* ========== 音频生成函数 ========== */

// 速听精华模式（单人）
async function generateQuickSummaryAudio(script: ScriptItem[]): Promise<{ url?: string; duration?: number }> {
  const requestBody = prepareFlowSpeechDirectRequest(script);
  console.log(`  调用 Flow Speech Direct API...`);

  const response = await callWithRetry(async () => {
    return await fetchWithTimeout(
      `${LISTENHUB_BASE_URL}/flow-speech/episodes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LISTENHUB_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  let episodeId: string | undefined;

  if ((data.code === 0 || data.code === '0') && data.data) {
    episodeId = data.data.episodeId || data.data.episode_id || data.data.id;
  } else if (data.episodeId || data.episode_id) {
    episodeId = data.episodeId || data.episode_id;
  }

  if (!episodeId) {
    // 直接返回 URL
    if (data.url || data.audioUrl || data.audio_url) {
      return {
        url: data.url || data.audioUrl || data.audio_url,
        duration: data.duration
      };
    }
    throw new Error('无法提取 episodeId 或 URL');
  }

  console.log(`  EpisodeId: ${episodeId}`);
  return await getEpisodeAudioUrl(episodeId);
}

// 深度剖析模式（双人对话）
async function generateDeepAnalysisAudio(script: ScriptItem[]): Promise<{ url?: string; duration?: number }> {
  const scripts = convertScriptToListenHubFormat(script);
  console.log(`  调用 Script-to-Speech API...`);

  const response = await callWithRetry(async () => {
    return await fetchWithTimeout(
      `${LISTENHUB_BASE_URL}/speech`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LISTENHUB_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ scripts })
      }
    );
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`  API Response:`, JSON.stringify(data, null, 2));

  // /speech API 直接返回 audioUrl 在 data.data 中
  if (data.code === 0 && data.data) {
    if (data.data.audioUrl) {
      return {
        url: data.data.audioUrl,
        duration: data.data.audioDuration
      };
    }
    if (data.data.url) {
      return {
        url: data.data.url,
        duration: data.data.audioDuration || data.data.duration
      };
    }
  }

  // 检查其他可能的格式
  if (data.audioUrl || data.url) {
    return {
      url: data.audioUrl || data.url,
      duration: data.audioDuration || data.duration
    };
  }

  throw new Error('无法提取音频 URL');
}

/* ========== PGC 内容配置 ========== */

const PGC_ITEMS = [
  { id: 'pgc-1-item-1', flowlistId: 'pgc-1' },
  { id: 'pgc-1-item-2', flowlistId: 'pgc-1' },
  { id: 'pgc-1-item-3', flowlistId: 'pgc-1' },
  { id: 'pgc-2-item-1', flowlistId: 'pgc-2' },
  { id: 'pgc-2-item-2', flowlistId: 'pgc-2' },
  { id: 'pgc-2-item-3', flowlistId: 'pgc-2' },
  { id: 'pgc-3-item-1', flowlistId: 'pgc-3' },
  { id: 'pgc-3-item-2', flowlistId: 'pgc-3' },
  { id: 'pgc-3-item-3', flowlistId: 'pgc-3' }
];

/* ========== 主流程 ========== */

async function main() {
  if (!LISTENHUB_API_KEY) {
    console.error('❌ LISTENHUB_API_KEY 未配置');
    process.exit(1);
  }

  // 创建 PGC 音频目录
  for (let i = 1; i <= 3; i++) {
    const audioDir = path.join(projectRoot, `public/assets/audio/pgc-${i}`);
    fs.mkdirSync(audioDir, { recursive: true });
  }

  console.log('========================================');
  console.log('PGC 音频生成 - 第二阶段');
  console.log('========================================');
  console.log(`总计: 3 个系列, 9 个 item`);
  console.log('========================================\n');

  const errors: { itemId: string; error: string }[] = [];
  let completedCount = 0;
  let totalCount = 0;
  const results: Array<{ itemId: string; audioUrl: string; duration: string }> = [];

  for (const item of PGC_ITEMS) {
    totalCount++;

    const audioDestPath = path.join(projectRoot, `public/assets/audio/${item.flowlistId}/${item.id}.mp3`);

    // 跳过已生成的音频
    if (fs.existsSync(audioDestPath)) {
      console.log(`\n[${item.id}] 已存在，跳过`);
      continue;
    }

    try {
      // 读取逐字稿 JSON
      const scriptPath = path.join(projectRoot, `public/data/scripts/pgc/${item.id}.json`);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`逐字稿文件不存在: ${scriptPath}`);
      }

      const scriptData: GeneratedScript = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));

      console.log(`\n[${item.id}] ${scriptData.title}`);
      console.log(`  模式: ${scriptData.mode === 'quick_summary' ? '速听精华' : '深度剖析'}`);

      // 生成音频
      let audioResult: { url?: string; duration?: number };
      if (scriptData.mode === 'deep_analysis') {
        audioResult = await generateDeepAnalysisAudio(scriptData.script);
      } else {
        audioResult = await generateQuickSummaryAudio(scriptData.script);
      }

      if (!audioResult.url) {
        throw new Error('未能获取音频 URL');
      }

      // 下载音频
      const audioFileName = `${item.id}.mp3`;
      console.log(`  下载音频中...`);
      await downloadAudio(audioResult.url, audioDestPath);
      console.log(`  ✓ 已保存: ${audioFileName}`);

      // 计算时长
      let duration = '05:00';
      if (audioResult.duration) {
        const minutes = Math.floor(audioResult.duration / 60);
        const seconds = Math.floor(audioResult.duration % 60);
        duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      results.push({
        itemId: item.id,
        audioUrl: `/assets/audio/${item.flowlistId}/${audioFileName}`,
        duration
      });

      completedCount++;
      console.log(`  ✅ [${completedCount}/${totalCount}] 完成\n`);

      // 延迟避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      errors.push({ itemId: item.id, error: errorMsg });
      console.error(`  ❌ [${totalCount}] 失败: ${errorMsg}\n`);
    }
  }

  // 生成报告
  console.log('\n========================================');
  console.log('生成完成');
  console.log('========================================');
  console.log(`成功: ${completedCount}/${totalCount}`);
  console.log(`失败: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ 失败列表:');
    errors.forEach(({ itemId, error }) => {
      console.log(`  - ${itemId}: ${error}`);
    });
  }

  // 保存报告
  const reportPath = path.join(projectRoot, 'scripts/pgc-audio-generation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    completed: completedCount,
    total: totalCount,
    errors,
    results
  }, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
