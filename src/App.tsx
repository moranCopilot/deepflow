import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhoneFrame } from './components/PhoneFrame';
import { SupplyDepotApp, type KnowledgeCard, type FlowPlaybackState } from './components/SupplyDepotApp';
import { HeadsetDevice } from './components/HeadsetDevice';
import { PrinterDevice } from './components/PrinterDevice';
import { GlassesDevice } from './components/GlassesDevice';
import { SceneBackground } from './components/SceneBackground';
import { Headphones, Printer, Glasses, Presentation, Download, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { type SceneTag, SCENE_CONFIGS, SLOT_DEFINITIONS, type SlotId } from './config/scene-config';
import { getApiUrl } from './utils/api-config';
import { useSceneBackground } from './hooks/useSceneBackground';

// Demo示意小票数据
const MOCK_DEMO_CONTENTS: Array<{ id: string; content: string; timestamp: number }> = [
  {
    id: 'demo-1',
    content: 'E = mc²\n\n爱因斯坦质能方程\n描述了质量和能量\n的等价关系',
    timestamp: Date.now() - 3000
  },
  {
    id: 'demo-2',
    content: 'y = ax² + bx + c\n\n二次函数标准形式\n其中 a ≠ 0',
    timestamp: Date.now() - 2000
  },
  {
    id: 'demo-3',
    content: '∫₀^∞ e^(-x²) dx = √π/2\n\n高斯积分\n概率论和统计中\n的重要结果',
    timestamp: Date.now() - 1000
  }
];

// Glasses Capture Assets Sequence
const CAPTURE_ASSETS = [
  '/assets/math-problem.jpg',
  '/assets/历史笔记-1.webp',
  '/assets/历史笔记-2.webp',
  '/assets/历史笔记-3.webp'
];

const PRINT_KEYWORDS = ['已为你整理', '打印', '知识卡片', '知识小票', 'print job', 'printing', 'print'];
const USE_SERVER_PRINT_FALLBACK = true;

// Reusable Hardware Card Component for consistent layout
const HardwareCard = ({ 
  productName, 
  slogan, 
  icon: Icon, 
  children, 
  isActive, 
  className 
}: { 
  productName: string, 
  slogan: string, 
  icon: LucideIcon, 
  children: React.ReactNode, 
  isActive: boolean, 
  className?: string 
}) => (
  <div className={clsx("flex flex-col items-center gap-6 w-full", className)}>
      <div className="bg-white rounded-[40px] shadow-xl border border-white/50 flex flex-col overflow-hidden relative ring-1 ring-black/5 transition-all duration-500 w-full h-[640px] group hover:shadow-2xl hover:scale-[1.02]">
          <div className="absolute top-6 right-6 px-3 py-1.5 bg-neutral-900/5 rounded-full text-[10px] font-mono text-neutral-500 pointer-events-none z-30 flex items-center gap-2 backdrop-blur-sm border border-white/20">
              <Icon size={12} />
              <span className="tracking-wider font-bold">{isActive ? "ACTIVE" : "IDLE"}</span>
          </div>
          <div className="flex-1 relative bg-gradient-to-br from-neutral-50 to-white overflow-hidden flex flex-col items-center justify-start pt-24">
              {children}
          </div>
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center">
          <h3 className="text-sm font-extrabold text-neutral-800 tracking-[0.2em] uppercase">{productName}</h3>
          <p className="text-[10px] font-medium text-neutral-400 tracking-wider uppercase opacity-80">{slogan}</p>
      </div>
  </div>
);

function App() {
  const [isFlowing, setIsFlowing] = useState(false);
  const [currentSceneTag, setCurrentSceneTag] = useState<SceneTag>('default');
  // const [activeHardware, setActiveHardware] = useState<'headset' | 'printer'>('headset'); // Removed for grid layout
  const [printedContents, setPrintedContents] = useState<Array<{ id: string; content: string; timestamp: number }>>([]);
  const [knowledgeCards, setKnowledgeCards] = useState<KnowledgeCard[]>([]);
  const [playbackState, setPlaybackState] = useState<FlowPlaybackState | null>(null);
  const [transcription, setTranscription] = useState<{ source: 'input' | 'output'; text: string } | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null);
  const [captureIndex, setCaptureIndex] = useState(0);
  const [availableSlots, setAvailableSlots] = useState<SlotId[]>([]);
  const [environmentCycleIndex, setEnvironmentCycleIndex] = useState<number>(-1);
  const [environmentSwitchToken, setEnvironmentSwitchToken] = useState<number>(0);
  const [environmentIntroToken, setEnvironmentIntroToken] = useState<number | undefined>(undefined);
  const [environmentIntroEndsAt, setEnvironmentIntroEndsAt] = useState<number | undefined>(undefined);
  const environmentPromptAudioRef = useRef<HTMLAudioElement | null>(null);
  const environmentIntroTokenRef = useRef<number | null>(null);
  const environmentIntroFallbackTimerRef = useRef<number | null>(null);
  const environmentPromptFadeTimerRef = useRef<number | null>(null);
  const environmentPromptFadeRafRef = useRef<number | null>(null);

  const PROMPT_CROSSFADE_MS = 350;
  const PROMPT_POST_DELAY_MS = 3000;
  const PROMPT_FALLBACK_MS = 20000;
  const [hasReadGuide, setHasReadGuide] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('deepflow_guide_read_status') === 'true';
    }
    return false;
  });

  const handleGuideClick = () => {
    setHasReadGuide(true);
    localStorage.setItem('deepflow_guide_read_status', 'true');
  };

  const clearEnvironmentPromptFade = () => {
    if (environmentPromptFadeTimerRef.current !== null) {
      window.clearTimeout(environmentPromptFadeTimerRef.current);
      environmentPromptFadeTimerRef.current = null;
    }
    if (environmentPromptFadeRafRef.current !== null) {
      window.cancelAnimationFrame(environmentPromptFadeRafRef.current);
      environmentPromptFadeRafRef.current = null;
    }
  };

  const stopEnvironmentPromptAudio = () => {
    clearEnvironmentPromptFade();
    if (environmentPromptAudioRef.current) {
      try {
        environmentPromptAudioRef.current.pause();
        environmentPromptAudioRef.current.currentTime = 0;
        environmentPromptAudioRef.current.volume = 1;
      } catch {
        // ignore
      }
      environmentPromptAudioRef.current = null;
    }
    if (environmentIntroFallbackTimerRef.current) {
      window.clearTimeout(environmentIntroFallbackTimerRef.current);
      environmentIntroFallbackTimerRef.current = null;
    }
    environmentIntroTokenRef.current = null;
    setEnvironmentIntroToken(undefined);
    setEnvironmentIntroEndsAt(undefined);
  };
  
  // Scene background management
  const sceneBackground = useSceneBackground(currentSceneTag);
  
  const slotIdsByScene = useMemo(() => {
    const availableSet = new Set(availableSlots);
    const map = new Map<SceneTag, SlotId[]>();
    SLOT_DEFINITIONS.forEach((slot) => {
      if (!slot.environmentSceneTag) return;
      if (!availableSet.has(slot.id)) return;
      const list = map.get(slot.environmentSceneTag) || [];
      list.push(slot.id);
      map.set(slot.environmentSceneTag, list);
    });
    return map;
  }, [availableSlots]);

  const ENV_SCENE_ORDER: SceneTag[] = ['commute', 'focus', 'sleep_meditation', 'qa_memory', 'daily_review'];

  // 环境循环逻辑：基于槽位可播放能力决定场景，避免 sceneTag 不一致导致缺失
  const scenesWithBackground = useMemo(() => {
    return ENV_SCENE_ORDER.filter(sceneTag => {
      const config = SCENE_CONFIGS[sceneTag];
      const slotsForScene = slotIdsByScene.get(sceneTag);
      return config.backgroundEffect !== null && slotsForScene && slotsForScene.length > 0;
    });
  }, [slotIdsByScene]);
  
  // 环境按钮点击处理
  const handleEnvironmentButtonClick = () => {
    if (scenesWithBackground.length === 0) return;
    
    const nextIndex = (environmentCycleIndex + 1) % (scenesWithBackground.length + 1);
    
    if (nextIndex === scenesWithBackground.length) {
      // 最后一次点击：关闭环境
      stopEnvironmentPromptAudio();
      stopFlow();
      return;
    }
    
    const targetScene = scenesWithBackground[nextIndex];
    setEnvironmentCycleIndex(nextIndex);
    const nextToken = Date.now();
    setEnvironmentSwitchToken(nextToken);
    setEnvironmentIntroToken(nextToken);
    setEnvironmentIntroEndsAt(Date.now() + PROMPT_FALLBACK_MS);
    environmentIntroTokenRef.current = nextToken;
    setCurrentSceneTag(targetScene);
    
    // 立即激活背景效果（不等待 useEffect）
    const config = SCENE_CONFIGS[targetScene];
    if (config.backgroundEffect) {
      sceneBackground.activate();
    }
    
    // 播放提示音频
    if (config.audioPrompt) {
      stopEnvironmentPromptAudio();
      const audio = new Audio(config.audioPrompt);
      environmentPromptAudioRef.current = audio;
      audio.volume = 1;
      let hasPromptStarted = false;

      const updateEndsAt = (endsAt: number) => {
        if (environmentIntroTokenRef.current !== nextToken) return;
        setEnvironmentIntroEndsAt(endsAt);
      };

      audio.addEventListener('playing', () => {
        hasPromptStarted = true;
        updateEndsAt(Date.now() + PROMPT_POST_DELAY_MS);
      });

      audio.addEventListener('loadedmetadata', () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const totalMs = audio.duration * 1000;
        const fadeStartDelay = Math.max(totalMs - PROMPT_CROSSFADE_MS, 0);
        clearEnvironmentPromptFade();
        environmentPromptFadeTimerRef.current = window.setTimeout(() => {
          const fadeStart = performance.now();
          const startVolume = audio.volume;
          const step = (now: number) => {
            const progress = Math.min((now - fadeStart) / PROMPT_CROSSFADE_MS, 1);
            audio.volume = Math.max(0, startVolume * (1 - progress));
            if (progress < 1) {
              environmentPromptFadeRafRef.current = window.requestAnimationFrame(step);
            } else {
              environmentPromptFadeRafRef.current = null;
            }
          };
          environmentPromptFadeRafRef.current = window.requestAnimationFrame(step);
        }, fadeStartDelay);
      });
      audio.addEventListener('ended', () => {
        clearEnvironmentPromptFade();
        if (!hasPromptStarted) {
          updateEndsAt(Date.now());
        }
      });
      audio.addEventListener('error', () => {
        clearEnvironmentPromptFade();
        updateEndsAt(Date.now());
      });

      if (environmentIntroFallbackTimerRef.current) {
        window.clearTimeout(environmentIntroFallbackTimerRef.current);
      }
      environmentIntroFallbackTimerRef.current = window.setTimeout(() => {
        if (!hasPromptStarted) {
          updateEndsAt(Date.now());
        }
        environmentIntroFallbackTimerRef.current = null;
      }, PROMPT_FALLBACK_MS);

      audio.play().catch((error) => {
        updateEndsAt(Date.now());
        console.error(error);
      });
    } else {
      setEnvironmentIntroEndsAt(Date.now());
    }
    
    // 如果已经在 FlowList 模式，切换场景后会自动播放
    if (!isFlowing) {
      startFlow();
    }
  };
  
  // 当前激活的环境场景
  const activeEnvironmentScene = environmentCycleIndex >= 0 && environmentCycleIndex < scenesWithBackground.length
    ? scenesWithBackground[environmentCycleIndex]
    : null;
  const activeEnvironmentSlotId = activeEnvironmentScene
    ? slotIdsByScene.get(activeEnvironmentScene)?.[0] || null
    : null;
  
  // 环境按钮是否应该显示：只要有背景效果的场景有可播放音频就显示
  const shouldShowEnvironmentButton = scenesWithBackground.length > 0;
  
  // 环境按钮是否激活
  const isEnvironmentActive = environmentCycleIndex >= 0;
  
  // 当环境激活时，同步背景效果（作为备用，主要逻辑在 handleEnvironmentButtonClick 中）
  useEffect(() => {
    if (activeEnvironmentScene) {
      // 使用 activeEnvironmentScene 的背景效果
      const config = SCENE_CONFIGS[activeEnvironmentScene];
      if (config.backgroundEffect) {
        // 确保场景标签也更新，这样背景效果能正确显示
        if (currentSceneTag !== activeEnvironmentScene) {
          setCurrentSceneTag(activeEnvironmentScene);
        }
        // 只在 useEffect 中作为备用激活（主要激活在 handleEnvironmentButtonClick 中）
        if (!sceneBackground.isActive) {
          sceneBackground.activate();
        }
      }
    } else {
      sceneBackground.deactivate();
    }
  }, [activeEnvironmentScene, sceneBackground, currentSceneTag]);
  
  // 打印机三种模式的状态管理
  const [demoPrintedContents, setDemoPrintedContents] = useState<Array<{ id: string; content: string; timestamp: number }>>([]);
  const [demoPrintIndex, setDemoPrintIndex] = useState(0); // Demo小票的打印索引
  const [conversationHistory, setConversationHistory] = useState<Array<{ source: 'input' | 'output'; text: string; timestamp: number }>>([]);
  const [manualPrintedByItemId, setManualPrintedByItemId] = useState<Map<string, Set<string>>>(new Map());
  const conversationHistoryRef = useRef<Array<{ source: 'input' | 'output'; text: string; timestamp: number }>>([]);
  const fallbackTimerRef = useRef<number | null>(null);
  const fallbackPendingRef = useRef<{
    baselineCount: number;
    historySnapshot: Array<{ source: 'input' | 'output'; text: string; timestamp: number }>;
    triggerText: string;
    startedAt: number;
  } | null>(null);

  const startFlow = () => {
    setIsFlowing(true);
  };

  const stopFlow = () => {
    setIsFlowing(false);
    setPrintedContents([]);
    // 重置Demo小票和已打印卡片记录
    setDemoPrintedContents([]);
    setDemoPrintIndex(0);
    setManualPrintedByItemId(new Map());
    setEnvironmentCycleIndex(-1);
    sceneBackground.deactivate();
    setEnvironmentSwitchToken(Date.now());
    stopEnvironmentPromptAudio();
  };

  const handleDetailViewExit = useCallback(() => {
    setPrintedContents([]);
  }, []);

  // 当音频开始播放时，清除Demo小票
  useEffect(() => {
    if (playbackState?.isPlaying && (demoPrintedContents.length > 0 || demoPrintIndex > 0)) {
      setDemoPrintedContents([]);
      setDemoPrintIndex(0);
    }
  }, [playbackState?.isPlaying]);

  // 收集实时对话历史（仅在live模式）
  const prevTranscriptionRef = useRef<string>('');
  useEffect(() => {
    if (playbackState?.playbackMode === 'live' && transcription) {
      // 避免重复添加相同的transcription（通过比较text内容）
      const transcriptionKey = `${transcription.source}:${transcription.text}`;
      if (transcriptionKey !== prevTranscriptionRef.current) {
        prevTranscriptionRef.current = transcriptionKey;
        
        const newEntry = {
          source: transcription.source,
          text: transcription.text,
          timestamp: Date.now()
        };
        
        conversationHistoryRef.current = [...conversationHistoryRef.current, newEntry];
        // 限制历史记录长度为最近20条
        if (conversationHistoryRef.current.length > 20) {
          conversationHistoryRef.current = conversationHistoryRef.current.slice(-20);
        }
        setConversationHistory([...conversationHistoryRef.current]);
      }
    }
  }, [transcription, playbackState?.playbackMode]);

  // 当停止实时对话时，清空对话历史
  useEffect(() => {
    if (playbackState?.playbackMode !== 'live') {
      conversationHistoryRef.current = [];
      setConversationHistory([]);
      prevTranscriptionRef.current = '';
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      fallbackPendingRef.current = null;
    }
  }, [playbackState?.playbackMode]);

  // Handle capture from glasses
  const handleGlassesCapture = async () => {
    try {
        // Get current asset based on index
        const currentAsset = CAPTURE_ASSETS[captureIndex];
        
        const response = await fetch(currentAsset);
        const blob = await response.blob();
        
        // Determine filename and type
        const filename = currentAsset.split('/').pop() || `capture_${Date.now()}.jpg`;
        const type = filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        
        const file = new File([blob], filename, { 
            type,
            lastModified: 1704067200000 // Fixed timestamp (2024-01-01) to ensure consistent hash for caching
        });
        setCapturedFile(file);
        
        // Cycle to next image for next capture
        setCaptureIndex(prev => (prev + 1) % CAPTURE_ASSETS.length);
        
        // Reset after a short delay so the same file can be captured again if needed
        setTimeout(() => setCapturedFile(null), 500);
    } catch (error) {
        console.error('Failed to load mock capture image:', error);
    }
  };

  // Handle record from headset (long press)
  const handleHeadsetRecord = async () => {
    try {
      const audioPath = '/assets/中考数学几何最值问题讲解_2025_12_23.m4a';
      const response = await fetch(audioPath);
      const blob = await response.blob();
      
      const file = new File([blob], '中考数学几何最值问题讲解_2025_12_23.m4a', { 
        type: 'audio/mp4',
        lastModified: 1704067200000 // Fixed timestamp to ensure consistent hash for caching
      });
      setUploadedAudioFile(file);
      
      // Reset after a short delay
      setTimeout(() => setUploadedAudioFile(null), 1000);
    } catch (error) {
      console.error('Failed to load mock audio file:', error);
    }
  };

  // Handle print trigger from knowledge cards
  const handlePrintTrigger = (card: KnowledgeCard) => {
    // Format the content for printing
    const printContent = `${card.title}\n\n${card.content}${card.tags.length > 0 ? `\n\n标签: ${card.tags.join(', ')}` : ''}`;
    // Add to printed contents array for stacking effect
    setPrintedContents(prev => [...prev, {
      id: card.id,
      content: printContent,
      timestamp: Date.now()
    }]);
    // setActiveHardware('printer'); // Removed auto switch
  };

  // 总结对话的API调用
  const summarizeConversation = async (history: Array<{ source: 'input' | 'output'; text: string; timestamp: number }>): Promise<KnowledgeCard> => {
    try {
      const response = await fetch(getApiUrl('/api/summarize-conversation'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationHistory: history.map(h => ({
            source: h.source,
            text: h.text
          }))
        })
      });

      if (!response.ok) {
        throw new Error('对话总结失败');
      }

      const data = await response.json();
      return {
        id: `summary-${Date.now()}`,
        title: data.title || '对话总结',
        content: data.content || data.summary || '暂无总结内容',
        tags: data.tags || ['对话', '总结'],
        timestamp: new Date(),
        source: 'ai_realtime'
      };
    } catch (error) {
      console.error('总结对话失败:', error);
      // 返回一个默认的总结卡片
      return {
        id: `summary-${Date.now()}`,
        title: '对话总结',
        content: '总结生成失败，请稍后再试',
        tags: ['对话', '总结'],
        timestamp: new Date(),
        source: 'ai_realtime'
      };
    }
  };

  const clearKnowledgeFallback = useCallback(() => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    fallbackPendingRef.current = null;
  }, []);

  const scheduleKnowledgeFallback = useCallback((triggerText: string) => {
    if (USE_SERVER_PRINT_FALLBACK) {
      return;
    }
    if (playbackState?.playbackMode !== 'live') {
      return;
    }

    let historySnapshot = [...conversationHistoryRef.current];
    if (historySnapshot.length === 0) {
      const trimmedTrigger = triggerText.trim();
      if (!trimmedTrigger) {
        return;
      }
      historySnapshot = [{
        source: 'output',
        text: trimmedTrigger,
        timestamp: Date.now()
      }];
    }

    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    fallbackPendingRef.current = {
      baselineCount: knowledgeCards.length,
      historySnapshot,
      triggerText,
      startedAt: Date.now()
    };

    fallbackTimerRef.current = window.setTimeout(async () => {
      const pending = fallbackPendingRef.current;
      fallbackTimerRef.current = null;
      fallbackPendingRef.current = null;

      if (!pending) {
        return;
      }

      if (playbackState?.playbackMode !== 'live') {
        return;
      }

      if (knowledgeCards.length > pending.baselineCount) {
        return;
      }

      try {
        const summaryCard = await summarizeConversation(pending.historySnapshot);
        setKnowledgeCards(prev => {
          if (prev.some(card => card.id === summaryCard.id)) {
            return prev;
          }
          return [summaryCard, ...prev];
        });
        handlePrintTrigger(summaryCard);
      } catch (error) {
        console.error('自动兜底知识小票生成失败:', error);
      }
    }, 4000);
  }, [handlePrintTrigger, knowledgeCards.length, playbackState?.playbackMode, summarizeConversation]);

  useEffect(() => {
    if (playbackState?.playbackMode !== 'live' || !transcription) {
      return;
    }
    const transcriptionText = transcription.text.toLowerCase();
    if (!PRINT_KEYWORDS.some(keyword => transcriptionText.includes(keyword.toLowerCase()))) {
      return;
    }
    scheduleKnowledgeFallback(transcription.text);
  }, [playbackState?.playbackMode, transcription, scheduleKnowledgeFallback]);

  useEffect(() => {
    const pending = fallbackPendingRef.current;
    if (!pending) {
      return;
    }
    if (knowledgeCards.length > pending.baselineCount) {
      clearKnowledgeFallback();
    }
  }, [knowledgeCards.length, clearKnowledgeFallback]);

  // 处理打印机按钮点击（三种模式）
  const handlePrintButtonClick = async () => {
    const playbackMode = playbackState?.playbackMode;

    // 情况1：音频播放模式
    if (playbackMode === 'audio' && playbackState?.currentItemId) {
      const currentItemId = playbackState.currentItemId;
      const currentItemCards = playbackState.currentItemKnowledgeCards;
      if (!currentItemId || !currentItemCards || currentItemCards.length === 0) {
        return;
      }

      const sortedCards = [...currentItemCards].sort((a, b) => {
        const timeA = a.triggerTime ?? Number.POSITIVE_INFINITY;
        const timeB = b.triggerTime ?? Number.POSITIVE_INFINITY;
        return timeA - timeB;
      });
      const currentTime = playbackState.currentTime ?? 0;
      const manualPrintedSet = manualPrintedByItemId.get(currentItemId) ?? new Set<string>();

      let nextCard = sortedCards.find(card => {
        const triggerTime = card.triggerTime ?? Number.POSITIVE_INFINITY;
        return !manualPrintedSet.has(card.id) && triggerTime <= currentTime;
      });

      if (!nextCard) {
        nextCard = sortedCards.find(card => {
          const triggerTime = card.triggerTime ?? Number.POSITIVE_INFINITY;
          return !manualPrintedSet.has(card.id) && triggerTime > currentTime;
        });
      }

      if (nextCard) {
        handlePrintTrigger(nextCard);
        setManualPrintedByItemId(prev => {
          const next = new Map(prev);
          const nextSet = new Set(next.get(currentItemId) ?? []);
          nextSet.add(nextCard.id);
          next.set(currentItemId, nextSet);
          return next;
        });
      }
      return;
    }

    // 情况2：实时对话模式
    if (playbackMode === 'live') {
      // 确保有对话历史
      if (conversationHistory.length === 0) {
        return;
      }

      try {
        // 调用API总结最近的对话
        const summaryCard = await summarizeConversation(conversationHistory);
        handlePrintTrigger(summaryCard);
      } catch (error) {
        console.error('总结对话失败:', error);
      }
      return;
    }

    // 情况3：Demo模式 - 无音频播放
    // 如果已经打印完所有Demo小票（3张），第四次点击时重置
    if (demoPrintIndex >= MOCK_DEMO_CONTENTS.length) {
      setDemoPrintedContents([]);
      setDemoPrintIndex(0);
      return;
    }
    
    // 每次点击打印一张Demo小票
    const nextCard = MOCK_DEMO_CONTENTS[demoPrintIndex];
    setDemoPrintedContents(prev => [...prev, {
      ...nextCard,
      timestamp: Date.now() // 更新时间为当前时间，确保动画效果
    }]);
    setDemoPrintIndex(prev => prev + 1);
    return;
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center py-12 px-8 font-sans overflow-x-hidden relative">
      {/* Scene Background */}
      <SceneBackground 
        backgroundEffect={activeEnvironmentScene ? SCENE_CONFIGS[activeEnvironmentScene].backgroundEffect : null} 
        isActive={isEnvironmentActive} 
      />
      
      <div className="flex flex-col w-full max-w-[1600px] mx-auto relative z-20">
        
        {/* Main Header */}
        <header className="mb-12 flex items-start justify-between">
          <div className="pl-4 border-l-4 border-neutral-800">
            <h1 className="text-3xl font-bold text-neutral-800 tracking-tight">GoFlow Station</h1>
            <p className="text-sm text-neutral-500 mt-2 font-mono tracking-wide">MULTIMODAL HARDWARE INTERFACE</p>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href="https://pan.quark.cn/s/76d86a29168c" 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-neutral-50 rounded-full border border-neutral-200 shadow-sm hover:shadow transition-all group"
            >
              <Download size={18} className="text-neutral-500 group-hover:text-indigo-600 transition-colors" />
              <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900">文件体验包</span>
            </a>
            
            <a 
              href="/assets/deepflow_deck.pdf"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGuideClick}
               className={clsx(
                 "relative flex items-center gap-2 px-5 py-2.5 rounded-full shadow-sm hover:shadow transition-all group",
                 "bg-purple-50 hover:bg-purple-100 border border-purple-200"
               )}
             >
               <Presentation size={18} className="text-purple-500 group-hover:text-purple-700 transition-colors" />
               <span className="text-sm font-medium text-purple-700 group-hover:text-purple-900">项目说明书</span>
               {!hasReadGuide && (
                 <span className="absolute -top-1 -right-1 flex h-3 w-3">
                   <span className="animate-ping-5 absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                 </span>
               )}
             </a>
          </div>
        </header>

        <div className="flex flex-col xl:flex-row gap-12 items-start justify-center">
          
          {/* Device View - Phone (Left Sidebar) */}
          <div className="flex flex-col items-center gap-6 shrink-0 relative">
              <PhoneFrame fullscreen={isFlowing}>
                  <SupplyDepotApp 
                      onStartFlow={startFlow} 
                      onStopFlow={stopFlow}
                      isFlowing={isFlowing}
                      knowledgeCards={knowledgeCards}
                      onUpdateKnowledgeCards={setKnowledgeCards}
                      currentSceneTag={currentSceneTag}
                      onSceneChange={setCurrentSceneTag}
                      environmentSwitchToken={environmentSwitchToken}
                      environmentIntroToken={environmentIntroToken}
                      environmentIntroEndsAt={environmentIntroEndsAt}
                      environmentSlotId={activeEnvironmentSlotId}
                      onPlaybackStateChange={setPlaybackState}
                      onPrintTrigger={handlePrintTrigger}
                      onTranscription={setTranscription}
                      onDetailViewExit={handleDetailViewExit}
                      externalInputFile={capturedFile}
                      externalAudioFile={uploadedAudioFile}
                      onAvailableSlotsChange={setAvailableSlots}
                  />
              </PhoneFrame>
              <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-extrabold text-neutral-800 tracking-[0.2em] uppercase">GoFlow App</span>
              </div>
          </div>

          {/* Hardware Grid (Right Side - Equal Width) */}
          <div className="flex-1 w-full max-w-[1150px] grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Headset */}
            <HardwareCard 
              productName="GoFlow Focus" 
              slogan="Immersive Audio Intelligence" 
              icon={Headphones} 
              isActive={isFlowing}
            >
                <HeadsetDevice 
                    currentSceneTag={currentSceneTag} 
                    isPlaying={isFlowing}
                    playbackState={playbackState}
                    audioUrl={null}
                    onRecord={handleHeadsetRecord}
                    onStartFlow={startFlow}
                    onActivateBackground={handleEnvironmentButtonClick}
                    currentEnvironmentScene={activeEnvironmentScene}
                    hasBackgroundEffect={shouldShowEnvironmentButton}
                />
            </HardwareCard>

            {/* Glasses */}
            <HardwareCard 
              productName="GoFlow Vision" 
              slogan="Augmented Reality Interface" 
              icon={Glasses} 
              isActive={isFlowing}
            >
              <GlassesDevice 
                onCapture={handleGlassesCapture} 
                nextImageSrc={CAPTURE_ASSETS[captureIndex]}
              />
            </HardwareCard>

            {/* Printer */}
            <HardwareCard 
              productName="GoFlow Note" 
              slogan="Physical Memory Anchor" 
              icon={Printer} 
              isActive={printedContents.length > 0 || demoPrintedContents.length > 0}
            >
                <PrinterDevice 
                  printedContents={demoPrintedContents.length > 0 ? demoPrintedContents : printedContents}
                  transcription={transcription}
                  onPrintClick={handlePrintButtonClick}
                />
            </HardwareCard>
          </div>
        </div>
      </div>
    </div>
  );
}


export default App;
