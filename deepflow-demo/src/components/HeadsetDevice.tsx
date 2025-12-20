import { useState, useEffect } from 'react';
import { Headphones, ToggleLeft, ToggleRight } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface HeadsetDeviceProps {
  currentContext: 'deep_work' | 'casual';
  onToggleContext: () => void;
  isPlaying: boolean;
}

export function HeadsetDevice({ currentContext, onToggleContext, isPlaying }: HeadsetDeviceProps) {
  // Mock waveform data
  const [bars, setBars] = useState<number[]>(new Array(12).fill(10));
  const [audioText, setAudioText] = useState<{type: 'input' | 'output', text: string} | null>(null);
  const isDeep = currentContext === 'deep_work';

  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setBars(prev => prev.map(() => Math.random() * 40 + 10));
      }, 100);
      return () => {
        clearInterval(interval);
        setBars(new Array(12).fill(10));
      };
    }
  }, [isPlaying]);

  // Simulate audio conversation
  useEffect(() => {
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
  }, [isPlaying]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-hidden">
       {/* Headset Visual - Further Reduced */}
       <div className="relative w-44 h-44 bg-neutral-900 rounded-[2rem] shadow-2xl flex items-center justify-center border-4 border-neutral-800 ring-1 ring-white/10 shrink-0 mb-6">
          <div className="absolute top-0 w-20 h-2 bg-neutral-800 rounded-b-xl" /> {/* Band */}
          
          <Headphones size={90} className="text-neutral-700" strokeWidth={1} />
          
          {/* Ear Cups Glow */}
          <div className={clsx(
              "absolute left-4 w-2 h-16 rounded-full blur-lg transition-all duration-700 opacity-60",
              isDeep ? "bg-red-500" : "bg-green-500"
          )} />
          <div className={clsx(
              "absolute right-4 w-2 h-16 rounded-full blur-lg transition-all duration-700 opacity-60",
              isDeep ? "bg-red-500" : "bg-green-500"
          )} />

          {/* Status LED */}
          <div className={clsx(
              "absolute bottom-5 w-1.5 h-1.5 rounded-full transition-colors duration-300 shadow-[0_0_15px_currentColor]",
              isDeep ? "bg-red-400 text-red-400" : "bg-green-400 text-green-400"
          )} />
       </div>

       {/* Control Panel - Compact Mode */}
       <div className="w-full max-w-[280px] bg-white/80 backdrop-blur-xl rounded-3xl p-4 shadow-xl border border-white/40 flex flex-col gap-3">
           <div className="flex justify-between items-center">
               <h3 className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">心流控制 (Flow Control)</h3>
           </div>

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
           <div className="h-8 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    {audioText && (
                        <motion.div
                            key={audioText.text}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={clsx(
                                "text-[9px] font-mono px-3 py-1.5 rounded-lg border max-w-full truncate shadow-sm",
                                audioText.type === 'input' 
                                    ? "bg-white text-neutral-600 border-neutral-200"
                                    : "bg-indigo-50 text-indigo-600 border-indigo-100"
                            )}
                        >
                            <span className="font-bold opacity-40 mr-2 text-[8px] uppercase tracking-wider">{audioText.type === 'input' ? 'User' : 'AI'}</span>
                            {audioText.text}
                        </motion.div>
                    )}
                </AnimatePresence>
           </div>

           {/* Zone Switch - Compact Integrated */}
           <div className="bg-white p-3 rounded-2xl border border-neutral-100 shadow-sm flex items-center justify-between gap-2">
               <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-1.5">
                       {isDeep ? <ToggleRight size={16} className="text-red-500"/> : <ToggleLeft size={16} className="text-green-500"/>}
                       <span className="text-xs font-bold text-neutral-700">场景切换</span>
                   </div>
                   <div className={clsx("px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide border w-fit", isDeep ? "bg-red-50/50 text-red-600 border-red-100" : "bg-green-50/50 text-green-600 border-green-100")}>
                      {isDeep ? "Deep Work" : "Casual Mode"}
                  </div>
               </div>
               
               <button 
                onClick={onToggleContext}
                className={clsx(
                    "w-10 h-6 rounded-full p-0.5 transition-colors duration-300 relative shadow-inner active:scale-95 shrink-0",
                    isDeep ? "bg-red-500" : "bg-green-400"
                )}
               >
                   <div className={clsx(
                       "w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300",
                       isDeep ? "translate-x-4" : "translate-x-0"
                   )} />
               </button>
           </div>
       </div>
    </div>
  );
}
