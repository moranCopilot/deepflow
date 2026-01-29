/**
 * [INPUT]: 依赖 {ListenHub API} 的 {音频生成能力}
 * [OUTPUT]: 提供 {UGC音频文件}
 * [POS]: scripts 的 {UGC音频生成器}
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

interface UGCItem {
  id: string;
  title: string;
  audioUrl: string;
  scriptUrl: string;
  mode: string;
  duration?: string;
}

interface UGCFlowList {
  id: string;
  title: string;
  items: UGCItem[];
}

interface CommunityContent {
  ugc: UGCFlowList[];
}

/* ========== 配置 ========== */

const LISTENHUB_API_KEY = process.env.LISTENHUB_API_KEY || process.env.MARSWAVE_API_KEY;
const LISTENHUB_BASE_URL = process.env.LISTENHUB_API_BASE_URL || process.env.MARSWAVE_API_BASE_URL || 'https://api.marswave.ai/openapi/v1';

// Speaker 映射
const SPEAKER_ID_MAP: Record<string, string> = {
  '老师': 'CN-Man-Beijing-V2',
  'AI主播': 'CN-Man-Beijing-V2',
  '学生': 'chat-girl-105-cn',
};

const DEFAULT_SPEAKER_ID = 'CN-Man-Beijing-V2';

/* ========== 工具函数 ========== */

function getSpeakerId(speaker: string): string {
  return SPEAKER_ID_MAP[speaker] || DEFAULT_SPEAKER_ID;
}

function prepareFlowSpeechDirectRequest(script: ScriptItem[]) {
  const fullText = script.map(item => item.text).join('\n');
  return {
    sources: [{ type: 'text', content: fullText }],
    speakers: [{ speakerId: DEFAULT_SPEAKER_ID }],
    language: 'zh',
    mode: 'direct'
  };
}

function convertScriptToListenHubFormat(script: ScriptItem[]) {
  return script.map(item => ({
    speakerId: getSpeakerId(item.speaker),
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

/* ========== 主流程 ========== */

async function main() {
  if (!LISTENHUB_API_KEY) {
    console.error('❌ LISTENHUB_API_KEY 未配置');
    process.exit(1);
  }

  // 读取 community-content.json
  const contentPath = path.join(projectRoot, 'public/data/community-content.json');
  const content: CommunityContent = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

  // 创建音频目录
  for (let i = 1; i <= 8; i++) {
    const audioDir = path.join(projectRoot, `public/assets/audio/ugc-${i}`);
    fs.mkdirSync(audioDir, { recursive: true });
  }

  console.log('========================================');
  console.log('UGC 音频生成 - 第二阶段');
  console.log('========================================');
  console.log(`总计: ${content.ugc.length} 个系列, ${content.ugc.reduce((sum, f) => sum + f.items.length, 0)} 个 item`);
  console.log('========================================\n');

  const errors: { itemId: string; error: string }[] = [];
  let completedCount = 0;
  let totalCount = 0;

  // 遍历所有 UGC flowlist
  for (const flowlist of content.ugc) {
    console.log(`📚 系列: ${flowlist.title}`);

    for (const item of flowlist.items) {
      totalCount++;

      // 跳过已生成的音频
      const audioDestPath = path.join(projectRoot, `public/assets/audio/ugc-${flowlist.id.split('-')[1]}/${item.id}.mp3`);
      if (fs.existsSync(audioDestPath)) {
        console.log(`\n[${item.id}] 已存在，跳过`);
        continue;
      }

      try {
        // 读取逐字稿 JSON
        const scriptPath = path.join(projectRoot, `public/data/scripts/ugc/${item.id}.json`);
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
        const audioDestPath = path.join(projectRoot, `public/assets/audio/ugc-${flowlist.id.split('-')[1]}/${audioFileName}`);
        console.log(`  下载音频中...`);
        await downloadAudio(audioResult.url, audioDestPath);
        console.log(`  ✓ 已保存: ${audioFileName}`);

        // 更新 item 字段
        item.audioUrl = `/assets/audio/ugc-${flowlist.id.split('-')[1]}/${audioFileName}`;
        if (audioResult.duration) {
          const minutes = Math.floor(audioResult.duration / 60);
          const seconds = Math.floor(audioResult.duration % 60);
          item.duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

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
  }

  // 写回 community-content.json
  fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf-8');
  console.log('✅ 已更新 community-content.json');

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
  const reportPath = path.join(projectRoot, 'scripts/audio-generation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    completed: completedCount,
    total: totalCount,
    errors
  }, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
