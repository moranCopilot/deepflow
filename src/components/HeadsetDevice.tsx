import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, Sparkles, Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const HEADSET_IMAGES = [
  '/assets/hardware/headset1.png',
  '/assets/hardware/headset2.png',
  '/assets/hardware/headset3.png',
  '/assets/hardware/headset4.png',
  '/assets/hardware/headset5.png'
];
import type { FlowPlaybackState } from './SupplyDepotApp';
import { type SceneTag, SCENE_CONFIGS } from '../config/scene-config';

interface HeadsetDeviceProps {
  currentSceneTag: SceneTag;
  isPlaying: boolean;
  playbackState: FlowPlaybackState | null;
  audioUrl: string | null;
  onStartFlow?: () => void;
  onRecord?: () => void;
  onActivateBackground?: () => void;
  currentEnvironmentScene?: SceneTag | null;
  hasBackgroundEffect?: boolean;
}

export function HeadsetDevice({ 
  currentSceneTag, 
  isPlaying, 
  playbackState, 
  audioUrl,
  onStartFlow,
  onRecord,
  onActivateBackground,
  currentEnvironmentScene = null,
  hasBackgroundEffect = false
}: HeadsetDeviceProps) {
  const promptAudioRef = useRef<HTMLAudioElement>(null);
  // Mock waveform data
  const [bars, setBars] = useState<number[]>(new Array(12).fill(10));
  const [audioText, setAudioText] = useState<{type: 'input' | 'output', text: string} | null>(null);
  const isDeep = currentSceneTag === 'focus' || currentSceneTag === 'qa_memory';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Handle button interactions
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    longPressTimerRef.current = setTimeout(() => {
        setIsLongPressing(true);
    }, 500); // 500ms threshold for long press
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }

    if (isLongPressing) {
        // Was long pressing, now released -> Stop recording and upload
        setIsLongPressing(false);
        handleRecord();
    } else {
        // Short press -> Click
        // 确保重置 isLongPressing 状态（防止状态残留）
        setIsLongPressing(false);
        onStartFlow?.();
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    e.preventDefault();
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }
    setIsLongPressing(false);
  };

  const handleRecord = () => {
    if (isRecording) return;
    
    setIsRecording(true);
    onRecord?.();
    
    // Reset recording state after a short delay
    setTimeout(() => setIsRecording(false), 2000);
  };
  
  // 逐字显示相关状态
  const [displayedText, setDisplayedText] = useState<string>('');
  const [fullText, setFullText] = useState<string>('');
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const previousTextRef = useRef<string>('');
  
  // 同步音频播放（仅用于单条播放模式）
  useEffect(() => {
    if (audioRef.current && playbackState?.playbackMode === 'audio' && audioUrl) {
      // 更新音频源
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
      }
      
      // 同步播放状态
      if (playbackState.isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(err => {
          console.error('Headset audio play failed:', err);
        });
      } else if (!playbackState.isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      
      // 同步播放进度（可选，避免双重播放时使用静音）
      // audioRef.current.volume = 0; // 静音，避免双重播放
    }
  }, [audioUrl, playbackState?.playbackMode, playbackState?.isPlaying]);
  
  // 清理定时器
  const clearDisplayTimer = () => {
    if (displayTimerRef.current) {
      clearInterval(displayTimerRef.current);
      displayTimerRef.current = null;
    }
  };

  // 自动滚动到底部
  const scrollToEnd = () => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTo({
        left: textContainerRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  };

  // 根据音频播放进度同步字幕显示（智能同步算法）
  useEffect(() => {
    if (!playbackState?.currentText) {
      previousTextRef.current = '';
      setAudioText(null);
      setDisplayedText('');
      setFullText('');
      return;
    }

    // 根据播放模式确定文本类型
    const textType = playbackState.playbackMode === 'live' 
      ? (playbackState.currentText.includes('用户') || playbackState.currentText.includes('User') ? 'input' : 'output')
      : 'output'; // 单条播放默认为输出
    
    const newFullText = playbackState.currentText;
    
    // 如果文本发生变化，更新完整文本
    if (newFullText !== previousTextRef.current) {
      previousTextRef.current = newFullText;
      setFullText(newFullText);
    }

    // 智能字幕同步算法
    let displayCharCount = 0;
    
    if (playbackState.subtitleStartTime !== undefined && playbackState.subtitleEndTime !== undefined && playbackState.currentTime !== undefined) {
      const startTime = playbackState.subtitleStartTime;
      const endTime = playbackState.subtitleEndTime;
      const currentTime = playbackState.currentTime;
      const timeRange = endTime - startTime;
      
      // 如果时间范围太小或无效，直接显示全部
      if (timeRange <= 0 || timeRange > 60) {
        displayCharCount = newFullText.length;
      } else {
        // 计算当前播放进度（0-1）
        const rawProgress = Math.min(1, Math.max(0, (currentTime - startTime) / timeRange));
        
        // 使用非线性进度曲线，让字幕显示更平滑
        // 前面稍慢，中间正常，后面稍快（避免最后等待）
        let adjustedProgress: number;
        if (rawProgress < 0.3) {
          // 前30%：使用平方根曲线，让开始更慢
          adjustedProgress = Math.sqrt(rawProgress / 0.3) * 0.25;
        } else if (rawProgress < 0.7) {
          // 中间40%：线性增长
          adjustedProgress = 0.25 + (rawProgress - 0.3) / 0.4 * 0.5;
        } else {
          // 后30%：使用平方曲线，让结束更快
          const remainingProgress = (rawProgress - 0.7) / 0.3;
          adjustedProgress = 0.75 + Math.pow(remainingProgress, 0.7) * 0.25;
        }
        
        // 确保进度在合理范围内
        adjustedProgress = Math.min(0.95, Math.max(0, adjustedProgress));
        
        // 根据调整后的进度计算字符数
        displayCharCount = Math.floor(adjustedProgress * newFullText.length);
        
        // 确保至少显示1个字符（如果进度>0且文本不为空）
        if (rawProgress > 0.05 && newFullText.length > 0 && displayCharCount === 0) {
          displayCharCount = 1;
        }
      }
    } else if (playbackState.currentTime !== undefined && playbackState.subtitleStartTime !== undefined) {
      // 有开始时间但没有结束时间，使用智能语速计算
      const startTime = playbackState.subtitleStartTime;
      const currentTime = playbackState.currentTime;
      const elapsedTime = currentTime - startTime;
      
      if (elapsedTime < 0) {
        displayCharCount = 0;
      } else {
        // 根据文本长度动态调整语速
        // 短文本（<20字符）：每秒4个字符
        // 中等文本（20-50字符）：每秒3.5个字符
        // 长文本（>50字符）：每秒3个字符
        const textLength = newFullText.length;
        let charsPerSecond: number;
        if (textLength < 20) {
          charsPerSecond = 4;
        } else if (textLength < 50) {
          charsPerSecond = 3.5;
        } else {
          charsPerSecond = 3;
        }
        
        displayCharCount = Math.min(newFullText.length, Math.floor(elapsedTime * charsPerSecond));
      }
    } else {
      // 没有时间信息，直接显示全部（fallback）
      displayCharCount = newFullText.length;
    }

    // 更新显示的文本
    const newDisplayedText = newFullText.slice(0, displayCharCount);
    setDisplayedText(newDisplayedText);
    
    // 更新 audioText 以触发重新渲染
    setAudioText({
      type: textType,
      text: newDisplayedText
    });
    
    // 自动滚动到底部
    setTimeout(scrollToEnd, 0);
  }, [playbackState?.currentText, playbackState?.currentTime, playbackState?.subtitleStartTime, playbackState?.subtitleEndTime, playbackState?.playbackMode]);

  useEffect(() => {
    // 使用 playbackState 的 isPlaying 或 fallback 到 isPlaying prop
    const actuallyPlaying = playbackState?.isPlaying ?? isPlaying;
    
    if (actuallyPlaying) {
      const interval = setInterval(() => {
        setBars(prev => prev.map(() => Math.random() * 40 + 10));
      }, 100);
      return () => {
        clearInterval(interval);
        setBars(new Array(12).fill(10));
      };
    }
  }, [isPlaying, playbackState?.isPlaying]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearDisplayTimer();
    };
  }, []);

  // 模拟音频对话（仅在无 playbackState 时使用，作为 fallback）
  useEffect(() => {
    // 如果有 playbackState，使用真实数据，不再使用模拟数据
    if (playbackState) {
      return;
    }
    
    if (isPlaying) {
       const texts = [
           { type: 'input', text: '...我觉得这个语法点很难...' },
           { type: 'output', text: '正在为你生成相关例句...' },
           { type: 'input', text: '虚拟语气怎么用？' },
           { type: 'output', text: '已检索到相关知识卡片...' },
       ] as const;
       let index = 0;
       // Initial delay
       const timer1 = setTimeout(() => {
            setAudioText(texts[0]);
       }, 1000);

       const interval = setInterval(() => {
           index++;
           setAudioText(texts[index % texts.length]);
       }, 4000);

       return () => {
           clearTimeout(timer1);
           clearInterval(interval);
           setAudioText(null);
       };
    } else {
        setAudioText(null);
    }
  }, [isPlaying, playbackState]);

  return (
    <div className="flex flex-col items-center h-full w-full">
       {/* 隐藏的音频元素，用于同步播放（仅单条播放模式） */}
       {playbackState?.playbackMode === 'audio' && audioUrl && (
         <audio
           ref={audioRef}
           className="hidden"
           src={audioUrl}
           // volume={0} // 静音，避免双重播放（HTMLAudioElement 没有 volume 属性，使用 muted）
           muted
         />
       )}
       
       {/* 提示音频元素 */}
       <audio ref={promptAudioRef} className="hidden" />
       
       {/* Headset Visual - Further Reduced */}
       <div 
          className="relative w-full max-w-[18rem] aspect-[3/2] h-auto bg-neutral-900 rounded-[2rem] shadow-2xl flex items-center justify-center border-4 border-neutral-800 ring-1 ring-white/10 mb-6 group cursor-pointer overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setShowModal(true)}
       >
          <div className="absolute top-0 w-20 h-2 bg-neutral-800 rounded-b-xl" /> {/* Band */}
          
          <Headphones size={90} className="text-neutral-700" strokeWidth={1} />
          
          {/* Ear Cups Glow */}
          <div className={clsx(
              "absolute left-16 w-2 h-16 rounded-full blur-lg transition-all duration-700 opacity-60",
              isDeep ? "bg-red-500" : "bg-green-500"
          )} />
          <div className={clsx(
              "absolute right-16 w-2 h-16 rounded-full blur-lg transition-all duration-700 opacity-60",
              isDeep ? "bg-red-500" : "bg-green-500"
          )} />

          {/* Status LED */}
          <div className={clsx(
              "absolute top-6 right-8 w-1.5 h-1.5 rounded-full transition-colors duration-300 shadow-[0_0_15px_currentColor]",
              isDeep ? "bg-red-400 text-red-400" : "bg-green-400 text-green-400"
          )} />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 text-[10px] text-neutral-200 font-mono tracking-widest">
            查看硬件设计图
          </div>

          {/* Expand Button Overlay */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-20"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(true);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-md transition-all duration-200 transform hover:scale-110 border border-white/20 shadow-lg"
                  title="查看实物图"
                >
                  <Maximize2 size={24} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
       </div>

       {/* Full Image Modal - Portal to Body */}
       {createPortal(
         <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-8"
              onClick={() => setShowModal(false)}
            >
              {/* Close Button */}
              <button
                className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors bg-white/10 p-2 rounded-full z-50 hover:bg-white/20"
                onClick={() => setShowModal(false)}
              >
                <X size={24} />
              </button>

              {/* Main Content Area */}
              <div className="flex-1 w-full max-w-6xl flex items-center justify-between gap-4 relative" onClick={(e) => e.stopPropagation()}>
                
                {/* Previous Button */}
                <button 
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all transform hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(prev => (prev === 0 ? HEADSET_IMAGES.length - 1 : prev - 1));
                  }}
                >
                  <ChevronLeft size={32} />
                </button>

                {/* Main Image */}
                <div className="flex-1 flex items-center justify-center h-full max-h-[70vh] relative overflow-hidden px-4">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={currentImageIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      src={HEADSET_IMAGES[currentImageIndex]}
                      alt={`Headset View ${currentImageIndex + 1}`}
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                      draggable={false}
                    />
                  </AnimatePresence>
                </div>

                {/* Next Button */}
                <button 
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all transform hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(prev => (prev === HEADSET_IMAGES.length - 1 ? 0 : prev + 1));
                  }}
                >
                  <ChevronRight size={32} />
                </button>
              </div>

              {/* Thumbnails */}
              <div className="h-24 mt-6 flex items-center justify-center gap-4 w-full overflow-x-auto p-2" onClick={(e) => e.stopPropagation()}>
                {HEADSET_IMAGES.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={clsx(
                      "relative h-20 w-32 rounded-lg overflow-hidden transition-all duration-300 border-2 bg-black/50",
                      currentImageIndex === idx 
                        ? "border-white scale-110 shadow-lg shadow-white/20" 
                        : "border-transparent opacity-50 hover:opacity-100 hover:scale-105 border-white/10"
                    )}
                  >
                    <img 
                      src={img} 
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-contain p-1"
                    />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
         </AnimatePresence>,
         document.body
       )}

       {/* Control Panel - Compact Mode */}
       <div className="w-full max-w-[320px] flex flex-col gap-4 items-center">
           {/* GoFlow Button */}
            <div className="flex flex-col items-center gap-2">
                 <button 
                     onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                    className={clsx(
                        "group relative flex items-center justify-center w-14 h-14 rounded-full bg-white border-4 border-neutral-200 shadow-xl active:scale-95 transition-all duration-200 hover:border-neutral-300 outline-none select-none",
                        (isRecording || isLongPressing) && "border-red-400"
                    )}
                >
                    <div className="absolute inset-0 rounded-full border border-neutral-100" />
                    
                    {/* Long Press Animation Ring */}
                    <AnimatePresence>
                        {isLongPressing && (
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1.5, opacity: 0.5 }}
                                exit={{ scale: 1.8, opacity: 0 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute inset-0 rounded-full bg-red-400/30 z-0"
                            />
                        )}
                    </AnimatePresence>

                    <Headphones size={24} className={clsx(
                        "text-neutral-600 transition-transform duration-300 z-10",
                        isRecording ? "text-red-500 animate-pulse" : (isLongPressing ? "scale-90 text-red-500" : "group-hover:scale-110")
                    )} />
                </button>
                <span className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase">
                    {isRecording ? "RECORDING..." : (isLongPressing ? "RELEASE TO SEND" : "GoFlow")}
                </span>
                <span className="text-[9px] text-neutral-400">
                    (a) 点击进入 GoFlow
                </span>
                <span className="text-[9px] text-neutral-400">
                    (b) 长按模拟录音（采用预设的音频）
                </span>
           </div>

           {/* Environment Awareness Button */}
           {onActivateBackground && hasBackgroundEffect && (
            <div className="flex flex-col items-center gap-1.5">
                <button
                    onClick={() => {
                      onActivateBackground();
                    }}
                    className="group relative flex items-center justify-center w-12 h-12 rounded-full border-2 shadow-lg active:scale-95 transition-all duration-200 outline-none select-none bg-white border-neutral-200 hover:border-neutral-300"
                >
                    <Sparkles 
                        size={18} 
                        className="transition-colors duration-300 text-neutral-600"
                    />
                </button>
                <span className="text-[9px] text-neutral-400 font-mono tracking-widest uppercase">
                    {currentEnvironmentScene 
                      ? SCENE_CONFIGS[currentEnvironmentScene].label 
                      : "切换环境"}
                </span>
                <span className="text-[9px] text-neutral-400">
                    点击模拟环境触发（采用预设的 3 种环境）
                </span>
            </div>
          )}

           {/* Audio Visualizer */}
           <div className="h-8 flex items-center justify-center gap-1">
                {bars.map((h, i) => (
                    <motion.div 
                        key={i}
                        animate={{ height: h * 0.6 }}
                        className={clsx("w-1 rounded-full", isDeep ? "bg-red-500" : "bg-green-300")}
                    />
                ))}
           </div>
           
           {/* Real-time Text */}
           <div className="h-8 flex items-center justify-center w-full">
                <AnimatePresence mode="wait">
                    {audioText && (
                        <motion.div
                            key={fullText || audioText.text}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={clsx(
                                "text-[9px] font-mono px-3 py-1.5 rounded-lg border shadow-sm",
                                "max-w-full overflow-x-auto overflow-y-hidden whitespace-nowrap",
                                "scrollbar-hide", // 隐藏滚动条但保持功能
                                audioText.type === 'input' 
                                    ? "bg-white text-neutral-600 border-neutral-200"
                                    : "bg-indigo-50 text-indigo-600 border-indigo-100"
                            )}
                            ref={textContainerRef}
                            style={{
                                scrollBehavior: 'smooth'
                            }}
                        >
                            <span className="font-bold opacity-40 mr-2 text-[8px] uppercase tracking-wider shrink-0">{audioText.type === 'input' ? 'User' : 'AI'}</span>
                            <span>{displayedText || audioText.text}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
           </div>
       </div>
    </div>
  );
}
