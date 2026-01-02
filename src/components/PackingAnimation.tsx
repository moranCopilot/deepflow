import { useEffect, useState } from 'react';
import { Camera, FileText, Box, Sparkles, ArrowDown, Music } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

import { StreamingScriptDisplay } from './StreamingScriptDisplay';

interface PackingAnimationProps {
    fileNames?: string[];
    streamingStatus?: {
        stage: string;
        text: string;
        scriptItems: Array<{speaker: string, text: string}>;
    };
}

export function PackingAnimation({ fileNames = [], streamingStatus }: PackingAnimationProps) {
  // Stages:
  // 1. gathering: Items appear and move towards center
  // 2. packing: Box appears, items fall in
  // 3. sealing: Box closes and seals
  // 4. processing: Box floats/glows (AI generation loop)
  const [stage, setStage] = useState<'gathering' | 'packing' | 'sealing' | 'processing'>('gathering');

  useEffect(() => {
    // If streamingStatus is provided, we might want to force stage to processing
    if (streamingStatus) {
        setStage('processing');
        return;
    }

    // Sequence timing
    const t1 = setTimeout(() => setStage('packing'), 2000); // Give more time to read filenames
    const t2 = setTimeout(() => setStage('sealing'), 3500);
    const t3 = setTimeout(() => setStage('processing'), 4500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [streamingStatus]); // Add streamingStatus dependency

  const truncateFileName = (name: string) => {
    if (name.length <= 12) return name;
    const extIndex = name.lastIndexOf('.');
    if (extIndex === -1) return name.slice(0, 9) + '...';
    
    const ext = name.slice(extIndex); // .pdf
    const namePart = name.slice(0, extIndex);
    
    // Ensure we keep the extension
    // We want total length roughly 12-15 chars visually
    // name: "verylongfilename.pdf" -> "very...pdf"
    
    return namePart.slice(0, 6) + '...' + ext;
  };

  const getFileIcon = (name: string) => {
      const ext = name.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return <Camera size={16} />;
      if (['mp3', 'wav', 'm4a'].includes(ext || '')) return <Music size={16} />;
      return <FileText size={16} />;
  };

  const itemsToDisplay = fileNames.length > 0 ? fileNames.slice(0, 3) : ['Image.jpg', 'Doc.pdf', 'Voice.mp3'];

  const getPosition = (index: number, total: number) => {
      if (total === 1) return { x: 0, y: 0, rotate: 0 };
      if (total === 2) return { 
          x: index === 0 ? -40 : 40, 
          y: 0, 
          rotate: index === 0 ? -5 : 5 
      };
      // 3 or more
      const positions = [
          { x: -60, y: -40, rotate: -10 },
          { x: 60, y: -40, rotate: 10 },
          { x: 0, y: 50, rotate: 5 }
      ];
      return positions[index] || positions[0];
  };

  return (
    <div className="relative w-full h-64 flex flex-col items-center justify-center overflow-hidden bg-slate-50/50 rounded-3xl border border-slate-100/50 shadow-inner">
      
      <div className="relative w-48 h-48 flex items-center justify-center">
        
        {/* Stage 1: Gathering Items */}
        <AnimatePresence>
          {stage === 'gathering' && (
            <motion.div 
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.5 } }}
            >
              {itemsToDisplay.map((name, index) => {
                  const pos = getPosition(index, itemsToDisplay.length);
                  return (
                    <motion.div
                        key={index}
                        initial={{ x: pos.x * 1.5, y: pos.y * 1.5, opacity: 0, rotate: pos.rotate * 2 }}
                        animate={{ x: pos.x, y: pos.y, opacity: 1, rotate: pos.rotate }}
                        transition={{ delay: 0.1 * index, type: "spring", stiffness: 100 }}
                        className="absolute top-1/2 left-1/2 -mt-6 -ml-12 w-24 h-12 bg-white text-slate-600 rounded-xl shadow-lg border border-slate-100 flex items-center gap-2 px-3 z-20"
                    >
                        <div className="text-indigo-500 shrink-0">
                            {getFileIcon(name)}
                        </div>
                        <span className="text-[10px] font-medium truncate leading-tight" title={name}>
                            {truncateFileName(name)}
                        </span>
                    </motion.div>
                  );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stage 2, 3, 4: The Box */}
        {(stage === 'packing' || stage === 'sealing' || stage === 'processing') && (
            <motion.div
                className="relative"
                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                animate={{ 
                    scale: 1, 
                    opacity: 1, 
                    y: stage === 'processing' ? [0, -10, 0] : 0 
                }}
                transition={{ 
                    y: stage === 'processing' ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : { type: "spring" }
                }}
            >
                {/* Box Body */}
                <div className="w-32 h-24 bg-gradient-to-br from-amber-200 to-amber-300 rounded-lg shadow-xl border border-amber-300/50 relative flex items-center justify-center z-20 overflow-hidden">
                    {/* Texture */}
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')] mix-blend-multiply" />
                    
                    {/* Front Flap (Open state for packing) */}
                    <motion.div 
                        className="absolute top-0 w-full h-1/2 bg-amber-300 origin-bottom border-b border-amber-400/30"
                        initial={{ rotateX: 120 }}
                        animate={{ rotateX: stage === 'sealing' || stage === 'processing' ? 0 : 120 }}
                        transition={{ duration: 0.5 }}
                    />

                    {/* Content falling in (Visual only) */}
                    <AnimatePresence>
                        {stage === 'packing' && (
                            <motion.div
                                initial={{ y: -40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 20, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="absolute z-10"
                            >
                                <ArrowDown className="text-amber-600/50 animate-bounce" size={24} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Logo/Icon on Box */}
                    <div className="z-20 flex flex-col items-center opacity-80 mix-blend-multiply">
                        <Box className="text-amber-800 w-8 h-8" strokeWidth={1.5} />
                        <span className="text-[8px] font-bold text-amber-900 mt-1 tracking-widest">DEEPFLOW</span>
                    </div>

                    {/* Processing Glow */}
                    {stage === 'processing' && (
                        <motion.div 
                            className="absolute inset-0 bg-indigo-500/20 mix-blend-overlay"
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    )}
                </div>

                {/* Box Shadow */}
                <motion.div 
                    className="absolute -bottom-4 left-4 right-4 h-2 bg-black/10 rounded-full blur-md"
                    animate={{ 
                        scale: stage === 'processing' ? [1, 0.8, 1] : 1,
                        opacity: stage === 'processing' ? [0.3, 0.1, 0.3] : 0.3
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                />

                {/* Processing Particles */}
                {stage === 'processing' && (
                    <>
                        <motion.div
                            className="absolute -top-6 right-0"
                            animate={{ y: [-5, 5, -5], rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 3, repeat: Infinity }}
                        >
                            <Sparkles className="text-indigo-500 w-6 h-6 drop-shadow-sm" />
                        </motion.div>
                        <motion.div
                            className="absolute -left-4 bottom-8"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                        >
                            <Sparkles className="text-purple-400 w-4 h-4 drop-shadow-sm" />
                        </motion.div>
                    </>
                )}
            </motion.div>
        )}
      </div>

      {/* Text Feedback */}
      <div className="mt-4 h-16 w-full relative flex items-end justify-center">
         {stage === 'processing' && streamingStatus ? (
             <StreamingScriptDisplay 
                stage={streamingStatus.stage}
                scriptItems={streamingStatus.scriptItems}
             />
         ) : (
             <div className="h-6 text-center overflow-hidden relative w-full mb-1">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={stage}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        className={clsx(
                            "text-xs font-bold uppercase tracking-widest absolute w-full",
                            stage === 'gathering' ? "text-slate-400" :
                            stage === 'packing' ? "text-amber-600" :
                            stage === 'sealing' ? "text-amber-600" :
                            "text-indigo-600"
                        )}
                    >
                        {stage === 'gathering' && "Collecting Assets..."}
                        {stage === 'packing' && "Packing Knowledge..."}
                        {stage === 'sealing' && "Sealing Package..."}
                        {stage === 'processing' && "AI Processing..."}
                    </motion.p>
                </AnimatePresence>
             </div>
         )}
      </div>

    </div>
  );
}
