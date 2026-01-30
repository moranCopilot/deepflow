/**
 * [INPUT]: 依赖 {FlowItem, ItemScript} 的 {数据}
 * [OUTPUT]: 提供 {Item详情弹窗组件}
 * [POS]: components 的 {Item详情Modal}
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Play, Pause, Library, AlignLeft, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { type FlowItem } from './SupplyDepotApp';
import { type ItemScript, loadItemScript } from '../utils/script-loader';

interface ItemDetailModalProps {
  item: FlowItem;
  onClose: () => void;
}

/* ========== LocalStorage Keys ========== */
const PROGRESS_KEY = 'deepflow_item_progress';

/* ========== Progress Types ========== */
interface SavedProgress {
  itemId: string;
  currentTime: number;
  playbackRate: number;
  savedAt: number;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  const [scriptData, setScriptData] = useState<ItemScript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const progressSaveTimerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 加载逐字稿数据
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      // 如果 item 上已有 script，直接使用
      if (item.script && item.script.length > 0) {
        // FlowItem mode ('single' | 'dual') -> ItemScript mode ('quick_summary' | 'deep_analysis')
        const modeMapping: Record<string, 'quick_summary' | 'deep_analysis'> = {
          'single': 'quick_summary',
          'dual': 'deep_analysis'
        };

        setScriptData({
          itemId: item.id,
          title: item.title,
          mode: modeMapping[item.mode] || 'quick_summary',
          script: item.script,
          knowledgeCards: item.knowledgeCards || [],
          contentCategory: item.contentCategory || { main: '', aux: [] },
          metadata: {
            duration: item.duration || '00:00',
            wordCount: 0,
            createdAt: new Date().toISOString(),
            source: 'local'
          }
        });
        setIsLoading(false);
        return;
      }

      // 否则从 scriptUrl 加载（社区 UGC 内容）
      const scriptUrl = (item as any).scriptUrl as string | undefined;
      if (scriptUrl) {
        const data = await loadItemScript(item.id);
        if (data) {
          setScriptData(data);
        }
      }

