import { Printer, Mic, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PrinterDeviceProps {
  printedContent: string | null;
}

export function PrinterDevice({ printedContent }: PrinterDeviceProps) {
  return (
    <div className="flex flex-col items-center gap-8 p-8 h-full justify-center">
        {/* Printer Visual */}
        <div className="relative w-72 h-48 bg-white rounded-[2rem] shadow-2xl border border-neutral-100 flex flex-col items-center justify-end pb-6 z-10 ring-1 ring-black/5">
            
            {/* Paper Animation - Now ejects downwards from the bottom slot area */}
            <AnimatePresence>
                {printedContent && (
                    <motion.div 
                        key={printedContent}
                        initial={{ y: -50, opacity: 0, height: 0 }}
                        animate={{ y: 20, opacity: 1, height: 'auto' }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 60, damping: 15 }}
                        className="absolute bottom-[-140px] w-48 bg-[#fffdf0] shadow-md border border-neutral-100 p-4 text-[10px] font-mono text-neutral-600 -z-10 origin-top rotate-0"
                    >
                        <div className="border-b border-neutral-200 pb-2 mb-2 text-center font-bold tracking-widest">DEEPFLOW NOTE</div>
                        <div className="leading-relaxed whitespace-pre-wrap">{printedContent}</div>
                        <div className="mt-4 text-center opacity-30 text-[8px]">-- END --</div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom Slot Overlay (to mask the paper start point if needed, or just visual) */}
            <div className="absolute -bottom-2 w-56 h-4 bg-gray-100 rounded-b-2xl opacity-50 blur-sm -z-20" />


            {/* Screen */}
            <div className="w-32 h-20 bg-neutral-900 rounded-xl mb-4 flex items-center justify-center overflow-hidden border-4 border-neutral-800 relative shadow-inner">
                <div className="absolute inset-0 bg-green-500/5" />
                <div className="text-green-500 font-mono text-xs p-2 z-10">
                    {printedContent ? "> 打印中..." : "> 就绪_"}
                </div>
            </div>

            {/* Controls */}
            <div className="flex gap-4 items-center">
                <div className="w-8 h-8 rounded-full bg-neutral-50 border border-neutral-100 flex items-center justify-center shadow-sm">
                    <Mic size={14} className="text-neutral-400" />
                </div>
                 <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-95 transition-transform cursor-pointer border-2 border-orange-400">
                    <Printer size={20} className="text-white" />
                </div>
                 <div className="w-8 h-8 rounded-full bg-neutral-50 border border-neutral-100 flex items-center justify-center shadow-sm">
                    <Volume2 size={14} className="text-neutral-400" />
                </div>
            </div>
            
            {/* Paper Slot Visual (Bottom) */}
            <div className="absolute bottom-0 w-48 h-1 bg-neutral-300 rounded-full mb-2" />
        </div>

        {/* Info */}
        <div className="text-center space-y-2 max-w-[240px] pt-24">
            <h3 className="font-bold text-neutral-800 text-sm">DeepFlow 打印机</h3>
            <p className="text-xs text-neutral-400">
                音频思维的物理锚点。自动打印关键公式与摘要。
            </p>
        </div>
    </div>
  );
}
