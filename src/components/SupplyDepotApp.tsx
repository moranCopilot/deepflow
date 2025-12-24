import { useState, useRef, type Dispatch, type SetStateAction, useEffect, useMemo } from 'react';
import { Camera, FileText, Mic, Package, Play, Pause, Loader2, Sparkles, Brain, Library, Tag, X, AlignLeft, Radio, MessageCircle, Plus, AlertCircle, Mic2, Square, Copy, Check, Trash2, Car, Home, Focus, Moon, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveSession } from '../hooks/useLiveSession';
import { PackingAnimation } from './PackingAnimation';
import { getApiUrl } from '../utils/api-config';
import { cacheManager } from '../utils/cache-manager';
import { generateFileHash, generateScriptHash } from '../utils/file-utils';
import Hls from 'hls.js';

export interface KnowledgeCard {
    id: string;
    title: string;
    content: string;
    tags: string[];
    timestamp: Date;
}

interface RawInput {
    id: string;
    type: string;
    name?: string;
    time: string;
    timestamp: number;
}

type SceneTag = 'commute' | 'home_charge' | 'focus' | 'sleep_meditation' | 'qa_memory' | 'daily_review' | 'default';

interface FlowItem {
    id: string;
    title: string;
    duration: string;
    type: string;
    tldr: string;
    subtitles: { time: string; text: string }[];
    status: 'ready' | 'playing' | 'completed';
    scenes: string[];
    subject: string;
    mode: 'single' | 'dual';
    contentType: 'output' | 'discussion' | 'interactive';
    script?: { speaker: string; text: string }[];
    knowledgeCards?: KnowledgeCard[];
    sceneTag?: SceneTag;
    playbackProgress?: {
        startedAt?: number;
        lastPlayedAt?: number;
        totalPlayedSeconds?: number;
        progressPercentage?: number;
        hasStarted?: boolean;
    };
    isGenerating?: boolean;
    generationProgress?: string;
}

export interface FlowPlaybackState {
  isPlaying: boolean;
  currentText: string;
  playbackMode: 'audio' | 'live';
}

interface SupplyDepotAppProps {
  onStartFlow: () => void;
  onStopFlow: () => void;
  isFlowing: boolean;
  knowledgeCards: KnowledgeCard[];
  onUpdateKnowledgeCards: Dispatch<SetStateAction<KnowledgeCard[]>>;
  currentContext: 'deep_work' | 'casual';
  onContextChange: (context: 'deep_work' | 'casual') => void;
  onPlaybackStateChange?: (state: FlowPlaybackState) => void;
}

