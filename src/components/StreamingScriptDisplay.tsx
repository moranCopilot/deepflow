import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ScriptItem {
  speaker: string;
  text: string;
}

interface StreamingScriptDisplayProps {
  stage: string;
  scriptItems: ScriptItem[];
}

export function StreamingScriptDisplay({ stage, scriptItems }: StreamingScriptDisplayProps) {
  const [currentScriptIndex, setCurrentScriptIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [visibleItems, setVisibleItems] = useState<ScriptItem[]>([]);
  
  // Ref to track script items without triggering effect re-runs
  const scriptItemsRef = useRef(scriptItems);
  useEffect(() => {
    scriptItemsRef.current = scriptItems;
  }, [scriptItems]);
  
  // Initialize with empty state when props change significantly
  useEffect(() => {
    if (scriptItems.length === 0) {
      setCurrentScriptIndex(0);
      setCharIndex(0);
      setVisibleItems([]);
      return;
    }
  }, [scriptItems.length === 0]); // Only when it becomes empty

  // Update visible items when new items arrive, but don't disrupt current typing
  useEffect(() => {
    if (scriptItems.length > visibleItems.length) {
      // Just ensure we have the data, but typing logic handles the display
      // We don't want to blindly update visibleItems as it might reset state
    }
  }, [scriptItems, visibleItems]);

  // Main typing logic
  useEffect(() => {
    // Safety check: if currentScriptIndex is out of bounds
    // But we don't want to return early if we are just waiting for data
    // Unless we have finished everything
    
    const timer = setInterval(() => {
      // Check latest items again inside interval
      const latestItems = scriptItemsRef.current;
      
      // If we don't have items yet, or index is out of bounds
      if (currentScriptIndex >= latestItems.length) {
           // We are waiting for more items. Do not clear interval yet, 
           // unless we are sure no more items will come (which we don't know here)
           // Just return and wait for next tick
           return;
      }

      const latestItem = latestItems[currentScriptIndex];
      // Safety check for empty text
      const speaker = latestItem?.speaker || 'Unknown';
      const text = latestItem?.text || '';
      
      // We only type the TEXT part, not the speaker
      const textLength = text.length;

      if (charIndex < textLength) {
        setCharIndex(prev => prev + 1);
      } else {
        // Finished typing this line
        clearInterval(timer);
        
        // Move to next line after a small pause
        setTimeout(() => {
          setVisibleItems(prev => {
            const newItems = [...prev, latestItem || {speaker, text}];
            return newItems.slice(-3); 
          });
          setCurrentScriptIndex(prev => prev + 1);
          setCharIndex(0);
        }, 100);
      }
    }, 20); // Typing speed (50% faster: 30ms -> 20ms)

    return () => clearInterval(timer);
  }, [currentScriptIndex, charIndex, scriptItems.length]); // Add scriptItems.length back to dependency to revive timer

  // Determine what to show based on stage
  const getStatusText = () => {
    switch (stage) {
      case 'preparing': return '正在准备文件...';
      case 'uploading': return '正在上传文件...';
      case 'connecting_ai': return '正在连接 Gemini 模型...';
      case 'analyzing': return '正在分析内容...';
      case 'generating_title': return '正在生成标题...';
      case 'generating_script': return '正在生成脚本...';
      case 'generating_cards': return '正在生成知识卡片...';
      default: return 'AI Processing...';
    }
  };

  // If in early stages, just show the status text
  if (stage === 'analyzing' || stage === 'generating_title' || scriptItems.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center">
         <motion.p
            key={stage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-indigo-600 text-xs font-bold uppercase tracking-widest animate-pulse"
        >
            {getStatusText()}
        </motion.p>
      </div>
    );
  }

  // Calculate text to display
  // We want to show speaker immediately, then type the text
  const activeItem = scriptItemsRef.current[currentScriptIndex];
  const currentTextToType = activeItem?.text || '';
  // Ensure we don't exceed text length
  const currentDisplayedText = currentTextToType.substring(0, Math.min(charIndex, currentTextToType.length));
  
  // If we are waiting for text but have speaker, show cursor
  // If charIndex is 0 and we have an item, it means we just started this line
  const showCursor = activeItem && (charIndex < currentTextToType.length || charIndex === 0);

  return (
    <div className="h-16 w-full max-w-md mx-auto relative overflow-hidden flex flex-col justify-end pb-1 font-mono text-xs leading-5">
      {/* Gradient Masks for fade in/out */}
      <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-white to-transparent z-10" />
      
      {/* Previous lines (fading out) */}
      <AnimatePresence>
        {visibleItems.map((item, index) => (
          <motion.div
            key={`${index}-${item.text.substring(0, 10)}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.5, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-slate-400 px-4 whitespace-nowrap overflow-hidden text-ellipsis flex items-center"
          >
             <span className={clsx(
                "font-bold mr-2 shrink-0",
                item.speaker === 'Deep' ? "text-blue-400" : "text-emerald-400"
            )}>
                {item.speaker}:
            </span>
            <span>{item.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Current typing line */}
      <AnimatePresence mode='wait'>
            {activeItem && (
                <motion.div
                    key={`current-${currentScriptIndex}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-slate-700 px-4 flex items-start"
                >
                     <span className={clsx(
                        "font-bold mr-2 shrink-0",
                        activeItem.speaker === 'Deep' ? "text-blue-600" : "text-emerald-600"
                    )}>
                        {activeItem.speaker}:
                    </span>
                    <span className="relative">
                        {currentDisplayedText}
                        {showCursor && (
                           <span className="inline-block w-1.5 h-3 bg-indigo-500 ml-1 animate-pulse align-middle" />
                        )}
                    </span>
                </motion.div>
            )}
      </AnimatePresence>
      
      {/* Status indicator when waiting or finished */}
      {!activeItem && (
          <div className="px-4 text-slate-400 italic text-[10px] mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            {getStatusText()}
          </div>
      )}
    </div>
  );
}
