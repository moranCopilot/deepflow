/**
 * ListenHub (MarsWave) TTS API 工具函数
 */

// Speaker 名称到 SpeakerId 的映射
export const SPEAKER_ID_MAP: Record<string, string> = {
  '老师': 'CN-Man-Beijing-V2',
  'Deep': 'CN-Man-Beijing-V2',
  'AI主播': 'CN-Man-Beijing-V2',
  '学生': 'chat-girl-105-cn',
  'Flow': 'chat-girl-105-cn'
};

// 默认 speakerId
const DEFAULT_SPEAKER_ID = 'CN-Man-Beijing-V2';

/**
 * 获取 speakerId，如果找不到则返回默认值
 */
export function getSpeakerId(speaker: string): string {
  return SPEAKER_ID_MAP[speaker] || DEFAULT_SPEAKER_ID;
}

/**
 * Script 项类型定义
 */
export interface ScriptItem {
  speaker: string;
  text: string;
}

/**
 * ListenHub Script-to-Speech 格式
 */
export interface ListenHubScriptItem {
  content: string;
  speakerId: string;
}

/**
 * ListenHub Flow Speech Direct 请求格式
 */
export interface FlowSpeechDirectRequest {
  sources: Array<{
    type: string;
    content: string;
  }>;
  speakers: Array<{
    speakerId: string;
  }>;
  language: string;
  mode: string;
}

/**
 * 将 script 转换为 ListenHub Script-to-Speech 格式
 * 用于深度剖析模式（双人对话）
 */
export function convertScriptToListenHubFormat(script: ScriptItem[]): ListenHubScriptItem[] {
  return script.map(item => ({
    speakerId: getSpeakerId(item.speaker),
    content: item.text
  }));
}

/**
 * 将 script 转换为 Flow Speech Direct 请求格式
 * 用于速听精华模式（单人播报）
 */
export function prepareFlowSpeechDirectRequest(script: ScriptItem[]): FlowSpeechDirectRequest {
  // 合并所有 script 文本
  const fullText = script.map(item => item.text).join('\n');
  
  return {
    sources: [
      {
        type: 'text',
        content: fullText
      }
    ],
    speakers: [
      { speakerId: DEFAULT_SPEAKER_ID } // 默认使用男声
    ],
    language: 'zh',
    mode: 'direct'
  };
}