export function SupplyDepotApp({ onStartFlow, onStopFlow, isFlowing, knowledgeCards, onUpdateKnowledgeCards, onPlaybackStateChange }: SupplyDepotAppProps) {
  const [rawInputs, setRawInputs] = useState<RawInput[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentInputType, setCurrentInputType] = useState<string>('');
  
  const [archivedInputs, setArchivedInputs] = useState<RawInput[]>([]);
  const [flowItems, setFlowItems] = useState<FlowItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [readyToFlow, setReadyToFlow] = useState(false);
  const [gardenTab, setGardenTab] = useState<'cards' | 'files' | 'cache'>('cards');
  const [cacheStats, setCacheStats] = useState<{ files: number; audio: number; metadata: number } | null>(null);
  const [selectedItem, setSelectedItem] = useState<FlowItem | null>(null);
  const [filterPreset, setFilterPreset] = useState('all');
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [isGardenOpen, setIsGardenOpen] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ show: boolean; fileId: string | null; fileName: string | null }>({ show: false, fileId: null, fileName: null });
  const hlsRef = useRef<Hls | null>(null);
  
  // 今日复盘相关状态
  const [hasTriggeredReview, setHasTriggeredReview] = useState(false);

  // Generation Preferences
  const [genPreset, setGenPreset] = useState('quick_summary');
  const [generationPreferences, setGenerationPreferences] = useState({
    duration: 'short',
    mode: 'single',
    type: 'output',
    preset: 'quick_summary'
  });

  const PRESETS: Record<string, { label: string, duration: string, mode: string, type: string }> = {
      quick_summary: { label: '速听精华', duration: 'short', mode: 'single', type: 'output' },
      deep_analysis: { label: '深度剖析', duration: 'long', mode: 'dual', type: 'discussion' },
      interactive_practice: { label: '提问练习', duration: 'medium', mode: 'dual', type: 'interactive' }
  };

  // 场景标签体系定义
  const SCENE_CONFIGS: Record<SceneTag, { tag: SceneTag; label: string; icon: any; description: string }> = {
    commute: {
      tag: 'commute',
      label: '回家路上',
      icon: Car,
      description: '通勤、步行或驾驶途中'
    },
    home_charge: {
      tag: 'home_charge',
      label: '在家充电',
      icon: Home,
      description: '居家恢复'
    },
    focus: {
      tag: 'focus',
      label: '静坐专注',
      icon: Focus,
      description: '专注学习'
    },
    sleep_meditation: {
      tag: 'sleep_meditation',
      label: '睡前冥想',
      icon: Moon,
      description: '睡前放松'
    },
    qa_memory: {
      tag: 'qa_memory',
      label: '问答式记忆',
      icon: MessageCircle,
      description: '记忆强化'
    },
    daily_review: {
      tag: 'daily_review',
      label: '今日复盘',
      icon: RefreshCw,
      description: '今日学习复盘'
    },
    default: {
      tag: 'default',
      label: '默认',
      icon: Radio,
      description: '通用场景'
    }
  };

  // 场景标签映射函数
  const getSceneTagFromTitle = (title: string, contentCategory?: string, sceneTag?: SceneTag, summary?: string): SceneTag => {
    // 如果后端返回了 sceneTag，优先使用
    if (sceneTag && SCENE_CONFIGS[sceneTag]) {
      return sceneTag;
    }
    
    // 根据文件名前缀推断
    if (title.startsWith('回家路上：')) return 'commute';
    if (title.startsWith('静坐专注：')) return 'focus';
    if (title.startsWith('问答式记忆：')) return 'qa_memory';
    if (title.startsWith('在家充电：')) return 'home_charge';
    if (title === '睡前冥想' || title.startsWith('睡前冥想')) return 'sleep_meditation';
    
    // 根据内容类型推断
    if (contentCategory === 'history') return 'commute';
    if (contentCategory === 'math_geometry') return 'focus';
    if (contentCategory === 'language') return 'qa_memory';
    
    // 根据标题和摘要中的关键词推断（用于问答式记忆）
    const textToCheck = `${title} ${summary || ''}`.toLowerCase();
    const qaMemoryKeywords = ['语文', '古诗', '诗文', '诗词', '文言文', 'english', '英语', 'language'];
    if (qaMemoryKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
      return 'qa_memory';
    }
    
    // 根据标题和摘要中的关键词推断（用于历史相关）
    const historyKeywords = ['历史', 'history', '古代', '朝代', '历史事件'];
    if (historyKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
      return 'commute';
    }
    
    // 根据标题和摘要中的关键词推断（用于数学几何）
    const mathKeywords = ['数学', '几何', 'math', 'geometry', '几何图形', '数学题'];
    if (mathKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
      return 'focus';
    }
    
    return 'default';
  };

  // 文件名前缀映射
  const prefixMap: Record<string, string> = {
    'history': '回家路上：',
    'math_geometry': '静坐专注：',
    'language': '问答式记忆：'
  };

  // 预生成 FlowItem 定义（带生成状态）
  const getDefaultFlowItems = (): FlowItem[] => [
    {
      id: 'default-1',
      title: '睡前冥想',
      duration: '10:00',
      type: 'meditation',
      tldr: '放松身心，准备入睡',
      subtitles: [],
      status: 'ready',
      scenes: ['casual'],
      subject: 'wellness',
      mode: 'single',
      contentType: 'output',
      sceneTag: 'sleep_meditation',
      isGenerating: true,
      generationProgress: '正在生成中...',
      playbackProgress: { hasStarted: false }
    },
    {
      id: 'default-2',
      title: '听首歌放松一下',
      duration: '5:00',
      type: 'music',
      tldr: '轻松音乐，放松心情',
      subtitles: [],
      status: 'ready',
      scenes: ['casual'],
      subject: 'music',
      mode: 'single',
      contentType: 'output',
      sceneTag: 'sleep_meditation',
      isGenerating: true,
      generationProgress: '正在生成中...',
      playbackProgress: { hasStarted: false }
    },
    {
      id: 'default-3',
      title: '在家充电：科技时事',
      duration: '15:00',
      type: 'tech',
      tldr: '了解最新科技动态',
      subtitles: [],
      status: 'ready',
      scenes: ['casual'],
      subject: 'tech',
      mode: 'single',
      contentType: 'output',
      sceneTag: 'home_charge',
      isGenerating: true,
      generationProgress: '正在生成中...',
      playbackProgress: { hasStarted: false }
    }
  ];


  // 复盘上下文收集函数
  interface ReviewContext {
    items: Array<{
      id: string;
      title: string;
      playbackProgress: {
        totalPlayedSeconds: number;
        progressPercentage: number;
      };
      content: string;
      sceneTag: SceneTag;
      contentType: string;
      dialogueContent?: Array<{ speaker: string; text: string }>;
    }>;
    knowledgeCards: Array<{
      title: string;
      content: string;
      tags: string[];
      timestamp: Date;
    }>;
  }

  const collectReviewContext = (): ReviewContext => {
    // 筛选已播放的 items（至少5条）
    const playedItems = flowItems
      .filter(item => item.playbackProgress?.hasStarted === true)
      .slice(0, 10); // 最多取10条
    
    const items = playedItems.map(item => ({
      id: item.id,
      title: item.title,
      playbackProgress: {
        totalPlayedSeconds: item.playbackProgress?.totalPlayedSeconds || 0,
        progressPercentage: item.playbackProgress?.progressPercentage || 0
      },
      content: item.tldr || (item.script ? item.script.map(s => s.text).join(' ') : ''),
      sceneTag: item.sceneTag || 'default',
      contentType: item.contentType,
      dialogueContent: item.sceneTag === 'qa_memory' && item.script ? item.script : undefined
    }));

    // 收集知识卡片（最近的相关卡片）
    const recentKnowledgeCards = knowledgeCards
      .slice(0, 10)
      .map(card => ({
        title: card.title,
        content: card.content,
        tags: card.tags,
        timestamp: card.timestamp
      }));

    return {
      items,
      knowledgeCards: recentKnowledgeCards
    };
  };

  // 触发今日复盘
  const triggerDailyReview = async () => {
    // 1. 立即插入"正在生成中"的占位 Item
    const placeholderItem: FlowItem = {
      id: `review-placeholder-${Date.now()}`,
      title: '今日复盘',
      duration: '--:--',
      type: 'review',
      tldr: '正在生成中...',
      subtitles: [],
      status: 'ready',
      scenes: ['casual'],
      subject: 'review',
      mode: 'single',
      contentType: 'output',
      sceneTag: 'daily_review',
      isGenerating: true,
      generationProgress: '正在分析你的学习内容...',
      playbackProgress: {
        hasStarted: false
      }
    };
    
    // 插入占位 Item 到列表最前面
    setFlowItems(prev => [placeholderItem, ...prev]);
    
    try {
      // 2. 收集上下文
      const context = collectReviewContext();
      
      // 3. 更新占位 Item 的生成进度
      setFlowItems(prev => prev.map(item => 
        item.id === placeholderItem.id 
          ? { ...item, generationProgress: '正在生成复盘内容...' }
          : item
      ));
      
      // 4. 调用后端 API 生成脚本
      const reviewResponse = await fetch(getApiUrl('/api/review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
      });
      
      if (!reviewResponse.ok) {
        throw new Error(`API 错误: ${reviewResponse.status}`);
      }
      
      const reviewData = await reviewResponse.json();
      
      // 5. 更新生成进度
      setFlowItems(prev => prev.map(item => 
        item.id === placeholderItem.id 
          ? { ...item, generationProgress: '正在生成音频...' }
          : item
      ));
      
      // 6. 生成 TTS 音频
      const scriptText = reviewData.script.map((s: { speaker: string; text: string }) => s.text).join('\n');
      const ttsResponse = await fetch(getApiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scriptText })
      });
      
      if (!ttsResponse.ok) {
        throw new Error(`TTS API 错误: ${ttsResponse.status}`);
      }
      
      await ttsResponse.json(); // TTS 音频已生成，这里不需要使用返回值
      
      // 7. 替换占位 Item 为实际的 FlowItem
      const reviewItem: FlowItem = {
        id: placeholderItem.id,  // 保持相同的 ID
        title: reviewData.title || '今日复盘',
        duration: '10:00', // 估算或从 TTS 获取
        type: 'review',
        tldr: reviewData.summary || '今日学习复盘总结',
        subtitles: reviewData.script.map((line: { speaker: string; text: string }, index: number) => ({
          time: `00:${index < 10 ? '0' + index : index}0`,
          text: line.text
        })),
        status: 'ready',
        scenes: ['casual'],
        subject: 'review',
        mode: 'single',
        contentType: 'output',
        script: reviewData.script,
        sceneTag: 'daily_review',
        isGenerating: false,
        playbackProgress: {
          hasStarted: false
        }
      };
      
      // 替换占位 Item
      setFlowItems(prev => prev.map(item => 
        item.id === placeholderItem.id ? reviewItem : item
      ));
      
      // 8. 标记已触发
      setHasTriggeredReview(true);
    } catch (error) {
      // 生成失败，移除占位 Item 或显示错误状态
      console.error('复盘生成失败:', error);
      setFlowItems(prev => prev.filter(item => item.id !== placeholderItem.id));
      // 可选：显示错误提示
      alert('复盘生成失败，请稍后重试');
    }
  };

  useEffect(() => {
      const p = PRESETS[genPreset];
      if (p) {
          setGenerationPreferences({
              duration: p.duration,
              mode: p.mode,
              type: p.type,
              preset: genPreset
          });
      }
  }, [genPreset]);

  // Load archived inputs from localStorage on mount
  useEffect(() => {
      try {
          const stored = localStorage.getItem('deepflow_archived_inputs');
          if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed)) {
                  setArchivedInputs(parsed);
              }
          }
      } catch (error) {
          console.error('Failed to load archived inputs from localStorage:', error);
      }
  }, []);

  // Save archived inputs to localStorage whenever they change
  useEffect(() => {
      try {
          localStorage.setItem('deepflow_archived_inputs', JSON.stringify(archivedInputs));
      } catch (error) {
          console.error('Failed to save archived inputs to localStorage:', error);
      }
  }, [archivedInputs]);


  // Audio Player State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioParts, setAudioParts] = useState<string[]>([]);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  
  // TTS 生成进度状态
  const [ttsProgress, setTTSProgress] = useState<{
    stage: string;
    message: string;
    percentage?: number;
  } | null>(null);

  // Fullscreen Flow Mode State
  const [currentSceneTag, setCurrentSceneTag] = useState<SceneTag>('default');
  const [currentPlayingItem, setCurrentPlayingItem] = useState<FlowItem | null>(null);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);

  // Live Session State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const liveSession = useLiveSession(
      selectedItem?.script?.map(s => `${s.speaker}: ${s.text}`).join('\n') || '',
      selectedItem?.knowledgeCards || [],
      () => {
          console.log("Live Connected");
          if (selectedItem) {
              setFlowItems(prev => prev.map(item => {
                  if (item.id === selectedItem.id) {
                      return {
                          ...item,
                          playbackProgress: {
                              ...item.playbackProgress,
                              hasStarted: true,
                              startedAt: item.playbackProgress?.startedAt || Date.now(),
                              lastPlayedAt: Date.now()
                          }
                      };
                  }
                  return item;
              }));
          }
      },
      () => {
          console.log("Live Disconnected");
          setIsLiveMode(false);
      },
      (error) => {
          console.error("Live Session Error:", error);
          const errorMessage = error?.message || "连接实时服务失败";
          
          // Show user-friendly error message
          alert(errorMessage);
          setIsLiveMode(false);
      }
  );

  useEffect(() => {
      if (isLiveMode && !liveSession.isConnected) {
          // Validate selectedItem and script before connecting
          if (!selectedItem) {
              alert('请先选择一个学习内容才能启动实时练习。');
              setIsLiveMode(false);
              return;
          }

          if (!selectedItem.script || selectedItem.script.length === 0) {
              alert('所选内容没有可用的脚本，无法启动实时练习。请选择包含对话脚本的学习材料。');
              setIsLiveMode(false);
              return;
          }

          const scriptText = selectedItem.script.map(s => `${s.speaker}: ${s.text}`).join('\n');
          if (!scriptText || scriptText.trim().length === 0) {
              alert('脚本内容为空，无法启动实时练习。请选择包含有效脚本内容的学习材料。');
              setIsLiveMode(false);
              return;
          }

          // Connect to live session
          liveSession.connect().catch((error: any) => {
              console.error("Failed to start live session:", error);
              const errorMessage = error?.message || '未知错误';
              alert(`无法启动实时会话：${errorMessage}\n\n注意：Vercel Serverless Functions 不支持 WebSocket，此功能需要单独部署 WebSocket 服务器。`);
              setIsLiveMode(false);
          });
      }
      return () => {
          if (isLiveMode && liveSession.isConnected) {
              try {
                  liveSession.disconnect();
              } catch (error) {
                  console.error("Error disconnecting:", error);
              }
          }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode, selectedItem]);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (audioUrl && audioRef.current) {
      const isHls = audioUrl.endsWith('.m3u8') || audioUrl.includes('m3u8');
      
      if (isHls && Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(audioUrl);
        hls.attachMedia(audioRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audioRef.current?.play().catch(err => {
             console.error('HLS Play failed:', err);
             setAudioError('播放失败，请重试');
          });
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
             if (data.fatal) {
                 console.error('HLS Fatal Error:', data);
                 setAudioError('播放出错');
                 switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    hls.startLoad();
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                default:
                    hls.destroy();
                    break;
                }
             }
        });
      } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(err => {
            console.error('Native HLS Play failed:', err);
            setAudioError('播放失败: 无法播放此音频格式');
        });
      } else {
        // Standard playback (MP3/WAV) - Fallback
        // If it's an m3u8 file and we reached here, it means neither HLS.js nor Native HLS is supported
        if (isHls) {
            console.error('HLS playback not supported on this browser');
            setAudioError('您的浏览器不支持 HLS 音频播放，请尝试使用 Chrome 或 Safari');
            return;
        }
        
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(err => {
            console.error('Play failed:', err);
            // Handle specific NotSupportedError
            if (err.name === 'NotSupportedError') {
                setAudioError('播放失败: 浏览器不支持此音频格式');
            } else {
                setAudioError('播放失败，请重试');
            }
        });
      }
    }
    
    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
  }, [audioUrl]);

  // 时间格式化函数
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 进度条拖动处理
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // 辅助函数：将时长字符串转换为秒数
  const parseDurationToSeconds = (duration: string): number => {
    const parts = duration.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  };

  // 播放进度跟踪：每秒更新播放时长
  useEffect(() => {
    if (selectedItem && selectedItem.status === 'playing' && selectedItem.playbackProgress?.hasStarted) {
      const interval = setInterval(() => {
        setFlowItems(prev => prev.map(item => {
          if (item.id === selectedItem.id && item.playbackProgress) {
            const newTotalSeconds = (item.playbackProgress.totalPlayedSeconds || 0) + 1;
            const durationSeconds = parseDurationToSeconds(item.duration);
            const progressPercentage = durationSeconds > 0 
              ? Math.min(100, (newTotalSeconds / durationSeconds) * 100)
              : 0;
            
            return {
              ...item,
              playbackProgress: {
                ...item.playbackProgress,
                totalPlayedSeconds: newTotalSeconds,
                progressPercentage,
                lastPlayedAt: Date.now()
              }
            };
          }
          return item;
        }));
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [selectedItem, selectedItem?.status, selectedItem?.playbackProgress?.hasStarted]);

  // 播放计数和触发检测：当达到5条时触发复盘
  useEffect(() => {
    const playedCount = flowItems.filter(item => item.playbackProgress?.hasStarted === true).length;
    
    if (playedCount >= 5 && !hasTriggeredReview) {
      // 触发复盘流程
      triggerDailyReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowItems, hasTriggeredReview]);

  // 获取可播放的音频项（排除 interactive 类型）
  const getPlayableItems = (items: FlowItem[], sceneTag?: SceneTag): FlowItem[] => {
    return items.filter(item => 
      item.script && 
      item.script.length > 0 && 
      item.contentType !== 'interactive' &&
      (!sceneTag || item.sceneTag === sceneTag || (!item.sceneTag && sceneTag === 'default'))
    );
  };

  // 获取所有场景类型的数组 (Filter scenes that have content)
  const sceneTagsArray = useMemo(() => {
    const allTags: SceneTag[] = ['commute', 'home_charge', 'focus', 'sleep_meditation', 'qa_memory', 'daily_review', 'default'];
    // Only include scenes that have playable items
    return allTags.filter(tag => getPlayableItems(flowItems, tag).length > 0);
  }, [flowItems]);

  // Ensure we are on a valid scene (Validation Effect)
  useEffect(() => {
    if (isFlowing && sceneTagsArray.length > 0 && !sceneTagsArray.includes(currentSceneTag)) {
       // If current scene is empty/invalid, switch to the first available one
       const firstAvailable = sceneTagsArray[0];
       setCurrentSceneTag(firstAvailable);
       
       // Also trigger audio change if needed
       const playableItems = getPlayableItems(flowItems, firstAvailable);
       if (playableItems.length > 0) {
         const firstItem = playableItems[0];
         if (audioRef.current) {
            audioRef.current.pause();
            setIsAudioPlaying(false);
         }
         setCurrentPlayingItem(firstItem);
         setSelectedItem(firstItem);
         handlePlayAudio(firstItem);
       }
    }
  }, [isFlowing, sceneTagsArray, currentSceneTag, flowItems]);

  // Calculate current subtitle
  const currentSubtitle = useMemo(() => {
    if (!currentPlayingItem?.subtitles) return '';
    // Find the last subtitle that has time <= currentTime
    const activeSubtitle = [...currentPlayingItem.subtitles].reverse().find(sub => {
       const seconds = parseDurationToSeconds(sub.time);
       return seconds <= currentTime;
    });
    return activeSubtitle?.text || '';
  }, [currentPlayingItem, currentTime]);

  // Sync playback state
  useEffect(() => {
     if (onPlaybackStateChange) {
         onPlaybackStateChange({
             isPlaying: isAudioPlaying,
             currentText: currentSubtitle || currentPlayingItem?.title || 'Listening...',
             playbackMode: isLiveMode ? 'live' : 'audio'
         });
     }
  }, [isAudioPlaying, currentSubtitle, currentPlayingItem, isLiveMode, onPlaybackStateChange]);

  // 自动播放逻辑：进入全屏心流页面时自动播放 (Enhanced)
  useEffect(() => {
    if (isFlowing && !hasAutoPlayed && sceneTagsArray.length > 0) {
      // Use the first valid scene from our filtered list
      const targetScene = sceneTagsArray[0];
      
      // If we are not on a valid scene, switch to it
      if (currentSceneTag !== targetScene) {
          setCurrentSceneTag(targetScene);
      }

      const playableItems = getPlayableItems(flowItems, targetScene);
      if (playableItems.length > 0) {
        const firstItem = playableItems[0];
        // Only play if we are not already playing it
        if (currentPlayingItem?.id !== firstItem.id) {
            setCurrentPlayingItem(firstItem);
            setSelectedItem(firstItem);
            handlePlayAudio(firstItem);
            setHasAutoPlayed(true);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlowing, hasAutoPlayed, sceneTagsArray]); // Removed flowItems dependency to avoid loops, rely on sceneTagsArray which depends on flowItems

  // 退出全屏时重置状态
  useEffect(() => {
    if (!isFlowing) {
      setHasAutoPlayed(false);
      setCurrentSceneTag('default');
      setCurrentPlayingItem(null);
      if (audioRef.current) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
    }
  }, [isFlowing]);

  // 同步当前播放项状态
  useEffect(() => {
    if (selectedItem && selectedItem.status === 'playing') {
      setCurrentPlayingItem(selectedItem);
    }
  }, [selectedItem]);

  const handlePlayAudio = async (item: FlowItem) => {
    console.log('[PlayAudio] Starting for item:', item.id, item.contentType);
    if (!item.script) return;
    
    // 实时练习类 items 不应该调用 TTS API
    if (item.contentType === 'interactive') {
      console.warn('Interactive items should use live session, not TTS');
      return;
    }
    
    setIsPlayingAudio(true);
    setAudioError(null);
    setAudioUrl(null);
    setAudioParts([]);
    setCurrentPartIndex(0);
    setCurrentTime(0);
    setDuration(0);
    
    // 检查音频缓存
    try {
      const scriptHash = await generateScriptHash(item.script);
      const preset = item.contentType === 'output' ? 'quick_summary' : item.contentType === 'discussion' ? 'deep_analysis' : '';
      
      if (preset) {
        const cachedAudioUrl = await cacheManager.getCachedAudioUrl(scriptHash, preset);
        if (cachedAudioUrl) {
          console.log('[Cache] 使用缓存的音频');
          
          // 模拟 TTS 生成流程的 loading（3-5 秒）
          setTTSProgress({ stage: 'preparing', message: '准备生成音频...', percentage: 10 });
          
          await new Promise(resolve => setTimeout(resolve, 800));
          setTTSProgress({ stage: 'calling-api', message: '调用 TTS API...', percentage: 30 });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          setTTSProgress({ stage: 'processing', message: '处理音频数据...', percentage: 60 });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          setTTSProgress({ stage: 'generating', message: '生成音频中...', percentage: 80 });
          
          await new Promise(resolve => setTimeout(resolve, 800));
          setTTSProgress({ stage: 'completed', message: '完成', percentage: 100 });
          
          await new Promise(resolve => setTimeout(resolve, 400));
          
          // 延迟后设置音频
          setTTSProgress(null);
          setAudioUrl(cachedAudioUrl);
          setAudioParts([cachedAudioUrl]);
          setCurrentPartIndex(0);
          setIsPlayingAudio(false);
          
          // 标记 item 为已开始播放
          setFlowItems(prev => prev.map(flowItem => {
            if (flowItem.id === item.id) {
              return {
                ...flowItem,
                status: 'playing' as const,
                playbackProgress: {
                  ...flowItem.playbackProgress,
                  hasStarted: true,
                  startedAt: flowItem.playbackProgress?.startedAt || Date.now(),
                  lastPlayedAt: Date.now()
                }
              };
            }
            return flowItem;
          }));
          return; // 直接使用缓存，跳过 API 调用
        }
      }
    } catch (error) {
      console.error('[Cache] 检查音频缓存失败:', error);
      // 继续正常流程
    }
    
    setTTSProgress({ stage: 'preparing', message: '准备生成音频...', percentage: 0 });
    
    // 标记 item 为已开始播放
    setFlowItems(prev => prev.map(flowItem => {
      if (flowItem.id === item.id) {
        return {
          ...flowItem,
          status: 'playing' as const,
          playbackProgress: {
            ...flowItem.playbackProgress,
            hasStarted: true,
            startedAt: flowItem.playbackProgress?.startedAt || Date.now(),
            lastPlayedAt: Date.now()
          }
        };
      }
      return flowItem;
    }));

    // 检查脚本是否为空
    if (!item.script || item.script.length === 0) {
        console.warn('[SupplyDepot] Script is empty, skipping TTS generation');
        setAudioError('无法生成音频：脚本内容为空');
        setIsPlayingAudio(false);
        setTTSProgress(null);
        return;
    }

    try {
      // 判断使用哪种模式
      const isQuickSummary = item.contentType === 'output';
      const isDeepAnalysis = item.contentType === 'discussion';
      
      // 1. 创建任务
      const requestPayload = {
        script: item.script,
        preset: isQuickSummary ? 'quick_summary' : isDeepAnalysis ? 'deep_analysis' : undefined,
        contentType: item.contentType
      };
      
      console.log('[SupplyDepot] Creating TTS task with payload:', JSON.stringify(requestPayload).substring(0, 200) + '...');

      const createResponse = await fetch(getApiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });
      
      const createData = await createResponse.json();
      
      if (!createResponse.ok) {
        throw new Error(createData.error || 'TTS 任务创建失败');
      }
      
      const { taskId } = createData;
      
      let result: { url?: string; urls?: string[]; duration?: number };

      // 如果 POST 请求直接返回了结果（如 Google TTS Fallback），则跳过轮询
      if (createData.status === 'completed' && createData.result) {
          console.log('[TTS] Task completed immediately', { 
              provider: createData.provider, 
              fallbackReason: createData.fallbackReason 
          });
          if (createData.fallbackReason) {
              console.warn('[TTS] Warning: Fallback occurred:', createData.fallbackReason);
          }
          result = createData.result;
          setTTSProgress(null);
      } else {
          if (!taskId) {
            throw new Error('未收到任务 ID');
          }
          
          // 2. 轮询任务状态
          const pollTaskStatus = async (): Promise<{ url?: string; urls?: string[]; duration?: number }> => {
            const maxAttempts = 60; // 最多轮询 5 分钟（每 5 秒一次）
            let attempts = 0;
            
            return new Promise((resolve, reject) => {
              const poll = async () => {
                try {
                  const statusResponse = await fetch(`${getApiUrl('/api/tts')}?taskId=${taskId}`);
                  const status = await statusResponse.json();
                  
                  // 更新进度显示
                  if (status.progress) {
                    setTTSProgress({
                      stage: status.progress.stage || 'processing',
                      message: status.progress.message || '处理中...',
                      percentage: status.progress.percentage
                    });
                  }
                  
                  if (status.status === 'completed') {
                    setTTSProgress(null);
                    if (status.result) {
                      resolve(status.result);
                    } else {
                      reject(new Error('任务完成但未返回结果'));
                    }
                  } else if (status.status === 'failed') {
                    setTTSProgress(null);
                    reject(new Error(status.error || 'TTS 生成失败'));
                  } else if (attempts >= maxAttempts) {
                    setTTSProgress(null);
                    reject(new Error('TTS 生成超时，请稍后重试'));
                  } else {
                    attempts++;
                    setTimeout(poll, 5000); // 每 5 秒轮询一次，降低频率
                  }
                } catch (error: any) {
                  setTTSProgress(null);
                  reject(error);
                }
              };
              
              poll();
            });
          };
          
          // 3. 等待任务完成并设置音频 URL
          result = await pollTaskStatus();
      }
      
      // 缓存音频
      try {
        const scriptHash = await generateScriptHash(item.script);
        const preset = isQuickSummary ? 'quick_summary' : isDeepAnalysis ? 'deep_analysis' : '';
        
        if (preset && result.url) {
          // 获取音频 Blob
          const audioResponse = await fetch(result.url.startsWith('data:') ? result.url : `${getApiUrl('/api/proxy-audio')}?url=${encodeURIComponent(result.url)}`);
          const audioBlob = await audioResponse.blob();
          
          await cacheManager.cacheAudio(scriptHash, preset, audioBlob, {
            duration: result.duration,
            contentType: audioBlob.type || 'audio/mpeg'
          });
          console.log('[Cache] 音频已缓存:', scriptHash, preset);
        }
      } catch (error) {
        console.error('[Cache] 音频缓存失败:', error);
        // 缓存失败不影响正常流程
      }
      
      if (result.url) {
        let proxyUrl = result.url;
        if (!result.url.startsWith('data:')) {
          proxyUrl = `${getApiUrl('/api/proxy-audio')}?url=${encodeURIComponent(result.url)}`;
        }
        setAudioUrl(proxyUrl);
        setAudioParts([proxyUrl]);
        setCurrentPartIndex(0);
      } else if (result.urls && Array.isArray(result.urls)) {
        const parts: string[] = result.urls
          .map((u: string | { url?: string }) => (typeof u === 'string' ? u : u.url || ''))
          .filter((u) => u.length > 0)
          .map((u) => {
            if (u.startsWith('data:')) return u;
            return `${getApiUrl('/api/proxy-audio')}?url=${encodeURIComponent(u)}`;
          });

        if (parts.length === 0) {
          throw new Error('No valid audio URLs returned');
        }

        setAudioParts(parts);
        setCurrentPartIndex(0);
        setAudioUrl(parts[0]);
      } else {
        throw new Error('Invalid API response format');
      }
      
      // 如果API返回了duration，更新FlowItem
      if (result.duration && item) {
        const minutes = Math.floor(result.duration / 60);
        const seconds = Math.floor(result.duration % 60);
        const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        setFlowItems(prev => prev.map(flowItem => {
          if (flowItem.id === item.id && flowItem.duration !== formattedDuration) {
            return { ...flowItem, duration: formattedDuration };
          }
          return flowItem;
        }));
      }
    } catch (error: any) {
      console.error("TTS Error", error);
      setIsPlayingAudio(false);
      setTTSProgress(null);
      setAudioError(error.message || "音频生成失败，请重试");
    }
  };

  const handleAudioError = (e: any) => {
      console.error("Audio Load Error", e);
      setAudioError("Failed to load audio segment. Network error or format not supported.");
  };

  const renderAudioPlayer = () => (
      <audio
          ref={audioRef}
          className="hidden"
          src={audioUrl || undefined}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || 0);
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime || 0);
            }
          }}
          onError={handleAudioError}
          onPlay={() => setIsAudioPlaying(true)}
          onPause={() => {
            setIsAudioPlaying(false);
            if (selectedItem) {
              setFlowItems(prev => prev.map(item => {
                if (item.id === selectedItem.id && item.status === 'playing') {
                  return {
                    ...item,
                    status: 'ready' as const
                  };
                }
                return item;
              }));
            }
          }}
          onEnded={() => {
            setIsPlayingAudio(false);
            setIsAudioPlaying(false);
            if (audioParts.length > 0 && currentPartIndex < audioParts.length - 1) {
              const nextIndex = currentPartIndex + 1;
              const nextUrl = audioParts[nextIndex];
              setCurrentPartIndex(nextIndex);
              setAudioUrl(nextUrl);
              setCurrentTime(0);
              setDuration(0);
              return;
            }
            if (selectedItem) {
              setFlowItems(prev => prev.map(item => {
                if (item.id === selectedItem.id) {
                  return {
                    ...item,
                    status: 'completed' as const
                  };
                }
                return item;
              }));
            }
        }}
      />
  );

  const convertScriptToMarkdown = (script: { speaker: string; text: string }[]): string => {
      if (!script || script.length === 0) return '';
      
      const markdown = script.map((line) => {
          return `## ${line.speaker}\n\n${line.text}`;
      }).join('\n\n');
      
      return markdown;
  };

  const copyScriptAsMarkdown = async () => {
      if (!selectedItem?.script) return;
      
      const markdown = convertScriptToMarkdown(selectedItem.script);
      
      try {
          await navigator.clipboard.writeText(markdown);
          setCopiedScript(true);
          setTimeout(() => setCopiedScript(false), 2000);
      } catch (error) {
          console.error('Failed to copy:', error);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = markdown;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          try {
              document.execCommand('copy');
              setCopiedScript(true);
              setTimeout(() => setCopiedScript(false), 2000);
          } catch (err) {
              console.error('Fallback copy failed:', err);
          }
          document.body.removeChild(textArea);
      }
  };

  const addRawInput = (type: string) => {
    setCurrentInputType(type);
    if (fileInputRef.current) {
        // Reset value to allow selecting the same file again
        fileInputRef.current.value = '';
        if (type === '图片') fileInputRef.current.accept = "image/*";
        else if (type === '录音') fileInputRef.current.accept = "audio/*";
        else fileInputRef.current.accept = ".pdf,.doc,.docx,.txt";
        fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        
        // 检查缓存
        for (const file of files) {
          try {
            const fileHash = await generateFileHash(file);
            const isCached = await cacheManager.isFileCached(file);
            
            if (isCached) {
              console.log('[Cache] 使用缓存的文件:', file.name);
              
              // 检查是否有对应的 FlowItem 缓存
              const cachedFlowItem = cacheManager.getCachedFlowItem(fileHash, genPreset);
              if (cachedFlowItem) {
                console.log('[Cache] 使用缓存的 FlowItem');
                
                // 模拟生成流程的 loading（3-5 秒）
                setIsGenerating(true);
                setGenerationProgress('正在处理文件...');
                
                await new Promise(resolve => setTimeout(resolve, 800));
                setGenerationProgress('正在上传文件...');
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                setGenerationProgress('正在分析内容...');
                
                await new Promise(resolve => setTimeout(resolve, 800));
                setGenerationProgress('正在生成内容...');
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                setGenerationProgress('正在处理结果...');
                
                await new Promise(resolve => setTimeout(resolve, 400));
                
                // 延迟后显示结果
                setIsGenerating(false);
                setGenerationProgress('');
                
                // 直接使用缓存的 flowItem
                setFlowItems(prev => {
                  // 检查是否已存在（避免重复添加）
                  const exists = prev.some(item => item.id === cachedFlowItem.id);
                  if (exists) {
                    return prev;
                  }
                  return [...prev, cachedFlowItem];
                });
                
                // 如果有知识卡片，也更新
                if (cachedFlowItem.knowledgeCards && cachedFlowItem.knowledgeCards.length > 0) {
                  onUpdateKnowledgeCards(prev => {
                    // 合并知识卡片，避免重复
                    const existingIds = new Set(prev.map((card: KnowledgeCard) => card.id));
                    const newCards = cachedFlowItem.knowledgeCards!.filter((card: KnowledgeCard) => !existingIds.has(card.id));
                    return [...prev, ...newCards];
                  });
                }
                
                // 添加视觉反馈（标记为从缓存加载）
                const newInput = {
                  id: Math.random().toString(36).slice(2, 11),
                  type: currentInputType,
                  name: file.name + ' (已缓存)',
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  timestamp: Date.now()
                };
                setRawInputs(prev => [...prev, newInput]);
                setSelectedFiles(prev => [...prev, file]);
                continue; // 跳过正常上传流程
              }
            }
            
            // 缓存新文件
            await cacheManager.cacheFile(file);
          } catch (error) {
            console.error('[Cache] 文件缓存处理失败:', error);
            // 继续正常流程
          }
        }
        
        // 继续正常流程（未缓存或缓存未命中）
        setSelectedFiles(prev => [...prev, ...files]);
        
        // Add visual feedback
        const newInputs = files.map((file) => ({
            id: Math.random().toString(36).slice(2, 11),
            type: currentInputType,
            name: file.name,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
        }));
        setRawInputs(prev => [...prev, ...newInputs]);
    }
  };

  // 压缩音频文件
  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (小于 Vercel 的 4.5MB 限制)

  const compressAudioFile = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const fileReader = new FileReader();

      fileReader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // 降低采样率到 22050 Hz (CD 质量的一半)
          const targetSampleRate = 22050;
          const numberOfChannels = audioBuffer.numberOfChannels;
          const length = Math.round(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate);
          const offlineContext = new OfflineAudioContext(numberOfChannels, length, targetSampleRate);
          
          const source = offlineContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineContext.destination);
          source.start();

          const compressedBuffer = await offlineContext.startRendering();

          // 转换为 WAV
          const wav = audioBufferToWav(compressedBuffer);
          const compressedBlob = new Blob([wav], { type: 'audio/wav' });
          
          // 如果压缩后仍然太大，进一步降低质量
          if (compressedBlob.size > MAX_FILE_SIZE) {
            // 使用更低的采样率
            const lowerSampleRate = 16000;
            const lowerLength = Math.round(audioBuffer.length * lowerSampleRate / audioBuffer.sampleRate);
            const lowerContext = new OfflineAudioContext(numberOfChannels, lowerLength, lowerSampleRate);
            
            const lowerSource = lowerContext.createBufferSource();
            lowerSource.buffer = audioBuffer;
            lowerSource.connect(lowerContext.destination);
            lowerSource.start();

            const lowerBuffer = await lowerContext.startRendering();
            const lowerWav = audioBufferToWav(lowerBuffer);
            const lowerBlob = new Blob([lowerWav], { type: 'audio/wav' });
            
            const compressedFile = new File([lowerBlob], file.name.replace(/\.[^/.]+$/, '.wav'), { type: 'audio/wav' });
            resolve(compressedFile);
          } else {
            const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, '.wav'), { type: 'audio/wav' });
            resolve(compressedFile);
          }
        } catch (error) {
          reject(error);
        }
      };

      fileReader.onerror = reject;
      fileReader.readAsArrayBuffer(file);
    });
  };

  // 将 AudioBuffer 转换为 WAV
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];

    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);

    // 写入音频数据
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  };

  // 压缩文件（如果需要）
  const compressFileIfNeeded = async (file: File): Promise<File> => {
    // 如果文件已经小于限制，直接返回
    if (file.size <= MAX_FILE_SIZE) {
      return file;
    }

    // 只压缩音频文件
    if (file.type.startsWith('audio/')) {
      setGenerationProgress(`正在压缩音频文件: ${file.name}...`);
      try {
        const compressed = await compressAudioFile(file);
        console.log(`压缩完成: ${file.size} -> ${compressed.size} bytes`);
        return compressed;
      } catch (error) {
        console.error('音频压缩失败:', error);
        throw new Error(`文件 ${file.name} 太大（${(file.size / 1024 / 1024).toFixed(2)}MB），且压缩失败。请先压缩文件后再上传。`);
      }
    }

    // 其他文件类型，提示用户压缩
    throw new Error(`文件 ${file.name} 太大（${(file.size / 1024 / 1024).toFixed(2)}MB），超过 4MB 限制。请先压缩文件后再上传。`);
  };

  const generateFlowList = async (retryCount = 0) => {
    if (rawInputs.length === 0) return;
    
    const maxRetries = 2;
    setIsGenerating(true);
    setGenerationProgress(retryCount > 0 ? `重试中 (${retryCount}/${maxRetries})...` : '正在处理文件...');

    try {
        // 压缩文件（如果需要）
        setGenerationProgress('正在检查和压缩文件...');
        const processedFiles: File[] = [];
        
        for (const file of selectedFiles) {
          try {
            const processedFile = await compressFileIfNeeded(file);
            processedFiles.push(processedFile);
          } catch (error: any) {
            throw error; // 直接抛出错误，让用户知道需要压缩
          }
        }

        setGenerationProgress('正在上传文件...');
        const formData = new FormData();
        processedFiles.forEach(file => {
            formData.append('files', file);
        });
        
        // Add generation preferences
        formData.append('preferences', JSON.stringify(generationPreferences));

        setGenerationProgress(retryCount > 0 ? `重试中 (${retryCount}/${maxRetries})...` : '正在分析内容...');
        
        // Use the new API with timeout
        const controller = new AbortController();
        // Increase timeout to 5 minutes (300s) for large content generation
        const timeoutId = setTimeout(() => controller.abort(), 300000); 
        
        let response: Response;
        try {
            response = await fetch(getApiUrl('/api/analyze'), {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            // Check if it's an abort error (timeout)
            if (fetchError.name === 'AbortError') {
                throw new Error('TIMEOUT_ERROR');
            }
            
            // Network error - backend is likely not running or CORS issue
            console.error("Network error:", fetchError);
            throw new Error('NETWORK_ERROR');
        }

        if (!response.ok) {
            // Try to parse error message from response
            let errorMessage = `服务器错误: ${response.status} ${response.statusText}`;
            let isRetryable = false;
            
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                    // Check if error suggests retry
                    isRetryable = errorMessage.includes('超时') || 
                                  errorMessage.includes('timeout') || 
                                  errorMessage.includes('重试') ||
                                  response.status === 504 ||
                                  response.status === 503;
                }
            } catch (e) {
                // If response is not JSON, use default message
            }
            
            // Auto-retry for timeout errors
            if (isRetryable && retryCount < maxRetries) {
                console.log(`Retrying due to timeout (attempt ${retryCount + 1}/${maxRetries})...`);
                setGenerationProgress(`请求超时，自动重试 (${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                return generateFlowList(retryCount + 1);
            }
            
            throw new Error(`HTTP_ERROR|${response.status}|${errorMessage}`);
        }

        setGenerationProgress('正在生成内容...');
        
        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        
        if (reader) {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedText += chunk;
                    
                    // Update progress to show liveness
                    setGenerationProgress(`正在生成内容... (${accumulatedText.length} 字符)`);
                }
            } catch (streamError) {
                console.error("Stream reading error:", streamError);
                throw new Error("STREAM_ERROR");
            }
        } else {
            // Fallback for non-streaming response (should not happen with new backend)
            accumulatedText = await response.text();
        }
        
        console.log("Generation complete, parsing JSON...");
        setGenerationProgress('正在处理结果...');

        // Parse JSON from the accumulated text (which might contain markdown)
        let data: any;
        try {
            // Look for JSON object in the text (handling potential markdown code blocks)
            const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                console.warn("No JSON object found in response, trying to parse full text");
                // Try parsing the whole thing if no braces found (unlikely but possible)
                data = JSON.parse(accumulatedText);
            }
        } catch (parseError) {
            console.error("Failed to parse JSON from response:", parseError);
            console.log("Raw response:", accumulatedText);
            
            // If it looks like an error message from backend (but in text format)
            if (accumulatedText.includes('"error"')) {
                try {
                    const errObj = JSON.parse(accumulatedText);
                    if (errObj.error) {
                         throw new Error(`SERVER_ERROR|${errObj.error}`);
                    }
                } catch (e) {}
            }
            
            throw new Error(`PARSE_ERROR|无法解析服务器响应。请重试。`);
        }
        
        // Check if response contains error (logical error)
        if (data.error) {
            // Check if error suggests retry
            const isRetryable = data.error.includes('超时') || 
                                data.error.includes('timeout') || 
                                data.error.includes('重试');
            
            if (isRetryable && retryCount < maxRetries) {
                console.log(`Retrying due to error (attempt ${retryCount + 1}/${maxRetries})...`);
                setGenerationProgress(`生成失败，自动重试 (${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return generateFlowList(retryCount + 1);
            }
            
            throw new Error(`SERVER_ERROR|${data.error}`);
        }
        
        setGenerationProgress('处理结果...');
        
        // Archive raw inputs
        setArchivedInputs(prev => [...prev, ...rawInputs]);
        setRawInputs([]);
        setSelectedFiles([]);

        // Process Knowledge Cards
        let newCards: KnowledgeCard[] = [];
        if (data.knowledgeCards && Array.isArray(data.knowledgeCards)) {
            newCards = data.knowledgeCards.map((card: any) => ({
                id: Math.random().toString(36).slice(2, 11),
                title: card.title,
                content: card.content,
                tags: card.tags || [],
                timestamp: new Date()
            }));
            onUpdateKnowledgeCards(prev => [...newCards, ...prev]);
        }

        // Create Flow Item from Podcast Script
        const subtitles = data.podcastScript ? data.podcastScript.map((line: any, index: number) => ({
            time: `00:${index < 10 ? '0' + index : index}0`, // Fake timing for now
            text: `${line.speaker}: ${line.text}`
        })) : [];

        // 获取内容类型和场景标签（从后端返回或推断）
        const contentCategory = data.contentCategory;
        const backendSceneTag = data.sceneTag as SceneTag | undefined;
        const summary = data.summary || '';
        const originalTitle = data.title || 'AI 深度分析';
        
        // 先根据标题和摘要推断场景标签（用于决定是否需要添加前缀）
        const inferredSceneTag = getSceneTagFromTitle(originalTitle, contentCategory, backendSceneTag, summary);
        
        // 根据内容类型或推断的场景标签添加文件名前缀
        let finalTitle = originalTitle;
        if (contentCategory && prefixMap[contentCategory]) {
          // 如果已经有前缀，不再添加
          if (!finalTitle.startsWith('回家路上：') && 
              !finalTitle.startsWith('静坐专注：') && 
              !finalTitle.startsWith('问答式记忆：') && 
              !finalTitle.startsWith('在家充电：')) {
            finalTitle = prefixMap[contentCategory] + finalTitle;
          }
        } else if (inferredSceneTag === 'qa_memory' && !finalTitle.startsWith('问答式记忆：')) {
          // 如果推断为问答式记忆，但标题中没有前缀，检查是否需要添加
          const textToCheck = `${originalTitle} ${summary}`.toLowerCase();
          const qaMemoryKeywords = ['语文', '古诗', '诗文', '诗词', '文言文', 'english', '英语'];
          if (qaMemoryKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
            finalTitle = '问答式记忆：' + finalTitle;
          }
        } else if (inferredSceneTag === 'commute' && !finalTitle.startsWith('回家路上：')) {
          const textToCheck = `${originalTitle} ${summary}`.toLowerCase();
          const historyKeywords = ['历史', 'history', '古代', '朝代'];
          if (historyKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
            finalTitle = '回家路上：' + finalTitle;
          }
        } else if (inferredSceneTag === 'focus' && !finalTitle.startsWith('静坐专注：')) {
          const textToCheck = `${originalTitle} ${summary}`.toLowerCase();
          const mathKeywords = ['数学', '几何', 'math', 'geometry'];
          if (mathKeywords.some(keyword => textToCheck.includes(keyword.toLowerCase()))) {
            finalTitle = '静坐专注：' + finalTitle;
          }
        }
        
        // 获取最终场景标签（使用更新后的标题）
        const sceneTag = getSceneTagFromTitle(finalTitle, contentCategory, backendSceneTag, summary);

        const aiFlowItem: FlowItem = {
            id: Math.random().toString(36).slice(2, 11),
            title: finalTitle,
            duration: '10:00', // Estimate
            type: 'insight',
            tldr: data.summary || '基于上传素材的深度解析',
            subtitles: subtitles,
            status: 'ready',
            scenes: ['deep_work', 'casual'],
            subject: 'tech', // Could be inferred
            mode: generationPreferences?.preset === 'quick_summary' ? 'single' : 'dual',
            contentType: generationPreferences?.preset === 'interactive_practice' ? 'interactive' : 
                         generationPreferences?.preset === 'quick_summary' ? 'output' : 'discussion',
            script: data.podcastScript,
            knowledgeCards: newCards,
            sceneTag: sceneTag,
            playbackProgress: {
                hasStarted: false
            }
        };

        // 缓存 FlowItem（包含 script、knowledgeCards、tldr 等所有字段）
        try {
          if (selectedFiles.length > 0) {
            const firstFile = selectedFiles[0];
            const fileHash = await generateFileHash(firstFile);
            const preset = generationPreferences?.preset || genPreset;
            cacheManager.cacheFlowItem(fileHash, preset, aiFlowItem);
            console.log('[Cache] FlowItem 已缓存:', fileHash, preset);
          }
        } catch (error) {
          console.error('[Cache] FlowItem 缓存失败:', error);
          // 缓存失败不影响正常流程
        }

        // 检查是否为首次生成 (当列表为空时，视为从 0 到 1 的生成)
        let newFlowItems: FlowItem[] = [aiFlowItem];
        
        // 使用 functional update 确保基于最新状态判断
        setFlowItems(prev => {
          const isFirstGeneration = prev.length === 0;
          if (isFirstGeneration) {
            console.log('首次生成，添加默认 items');
            const defaultItems = getDefaultFlowItems();
            return [...defaultItems, ...newFlowItems, ...prev];
          }
          return [...newFlowItems, ...prev];
        });

        // 尝试启动预生成 items 的动画更新
        // 这里无法直接知道是否添加了 items，但运行更新逻辑是安全的（找不到 item 会忽略）
        setTimeout(() => {
          const updateDefaultItems = async () => {
            const defaultItemIds = ['default-1', 'default-2', 'default-3'];
            
            for (let i = 0; i < defaultItemIds.length; i++) {
              const delay = i === 0 ? 500 : 800 + Math.random() * 400;
              await new Promise(resolve => setTimeout(resolve, delay));
              
              setFlowItems(prev => {
                const itemExists = prev.some(item => item.id === defaultItemIds[i]);
                if (!itemExists) {
                  // 如果 item 不存在，说明可能不是首次生成，或者被删除了，直接跳过
                  return prev;
                }
                
                const updated = prev.map(item => 
                  item.id === defaultItemIds[i] 
                    ? { 
                        ...item, 
                        isGenerating: false,
                        generationProgress: undefined
                      }
                    : item
                );
                return updated;
              });
            }
          };
          updateDefaultItems().catch(err => {
            console.error('更新预生成 items 状态失败:', err);
          });
        }, 300);

        setReadyToFlow(true);
        setShowInputPanel(false);
        setGenerationProgress('');

    } catch (error: any) {
        console.error("Failed to generate flow list:", error);
        
        let errorMessage = "生成失败";
        let canRetry = false;
        
        if (error.message === 'TIMEOUT_ERROR') {
            errorMessage = "请求超时（300秒）\n\n可能原因：\n1. 文件过大\n2. 服务器繁忙\n\n建议：\n1. 使用较小的文件\n2. 点击「重试」按钮";
            canRetry = true;
        } else if (error.message === 'NETWORK_ERROR') {
            errorMessage = "生成失败，无法连接到后端服务\n\n请检查：\n1. 后端服务是否已启动\n2. 网络连接是否正常";
        } else if (error.message.startsWith('HTTP_ERROR|')) {
            const parts = error.message.split('|');
            const statusCode = parts[1];
            const httpError = parts.slice(2).join('|');
            errorMessage = `生成失败 (HTTP ${statusCode})\n\n${httpError}`;
            canRetry = statusCode === '504' || statusCode === '503';
        } else if (error.message.startsWith('SERVER_ERROR|')) {
            const serverError = error.message.replace('SERVER_ERROR|', '');
            errorMessage = `生成失败: ${serverError}`;
            canRetry = serverError.includes('超时') || serverError.includes('重试');
        } else {
            errorMessage = `生成失败: ${error.message || '未知错误'}`;
        }
        
        // Show retry option if applicable
        if (canRetry && retryCount < maxRetries) {
            const shouldRetry = confirm(`${errorMessage}\n\n是否自动重试？`);
            if (shouldRetry) {
                setGenerationProgress(`手动重试中...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return generateFlowList(retryCount + 1);
            }
        } else {
            alert(errorMessage);
        }
    } finally {
        setIsGenerating(false);
        setGenerationProgress('');
    }
  };


  const handleDeleteFile = (fileId: string, fileName: string | undefined) => {
    setDeleteConfirmDialog({ show: true, fileId, fileName: fileName || null });
  };

  const confirmDeleteFile = () => {
    if (deleteConfirmDialog.fileId) {
      setArchivedInputs(prev => prev.filter(input => input.id !== deleteConfirmDialog.fileId));
      setDeleteConfirmDialog({ show: false, fileId: null, fileName: null });
    }
  };

  const cancelDeleteFile = () => {
    setDeleteConfirmDialog({ show: false, fileId: null, fileName: null });
  };


  const renderInputPanel = () => {
    if (isGenerating) {
        return <PackingAnimation fileNames={selectedFiles.map(f => f.name)} />;
    }

    return (
    <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">知识打包 (Pack My Bag)</h3>
        <div className="grid grid-cols-3 gap-3">
            <button onClick={() => addRawInput('图片')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Camera size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">拍照</span>
            </button>
            <button onClick={() => addRawInput('文档')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                    <FileText size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">导入</span>
            </button>
            <button onClick={() => addRawInput('录音')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                    <Mic size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">录音</span>
            </button>
        </div>

        {/* Raw Input List */}
        {rawInputs.length > 0 && (
            <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
                {rawInputs.map((input) => (
                    <div key={input.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs">
                        <span className="text-slate-600 flex items-center gap-2 min-w-0" title={input.name}>
                            {input.type === '图片' && <Camera size={12} className="shrink-0" />}
                            {input.type === '文档' && <FileText size={12} className="shrink-0" />}
                            {input.type === '录音' && <Mic size={12} className="shrink-0" />}
                            <span className="truncate">{input.name || `${input.type}输入`}</span>
                        </span>
                        <span className="text-slate-400 font-mono shrink-0 ml-2">{input.time}</span>
                    </div>
                ))}
            </div>
        )}

        {/* Generation Preferences */}
        {rawInputs.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4 mt-2">
                {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                        key={key}
                        onClick={() => setGenPreset(key)}
                        className={clsx(
                            "p-2 rounded-xl border text-left transition-all",
                            genPreset === key
                                ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                                : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        )}
                    >
                        <div className={clsx("text-xs font-bold mb-0.5", genPreset === key ? "text-indigo-700" : "text-slate-700")}>
                            {preset.label}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {preset.duration === 'short' ? '5m' : preset.duration === 'medium' ? '15m' : '>15m'} · {preset.mode === 'single' ? '单人' : '双人'} · {preset.type === 'output' ? '输出' : '探讨'}
                        </div>
                    </button>
                ))}
            </div>
        )}

        {/* Generate Button - Only show when there are inputs */}
        {rawInputs.length > 0 && (
            <div className="space-y-2">
                <button 
                    onClick={() => generateFlowList()}
                    disabled={isGenerating}
                    className={clsx(
                        "w-full py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-all",
                        !isGenerating
                            ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200" 
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    )}
                >
                    {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {generationProgress || '生成中...'}</>
                    ) : (
                        <><Sparkles size={16} /> AI 消化</>
                    )}
                </button>
                {isGenerating && (
                    <p className="text-xs text-slate-400 text-center">
                        大文件可能需要 30-60 秒，请耐心等待
                    </p>
                )}
            </div>
        )}
    </div>
    );
  };

  // 获取当前场景的索引
  const currentSceneIndex = sceneTagsArray.indexOf(currentSceneTag);
  
  // 场景切换函数
  const handleSceneChange = (direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' 
      ? (currentSceneIndex + 1) % sceneTagsArray.length
      : (currentSceneIndex - 1 + sceneTagsArray.length) % sceneTagsArray.length;
    const newSceneTag = sceneTagsArray[newIndex];
    setCurrentSceneTag(newSceneTag);
    // 场景切换时立即查找并播放对应场景的音频
    const playableItems = getPlayableItems(flowItems, newSceneTag);
    if (playableItems.length > 0) {
      const firstItem = playableItems[0];
      // 停止当前播放
      if (audioRef.current) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
      setCurrentPlayingItem(firstItem);
      setSelectedItem(firstItem);
      handlePlayAudio(firstItem);
    } else {
      setCurrentPlayingItem(null);
      setSelectedItem(null);
      if (audioRef.current) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
    }
  };

  // 拨轮场景切换组件 (Revised for Horizontal Layout)
  const SceneWheel = () => {
    // Show even if only 1 scene, but hide arrows
    if (sceneTagsArray.length === 0) return null;

    const isSingleScene = sceneTagsArray.length <= 1;

    const prevIndex = (currentSceneIndex - 1 + sceneTagsArray.length) % sceneTagsArray.length;
    const nextIndex = (currentSceneIndex + 1) % sceneTagsArray.length;
    
    // Safety check for empty array handled above, but indices need care if length is 1
    const prevScene = sceneTagsArray.length > 0 ? SCENE_CONFIGS[sceneTagsArray[prevIndex]] : SCENE_CONFIGS['default'];
    const currentScene = SCENE_CONFIGS[currentSceneTag];
    const nextScene = sceneTagsArray.length > 0 ? SCENE_CONFIGS[sceneTagsArray[nextIndex]] : SCENE_CONFIGS['default'];

    return (
      <div className="flex flex-col items-center gap-8 mb-8 w-full">
        {/* Horizontal Scene Switcher */}
        <div className="flex items-center justify-center gap-4 w-full px-2">
          {/* Previous Scene (Left) - Only show if multiple scenes */}
          {!isSingleScene && (
            <motion.div
                initial={{ opacity: 0.3, scale: 0.8, x: 20 }}
                animate={{ opacity: 0.4, scale: 0.85, x: 0 }}
                className="flex flex-col items-center gap-2 cursor-pointer z-0 active:scale-95 transition-transform"
                onClick={() => handleSceneChange('prev')}
            >
                <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <prevScene.icon size={20} className="text-white/40" />
                </div>
                <span className="text-[10px] text-white/30 font-medium">{prevScene.label}</span>
            </motion.div>
          )}

          {/* Current Scene (Center) */}
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center gap-3 z-10 mx-2"
          >
            <motion.div
              className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border-2 border-white/20 flex items-center justify-center shadow-lg shadow-indigo-500/20"
              whileHover={{ scale: 1.05 }}
            >
              <currentScene.icon size={36} className="text-white" />
            </motion.div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-bold text-white">{currentScene.label}</span>
              <span className="text-[10px] text-white/50">{currentScene.description}</span>
            </div>
          </motion.div>

          {/* Next Scene (Right) - Only show if multiple scenes */}
          {!isSingleScene && (
            <motion.div
                initial={{ opacity: 0.3, scale: 0.8, x: -20 }}
                animate={{ opacity: 0.4, scale: 0.85, x: 0 }}
                className="flex flex-col items-center gap-2 cursor-pointer z-0 active:scale-95 transition-transform"
                onClick={() => handleSceneChange('next')}
            >
                <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <nextScene.icon size={20} className="text-white/40" />
                </div>
                <span className="text-[10px] text-white/30 font-medium">{nextScene.label}</span>
            </motion.div>
          )}
        </div>

        {/* Scene Indicators - Only show if multiple scenes */}
        {!isSingleScene && (
            <div className="flex gap-1.5">
            {sceneTagsArray.map((tag, index) => (
                <div
                key={tag}
                className={clsx(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    index === currentSceneIndex ? "bg-white w-6" : "bg-white/30"
                )}
                />
            ))}
            </div>
        )}
      </div>
    );
  };

  if (isFlowing) {
    const playableItemsForCurrentScene = getPlayableItems(flowItems, currentSceneTag);
    const hasNoAudioForScene = playableItemsForCurrentScene.length === 0;

    return (
      <div className="h-full flex flex-col items-center justify-between bg-black text-white p-6 relative overflow-hidden">
        {renderAudioPlayer()}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-black to-black opacity-80" />
        
        {/* Top Spacer to balance layout */}
        <div className="flex-1 min-h-[10%]" />

        {/* Middle Section: Logo, Playing Info & Scene Switcher */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md shrink-0">
            {/* Logo */}
            <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-3 ring-1 ring-indigo-500/30">
                    <Brain className="w-8 h-8 text-indigo-400" />
                </div>
                <h2 className="text-xl font-light tracking-tight mb-1">DeepFlow</h2>
            </div>

            {/* Now Playing Title - Compact & Near Wheel */}
            <div className="w-full px-4 mb-8 min-h-[3rem] flex items-center justify-center">
                 <AnimatePresence mode="wait">
                    {currentPlayingItem ? (
                        <motion.div
                            key={currentPlayingItem.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="text-center"
                        >
                            <h3 className="text-lg font-semibold text-white/90 line-clamp-2 leading-snug drop-shadow-md">
                                {currentPlayingItem.title}
                            </h3>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-white/30"
                        >
                            {hasNoAudioForScene ? "当前场景暂无内容" : "准备播放..."}
                        </motion.div>
                    )}
                 </AnimatePresence>
            </div>
            
            <SceneWheel />
        </div>

        {/* Bottom Section: End Button */}
        <div className="relative z-10 w-full max-w-md flex flex-col justify-end items-center flex-1 pb-8 min-h-[20%]">
            <button 
                onClick={() => {
                  setHasAutoPlayed(false);
                  setCurrentPlayingItem(null);
                  onStopFlow();
                }}
                className="px-8 py-3 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm font-medium hover:bg-white/20 transition-colors backdrop-blur-md"
            >
                结束会话
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        className="hidden" 
        multiple 
      />
      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <button
          onClick={() => setIsGardenOpen(true)}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          aria-label="打开花园"
        >
          <Library size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deep Flow</h1>
          <p className="text-slate-500 text-sm font-medium truncate">准备你的专注素材</p>
        </div>
        
        {/* View Toggle - REMOVED (Controlled by parent) */}
        <div className="flex items-center gap-2">
            {/* Placeholder for alignment if needed */}
        </div>

        {flowItems.length > 0 && (
          <button
            onClick={() => setShowInputPanel(true)}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            aria-label="添加素材"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {isGardenOpen && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setIsGardenOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-[#F2F2F7] shadow-2xl rounded-r-3xl overflow-hidden animate-in slide-in-from-left duration-200">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-slate-900">花园</h2>
                <span className="text-xs text-slate-400">知识小票 & 原始文件</span>
              </div>
              <button
                onClick={() => setIsGardenOpen(false)}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
                aria-label="关闭花园"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button
                  onClick={() => setGardenTab('cards')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    gardenTab === 'cards' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  )}
                >
                  知识小票
                </button>
                <button
                  onClick={() => setGardenTab('files')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    gardenTab === 'files' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  )}
                >
                  原始文件库
                </button>
                <button
                  onClick={async () => {
                    setGardenTab('cache');
                    const stats = await cacheManager.getCacheSize();
                    setCacheStats(stats);
                  }}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    gardenTab === 'cache' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  )}
                >
                  缓存管理
                </button>
              </div>
            </div>

            <div className="px-4 pb-5 overflow-y-auto no-scrollbar space-y-4" style={{ height: 'calc(100% - 126px)' }}>
              {gardenTab === 'cards' ? (
                knowledgeCards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                    <Library size={48} className="opacity-20" />
                    <p className="text-sm">暂无知识小票</p>
                    <p className="text-xs max-w-[220px] text-center opacity-60">在 Flow 模式中自动生成并归档。</p>
                  </div>
                ) : (
                  knowledgeCards.map(card => (
                    <div key={card.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-3">
                        <h3 className="font-bold text-slate-800 text-sm line-clamp-2">{card.title}</h3>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{card.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
                        {card.content}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {card.tags.map(tag => (
                          <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-medium">
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : gardenTab === 'cache' ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm mb-3">缓存统计</h3>
                    {cacheStats ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600">已缓存文件</span>
                          <span className="text-sm font-semibold text-slate-800">{cacheStats.files}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600">已缓存音频</span>
                          <span className="text-sm font-semibold text-slate-800">{cacheStats.audio}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-600">已缓存 FlowItem</span>
                          <span className="text-sm font-semibold text-slate-800">{cacheStats.metadata}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">加载中...</p>
                    )}
                  </div>
                  
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                    <h3 className="font-bold text-slate-800 text-sm">缓存操作</h3>
                    <button
                      onClick={async () => {
                        await cacheManager.clearExpiredCache();
                        const stats = await cacheManager.getCacheSize();
                        setCacheStats(stats);
                      }}
                      className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
                    >
                      清理过期缓存
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('确定要清理所有缓存吗？此操作无法撤销。')) {
                          await cacheManager.clearAllCache();
                          const stats = await cacheManager.getCacheSize();
                          setCacheStats(stats);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
                    >
                      清理所有缓存
                    </button>
                    <button
                      onClick={async () => {
                        const stats = await cacheManager.getCacheSize();
                        setCacheStats(stats);
                      }}
                      className="w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors"
                    >
                      刷新统计
                    </button>
                  </div>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      缓存功能可以避免重复上传和生成，提升使用体验。缓存数据存储在浏览器本地，不会上传到服务器。
                    </p>
                  </div>
                </div>
              ) : (
                archivedInputs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                    <Package size={48} className="opacity-20" />
                    <p className="text-sm">暂无原始文件</p>
                    <p className="text-xs max-w-[220px] text-center opacity-60">打包生成后自动归档至此。</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {archivedInputs.map((input) => (
                      <div key={input.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            input.type === '图片' ? "bg-blue-100 text-blue-600" :
                            input.type === '文档' ? "bg-orange-100 text-orange-600" :
                            "bg-red-100 text-red-600"
                          )}>
                            {input.type === '图片' && <Camera size={14} />}
                            {input.type === '文档' && <FileText size={14} />}
                            {input.type === '录音' && <Mic size={14} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-slate-700 truncate" title={input.name}>{input.name || `${input.type}输入 #${input.id.slice(0, 4)}`}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">{new Date(input.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">已归档</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(input.id, input.name);
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors"
                            aria-label="删除文件"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {showInputPanel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInputPanel(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">添加素材</h3>
              <button onClick={() => setShowInputPanel(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <X size={16} />
              </button>
            </div>
            {renderInputPanel()}
          </div>
        </div>
      )}

      {deleteConfirmDialog.show && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={cancelDeleteFile} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900 mb-2">确认删除</h3>
                <p className="text-sm text-slate-600">
                  确定要删除文件 <span className="font-medium text-slate-900">"{deleteConfirmDialog.fileName || '未命名文件'}"</span> 吗？
                </p>
                <p className="text-xs text-slate-400 mt-2">此操作无法撤销</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={cancelDeleteFile}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteFile}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto no-scrollbar pb-28">
        {flowItems.length === 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            {renderInputPanel()}
          </div>
        )}

        {flowItems.length > 0 && (
        <div className="bg-white rounded-3xl p-0 shadow-sm min-h-[200px] animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
          <div className="flex flex-col gap-4 p-5 pb-2">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">FlowList</h3>
            
            {/* 筛选器 */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-1 px-1">
              <button
                  onClick={() => setFilterPreset('all')}
                  className={clsx(
                      "px-4 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap",
                      filterPreset === 'all'
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                  )}
              >
                  全部
              </button>
              {Object.entries(PRESETS).map(([key, preset]) => (
                  <button
                      key={key}
                      onClick={() => setFilterPreset(key)}
                      className={clsx(
                          "px-4 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap",
                          filterPreset === key
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                      )}
                  >
                      {preset.label}
                  </button>
              ))}
            </div>
          </div>

          {/* FlowItem 列表 */}
          <div className="pb-4">
              <div className="flex flex-col">
                {flowItems
                .sort((a, b) => {
                    const scenePriority: Record<string, number> = {
                        'daily_review': -1,  // 今日复盘排在最前面
                        'default': 0,        // 默认场景标签排在首位
                        'commute': 1,
                        'home_charge': 2,
                        'focus': 3,
                        'qa_memory': 4,
                        'sleep_meditation': 5
                    };
                    const pA = scenePriority[a.sceneTag || 'default'] ?? 7;
                    const pB = scenePriority[b.sceneTag || 'default'] ?? 7;
                    return pA - pB;
                })
                .filter(item => {
                  // 生成中的 items 始终显示
                  if (item.isGenerating) return true;
                  
                  if (filterPreset === 'all') return true;
                  
                  const preset = PRESETS[filterPreset];
                  if (!preset) return true;

                  // Check Mode
                  if (item.mode !== preset.mode) return false;
                  // Check Type
                  if (item.contentType !== preset.type) return false;
                  
                  // Check Duration
                  const mins = parseInt(item.duration.split(':')[0]);
                  if (preset.duration === 'short' && mins >= 5) return false;
                  if (preset.duration === 'medium' && (mins < 5 || mins > 15)) return false;
                  if (preset.duration === 'long' && mins <= 15) return false;

                  return true;
                }).map((item) => {
                  const sceneTag = item.sceneTag || 'default';
                  const sceneConfig = SCENE_CONFIGS[sceneTag];
                  const SceneIcon = sceneConfig.icon;
                  const isSelected = selectedItem?.id === item.id;
                  
                  return (
                    <div
                      key={item.id}
                      className="relative"
                    >
                      {/* FlowItem - Compact Modern List Style */}
                      <div
                        onClick={() => setSelectedItem(item)}
                        role="button"
                        tabIndex={0}
                        className={clsx(
                          "w-full flex items-center justify-between py-2 px-4 group transition-all active:scale-[0.99] border-b border-slate-50 last:border-0 cursor-pointer",
                          isSelected
                            ? "bg-indigo-50/40"
                            : "hover:bg-slate-50/60"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* 1. Compact Cover/Icon with Shadow */}
                          <div className={clsx(
                              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-all duration-300",
                              isSelected 
                                ? "bg-indigo-100 text-indigo-600 shadow-indigo-100" 
                                : "bg-slate-50 text-slate-400 group-hover:bg-white group-hover:shadow-md group-hover:text-indigo-500 group-hover:scale-105"
                          )}>
                            <SceneIcon size={18} strokeWidth={1.5} />
                          </div>
                          
                          {/* 2. Content Hierarchy */}
                          <div className="flex flex-col items-start min-w-0 flex-1">
                             {/* Top Tag */}
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[9px] font-bold text-indigo-500 tracking-wider uppercase bg-indigo-50 px-1.5 py-0.5 rounded-md scale-90 origin-left">
                                    {sceneConfig.label}
                                </span>
                            </div>

                            {/* Main Title */}
                            <span className={clsx(
                                "text-[13px] font-bold leading-snug line-clamp-1 mb-0 transition-colors",
                                item.isGenerating 
                                  ? "text-slate-400" 
                                  : isSelected 
                                    ? "text-indigo-900" 
                                    : "text-slate-800 group-hover:text-slate-900"
                            )}>
                                {item.title}
                            </span>
                            
                            {/* 生成中状态或 Subtitle / TLDR */}
                            {item.isGenerating ? (
                              <div className="flex items-center gap-1.5 text-[9px] text-indigo-500 font-medium mt-0.5">
                                <Loader2 size={10} className="animate-spin" />
                                <span>{item.generationProgress || '正在生成中...'}</span>
                              </div>
                            ) : (
                              <span className="text-[9px] text-slate-400 font-medium line-clamp-1 group-hover:text-slate-500 transition-colors">
                                  {item.tldr || "点击查看详情..."}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 3. Play Button (Replaces Selection) */}
                        <button
                          onClick={(e) => {
                              e.stopPropagation();
                              if (!item.isGenerating) {
                                setSelectedItem(item);
                                handlePlayAudio(item);
                              }
                          }}
                          disabled={item.isGenerating}
                          className={clsx(
                            "pl-3 py-2",
                            item.isGenerating && "cursor-not-allowed opacity-50"
                          )}
                        >
                            <div className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                                item.isGenerating
                                  ? "bg-slate-100 text-slate-300"
                                  : isSelected
                                    ? "bg-indigo-600 text-white shadow-indigo-200 group-hover:scale-110 group-hover:shadow-md"
                                    : "bg-slate-100 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:scale-110 group-hover:shadow-md"
                            )}>
                                {item.isGenerating ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Play size={12} fill="currentColor" className="ml-0.5" />
                                )}
                            </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
        </div>
        )}
      </div>

      {/* Legacy Playlist Selection UI Removed - Single Item Flow Mode */}
      {/* 
      {selectedPlaylistItems.length > 0 && (
          // ... Removed ...
      )} 
      */}

      {flowItems.length > 0 && (
        <div className="absolute left-0 right-0 bottom-0 px-4 pb-4 pt-2">
          <button
            onClick={onStartFlow}
            disabled={!readyToFlow}
            className={clsx(
              "w-full h-14 rounded-full flex items-center justify-center gap-2 font-bold text-lg shadow-lg transition-all duration-300 transform active:scale-95",
              readyToFlow ? "bg-black text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            <Sparkles size={20} />
            Go Flow
          </button>
        </div>
      )}

      {/* Detail View Modal / Overlay */}
      {selectedItem && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Integrated Header with Player */}
              <div className="relative bg-slate-900 overflow-hidden">
                  {/* Gradient Background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 to-slate-900 z-0" />
                  
                  {/* Content */}
                  <div className="relative z-10 text-white">
                      {/* Close Button Row - Separate Line */}
                      <div className="flex justify-end px-2 pt-2">
                          <button 
                              onClick={() => setSelectedItem(null)} 
                              className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                          >
                              <X size={18} />
                          </button>
                      </div>
                      
                      {/* Title Section */}
                      <div className="pb-6 px-4">
                          <h2 className="font-bold text-lg leading-tight mb-2">{selectedItem.title}</h2>
                      </div>
                      
                      {/* Bottom Section: Player Controls */}
                      <div className="flex flex-col gap-4 w-full px-4 pb-6">
                          {isLiveMode ? (
                              <div className="w-full flex flex-col items-center gap-4 py-4 bg-black/20 rounded-2xl border border-white/10">
                                  {!liveSession.isConnected ? (
                                      <div className="flex flex-col items-center justify-center py-8">
                                          <Loader2 size={24} className="animate-spin text-indigo-400 mb-2" />
                                          <span className="text-xs text-slate-400">Connecting to Gemini Live...</span>
                                      </div>
                                  ) : (
                                      <>
                                          <div className="flex items-center gap-2 text-green-400 mb-2">
                                               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                               <span className="text-xs font-bold uppercase tracking-wider">Live Practice Session</span>
                                          </div>
                                          
                                          <div className="w-full h-24 flex items-center justify-center gap-1">
                                               {[1,2,3,4,5,4,3,2,1].map((h, i) => (
                                                   <div key={i} className="w-2 bg-indigo-500 rounded-full animate-bounce" style={{ height: h * 8 + 'px', animationDelay: i * 0.1 + 's' }} />
                                               ))}
                                          </div>
                              
                                          <div className="flex items-center gap-4 mt-4">
                                               <button 
                                                   onClick={liveSession.isSpeaking ? liveSession.stopRecording : liveSession.startRecording}
                                                   className={clsx(
                                                       "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg",
                                                       liveSession.isSpeaking ? "bg-red-500 text-white animate-pulse shadow-red-500/50" : "bg-white text-slate-900 hover:scale-105"
                                                   )}
                                               >
                                                   {liveSession.isSpeaking ? <Square fill="currentColor" /> : <Mic2 size={28} />}
                                               </button>
                                          </div>
                                          <p className="text-xs text-slate-400 mt-2">{liveSession.isSpeaking ? "Listening..." : "Tap to Speak"}</p>
                                      </>
                                  )}
                                  
                                  <button 
                                      onClick={() => {
                                          liveSession.disconnect();
                                          setIsLiveMode(false);
                                      }}
                                      className="text-xs text-slate-400 hover:text-white transition-colors mt-2 underline"
                                  >
                                      End Session
                                  </button>
                              </div>
                          ) : (
                              selectedItem.contentType === 'interactive' ? (
                                <button 
                                    onClick={() => {
                                        // Validate before starting
                                        if (!selectedItem.script || selectedItem.script.length === 0) {
                                            alert('此内容没有可用的脚本，无法启动实时练习。');
                                            return;
                                        }
                                        setIsLiveMode(true);
                                    }}
                                    className="mt-4 px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform shadow-lg shadow-indigo-500/30"
                                >
                                    <Mic2 size={18} />
                                    Start Live Practice
                                </button>
                              ) : (
                                  audioUrl ? (
                              <div className="w-full flex flex-col">
                                  {renderAudioPlayer()}
                                  
                                  {/* Progress Bar */}
                                  <div className="w-full mb-4">
                                    <input
                                      type="range"
                                      min="0"
                                      max={duration || 0}
                                      value={currentTime}
                                      onChange={handleSeek}
                                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                      style={{
                                        background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255, 255, 255, 0.1) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255, 255, 255, 0.1) 100%)`
                                      }}
                                    />
                                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                                      <span>{formatTime(currentTime)}</span>
                                      <span>{formatTime(duration)}</span>
                                    </div>
                                    {audioParts.length > 1 && selectedItem && (
                                      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                                        <span>第 {currentPartIndex + 1} 段 · 本段 {formatTime(duration)}</span>
                                        <span>总时长 {selectedItem.duration}</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Playback Controls Row */}
                                  <div className="flex items-center gap-3 w-full">
                                      <button 
                                          onClick={() => {
                                              if (audioRef.current) {
                                                  if (audioRef.current.paused) {
                                                      audioRef.current.play().catch(err => {
                                                          console.error('Play failed:', err);
                                                          setAudioError('播放失败，请重试');
                                                      });
                                                  } else {
                                                      audioRef.current.pause();
                                                  }
                                              }
                                          }}
                                          className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-900 transition-all hover:scale-105"
                                      >
                                          {isAudioPlaying ? (
                                              <Pause size={16} fill="currentColor" />
                                          ) : (
                                              <Play size={16} fill="currentColor" />
                                          )}
                                      </button>
                                      
                                      <button 
                                          onClick={() => {
                                              const rates = [1, 1.25, 1.5, 2];
                                              const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
                                              setPlaybackRate(rates[nextIndex]);
                                          }}
                                          className="text-xs font-mono text-slate-400 hover:text-white transition-colors px-2 py-1"
                                      >
                                          {playbackRate}×
                                      </button>
                                      {audioParts.length > 1 && (
                                        <div className="flex items-center gap-2 ml-2">
                                          <button
                                            onClick={() => {
                                              if (currentPartIndex > 0 && audioParts[currentPartIndex - 1]) {
                                                const newIndex = currentPartIndex - 1;
                                                const newUrl = audioParts[newIndex];
                                                setCurrentPartIndex(newIndex);
                                                setAudioUrl(newUrl);
                                                setCurrentTime(0);
                                                setDuration(0);
                                              }
                                            }}
                                            disabled={currentPartIndex === 0}
                                            className="px-2 py-1 text-xs rounded-full border border-white/20 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            上一段
                                          </button>
                                          <span className="text-xs text-slate-400">
                                            {currentPartIndex + 1} / {audioParts.length}
                                          </span>
                                          <button
                                            onClick={() => {
                                              if (currentPartIndex < audioParts.length - 1 && audioParts[currentPartIndex + 1]) {
                                                const newIndex = currentPartIndex + 1;
                                                const newUrl = audioParts[newIndex];
                                                setCurrentPartIndex(newIndex);
                                                setAudioUrl(newUrl);
                                                setCurrentTime(0);
                                                setDuration(0);
                                              }
                                            }}
                                            disabled={currentPartIndex === audioParts.length - 1}
                                            className="px-2 py-1 text-xs rounded-full border border-white/20 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            下一段
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                  
                                  {/* Script Text - Scrolling Style */}
                                  {selectedItem.script && (
                                    <div className="mt-4 w-full relative">
                                        <div className="relative bg-white/5 rounded-lg p-3 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                            {/* Top gradient fade */}
                                            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none z-10 rounded-t-lg" />
                                            
                                            {/* Text content */}
                                            <div className="text-xs text-slate-300 leading-snug relative z-0 space-y-2">
                                                {selectedItem.script.map((line, index) => (
                                                  <div key={index}>
                                                    <span className="font-semibold text-indigo-400">{line.speaker}:</span> {line.text}
                                                  </div>
                                                ))}
                                            </div>
                                            
                                            {/* Bottom gradient fade */}
                                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-900/80 to-transparent pointer-events-none z-10 rounded-b-lg" />
                                        </div>
                                    </div>
                                  )}
                              </div>
                          ) : (
                              <button 
                                  onClick={() => handlePlayAudio(selectedItem)}
                                  disabled={isPlayingAudio}
                                  className="mt-4 px-8 py-3 bg-white text-slate-900 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                              >
                                  {isPlayingAudio ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
                                  {isPlayingAudio ? "Generating Audio..." : "Play Podcast"}
                              </button>
                          )
                              )
                          )}

                          {/* TTS 生成进度显示 */}
                          {ttsProgress && (
                              <div className="mt-4 w-full">
                                  <div className="flex items-center gap-2 mb-2">
                                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                      <span className="text-sm text-slate-600 font-medium">{ttsProgress.message}</span>
                                  </div>
                                  {ttsProgress.percentage !== undefined && (
                                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                          <div 
                                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                                              style={{ width: `${ttsProgress.percentage}%` }}
                                          />
                                      </div>
                                  )}
                              </div>
                          )}

                          {audioError && (
                              <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-xl border border-red-500/20 text-xs">
                                  <AlertCircle size={14} />
                                  <span>{audioError}</span>
                              </div>
                          )}
                      </div>
                  </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 p-6 overflow-y-auto">
                  <div className="space-y-8">
                      {/* TLDR Section */}
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-indigo-600">
                          <Sparkles size={16} />
                          <h3 className="text-xs font-bold uppercase tracking-wider">AI 提炼 (TL;DR)</h3>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-2xl text-sm text-indigo-900 leading-relaxed">
                          {selectedItem.tldr}
                      </div>
                  </div>

                  {/* Knowledge Cards Section */}
                  {selectedItem.knowledgeCards && selectedItem.knowledgeCards.length > 0 && (
                      <div className="space-y-3">
                          <div className="flex items-center gap-2 text-orange-600">
                              <Library size={16} />
                              <h3 className="text-xs font-bold uppercase tracking-wider">核心知识点</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                              {selectedItem.knowledgeCards.map((card, idx) => (
                                  <div key={idx} className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl">
                                      <h4 className="font-bold text-slate-800 text-sm mb-2">{card.title}</h4>
                                      <p className="text-xs text-slate-600 leading-relaxed">{card.content}</p>
                                      {card.tags && (
                                          <div className="flex gap-2 mt-3">
                                              {card.tags.map(tag => (
                                                  <span key={tag} className="px-2 py-0.5 bg-white text-orange-600 text-[10px] rounded border border-orange-100">
                                                      #{tag}
                                                  </span>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  {/* Full Script Section */}
                  {selectedItem.script && (
                      <div className="space-y-4">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-400">
                                  <AlignLeft size={16} />
                                  <h3 className="text-xs font-bold uppercase tracking-wider">完整逐字稿</h3>
                              </div>
                              <button
                                  onClick={copyScriptAsMarkdown}
                                  className={clsx(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                      copiedScript
                                          ? "bg-green-50 text-green-600 border border-green-200"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                                  )}
                                  title="复制整篇 Markdown"
                              >
                                  {copiedScript ? (
                                      <>
                                          <Check size={14} />
                                          <span>已复制</span>
                                      </>
                                  ) : (
                                      <>
                                          <Copy size={14} />
                                          <span>复制 Markdown</span>
                                      </>
                                  )}
                              </button>
                          </div>
                          <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                              {selectedItem.script.map((line, i) => (
                                  <div key={i} className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                          <div className={clsx(
                                              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]",
                                              line.speaker === 'Deep' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                                          )}>
                                              {line.speaker[0]}
                                          </div>
                                          <div className="text-xs font-bold text-slate-400">{line.speaker}</div>
                                      </div>
                                      <p className="text-sm text-slate-800 leading-[1.2]">{line.text}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