      setIsLoading(false);
    };
    loadData();
  }, [item]);

  // 同步 isPlaying 到 ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 同步 currentTime 到 ref
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // 倍速同步到 audio 元素
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  /* ========== Progress Persistence ========== */

  const saveProgress = () => {
    if (!audioRef.current) return;
    try {
      const progress: SavedProgress = {
        itemId: item.id,
        currentTime: audioRef.current.currentTime,
        playbackRate: playbackRate,
        savedAt: Date.now()
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // ignore
    }
  };

  const clearProgress = () => {
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      // ignore
    }
  };

  // 定时保存进度
  useEffect(() => {
    if (!isPlaying) return;
    progressSaveTimerRef.current = setInterval(() => {
      saveProgress();
    }, 3000);
    return () => {
      if (progressSaveTimerRef.current) {
        clearInterval(progressSaveTimerRef.current);
        progressSaveTimerRef.current = null;
      }
    };
  }, [isPlaying, item.id, playbackRate]);

  // 组件卸载时保存进度
  useEffect(() => {
    return () => {
      saveProgress();
    };
  }, [item.id, playbackRate]);

  // 计算当前行索引（平均时长法）
  const currentLineIndex = useMemo(() => {
    if (!scriptData || !scriptData.script.length || duration <= 0) return 0;
    const avgTimePerLine = duration / scriptData.script.length;
    return Math.min(Math.floor(currentTime / avgTimePerLine), scriptData.script.length - 1);
  }, [currentTime, duration, scriptData]);

  // 同步 active line index
  useEffect(() => {
    setActiveLineIndex(currentLineIndex);
  }, [currentLineIndex]);

  // 自动滚动到当前行
  useEffect(() => {
    if (!isPlaying || currentLineIndex === 0) return;

    const activeLine = document.getElementById(`script-line-${currentLineIndex}`);
    if (activeLine) {
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLineIndex, isPlaying]);

  // 滚动监听，自动收窄播放器
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 100;
      setIsHeaderCollapsed(container.scrollTop > threshold);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 加载保存的进度
  useEffect(() => {
    if (!audioRef.current || !item.audioUrl) return;

    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as SavedProgress;
      if (saved.itemId !== item.id) {
        // 不同 item，清除旧进度
        clearProgress();
        return;
      }

      // 恢复播放位置和倍速
      if (saved.currentTime > 0) {
        audioRef.current.currentTime = saved.currentTime;
        setCurrentTime(saved.currentTime);
      }
      if (saved.playbackRate && saved.playbackRate !== 1) {
        setPlaybackRate(saved.playbackRate);
      }
    } catch {
      // ignore parse errors
    }
  }, [item.id, item.audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !item.audioUrl) return;

    if (isPlayingRef.current) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const copyScriptAsMarkdown = () => {
    if (!scriptData?.script) return;

    const markdown = scriptData.script
      .map(line => `**${line.speaker}**: ${line.text}`)
      .join('\n\n');

    navigator.clipboard.writeText(markdown);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const cleanTitle = item.title.replace(/^(速听精华：|深度剖析：|提问练习：|回家路上：|静坐专注：|问答式记忆：)/, '');
  // UGC mode: 'quick_summary' | 'deep_analysis', FlowItem mode: 'single' | 'dual'
  const isDeepAnalysis = scriptData?.mode === 'deep_analysis' || item.mode === 'dual';

  if (isLoading) {
    return (
      <div className="absolute inset-0 z-50 bg-white flex flex-col items-center justify-center">
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    );
  }

  if (!scriptData) {
    return (
      <div className="absolute inset-0 z-50 bg-white flex flex-col">
        <div className="p-4 flex justify-end">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <p className="text-slate-500 text-sm">暂无内容</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
      {/* Audio Element - 始终渲染，避免条件渲染导致 ref 为 null */}
      <audio
        ref={audioRef}
        src={item.audioUrl || undefined}
        className="hidden"
        onTimeUpdate={() => {
          if (audioRef.current) {
            const t = audioRef.current.currentTime;
            setCurrentTime(t);
            currentTimeRef.current = t;
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setCurrentTime(0);
          clearProgress();
        }}
        onPlay={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }}
        onPause={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }}
      />

      {/* Integrated Header with Player */}
      <div className={clsx(
        "relative bg-slate-900 overflow-hidden transition-all duration-300",
        isHeaderCollapsed ? "max-h-24" : "max-h-96"
      )}>
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 to-slate-900 z-0" />

        {/* Content */}
        <div className="relative z-10 text-white">
          {/* Close Button Row */}
          <div className="flex justify-end px-2 pt-2">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Title Section - 收窄时隐藏 */}
          {!isHeaderCollapsed && (
            <div className="pb-6 px-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx(
                  "text-[10px] px-2 py-1 rounded-full font-medium",
                  isDeepAnalysis ? "bg-indigo-500/30 text-indigo-300" : "bg-emerald-500/30 text-emerald-300"
                )}>
                  {isDeepAnalysis ? "深度剖析" : "速听精华"}
                </span>
              </div>
              <h2 className="font-bold text-lg leading-tight">{cleanTitle}</h2>
            </div>
          )}

          {/* 走马灯字幕 - 始终显示 */}
          {scriptData.script && scriptData.script.length > 0 && (
            <div className="px-4 pb-3">
              <div className="bg-white/10 rounded-lg px-3 py-2 overflow-hidden">
                <div className="text-xs text-slate-200 truncate">
                  {scriptData.script[activeLineIndex]?.speaker}: {scriptData.script[activeLineIndex]?.text}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Section: Player Controls */}
          {item.audioUrl && (
            <div className={clsx(
              "flex flex-col gap-4 w-full px-4",
              isHeaderCollapsed ? "pb-2" : "pb-6"
            )}>
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
              </div>

              {/* Playback Controls Row */}
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-900 transition-all hover:scale-105"
                >
                  {isPlaying ? (
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div ref={scrollContainerRef} className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-8">

          {/* Knowledge Cards Section */}
          {scriptData.knowledgeCards && scriptData.knowledgeCards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-orange-600">
                <Library size={16} />
                <h3 className="text-xs font-bold uppercase tracking-wider">核心知识点</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {scriptData.knowledgeCards.map((card, idx) => (
                  <div key={card.id || idx} className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">{card.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{card.content}</p>
                    {card.tags && card.tags.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
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
          {scriptData.script && scriptData.script.length > 0 && (
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
                {scriptData.script.map((line, i) => (
                  <div
                    key={i}
                    id={`script-line-${i}`}
                    className={clsx(
                      "flex flex-col gap-1 transition-colors duration-300",
                      i === activeLineIndex && "bg-indigo-100 -mx-2 px-2 rounded"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={clsx(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]",
                        line.speaker === '老师' || line.speaker === 'Deep' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
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
  );
};
