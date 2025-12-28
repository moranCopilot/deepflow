import { Glasses, Camera, Loader2, ExternalLink, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const GLASSES_IMAGES = [
  '/assets/hardware/glass1.png',
  '/assets/hardware/glass2.png'
];

interface GlassesDeviceProps {
  onCapture?: () => void;
  nextImageSrc: string;
}

export function GlassesDevice({ onCapture, nextImageSrc }: GlassesDeviceProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [showFlashThumbnail, setShowFlashThumbnail] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<string[]>([]);
  const [tempCaptureImage, setTempCaptureImage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleCapture = () => {
    if (isCapturing) return;
    
    // Store current image for the animation sequence
    const currentImage = nextImageSrc;
    setTempCaptureImage(currentImage);

    // 1. Start Shutter & Flash
    setIsCapturing(true);
    setIsSynced(false);
    
    // Trigger parent callback
    if (onCapture) {
        onCapture();
    }

    // 2. Show Flash Thumbnail after flash peaks (200ms)
    setTimeout(() => {
        setShowFlashThumbnail(true);
    }, 200);

    // 3. End Thumbnail Flash & Update Persistent Photo (1.2s total)
    setTimeout(() => {
        setShowFlashThumbnail(false);
        setIsCapturing(false);
        setIsSynced(true);
        setRecentPhotos(prev => {
            const newPhotos = [currentImage, ...prev];
            return newPhotos.slice(0, 4);
        });
        
        // Reset sync message after 2s
        setTimeout(() => setIsSynced(false), 2000);
    }, 1200);
  };

  return (
    <div className="flex flex-col items-center w-full h-full relative">
        {/* Glasses Visual */}
        <div 
            className="relative w-full max-w-[18rem] aspect-[3/2] h-auto bg-neutral-900 rounded-[2rem] shadow-2xl flex items-center justify-center border-4 border-neutral-800 ring-1 ring-white/10 mb-6 overflow-hidden cursor-pointer group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setShowModal(true)}
        >
            {/* Flash Overlay */}
            <AnimatePresence>
                {isCapturing && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-white z-50 pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Bridge */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-neutral-700 rounded-full" />
            
            <Glasses size={80} className="text-neutral-500 opacity-80" strokeWidth={1.5} />
            
            {/* Lenses Reflection */}
            <div className="absolute top-16 left-16 w-16 h-12 bg-gradient-to-tr from-blue-500/20 to-transparent rounded-full blur-md" />
            <div className="absolute top-16 right-16 w-16 h-12 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-md" />

            {/* Status LED */}
            <div className={clsx(
                "absolute top-6 right-8 w-1.5 h-1.5 rounded-full transition-all duration-300",
                isCapturing ? "bg-red-500 shadow-[0_0_12px_#ef4444] animate-ping" : 
                isSynced ? "bg-green-500 shadow-[0_0_8px_#22c55e]" :
                "bg-amber-500/50 shadow-[0_0_8px_currentColor] animate-pulse"
            )} />

            {/* HUD / Info Display inside glasses */}
            <div className="absolute bottom-4 w-full flex justify-center">
                 <AnimatePresence mode="wait">
                    {isCapturing ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10"
                        >
                            <Loader2 size={10} className="text-white animate-spin" />
                            <span className="text-[10px] font-mono text-white tracking-wider">CAPTURING...</span>
                        </motion.div>
                    ) : isSynced ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-2 px-3 py-1 bg-green-500/20 backdrop-blur-md rounded-full border border-green-500/30"
                        >
                            <span className="text-[10px] font-mono text-green-400 tracking-wider">SYNCED</span>
                        </motion.div>
                    ) : null}
                 </AnimatePresence>
            </div>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 text-[10px] text-neutral-200 font-mono tracking-widest">
                查看硬件设计图
            </div>

            {/* Expand Button Overlay */}
            <AnimatePresence>
            {isHovered && !isCapturing && (
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
                        setCurrentImageIndex(prev => (prev === 0 ? GLASSES_IMAGES.length - 1 : prev - 1));
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
                        src={GLASSES_IMAGES[currentImageIndex]}
                        alt={`Glasses View ${currentImageIndex + 1}`}
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
                        setCurrentImageIndex(prev => (prev === GLASSES_IMAGES.length - 1 ? 0 : prev + 1));
                    }}
                    >
                    <ChevronRight size={32} />
                    </button>
                </div>

                {/* Thumbnails */}
                <div className="h-24 mt-6 flex items-center justify-center gap-4 w-full overflow-x-auto p-2" onClick={(e) => e.stopPropagation()}>
                    {GLASSES_IMAGES.map((img, idx) => (
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

        {/* Flash Thumbnail Overlay (Centered on screen) */}
        <AnimatePresence>
            {showFlashThumbnail && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 0 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 50 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none w-[25%] min-w-[120px]"
                    style={{ marginTop: '-40px' }} // Offset to center visually over glasses
                >
                    <div className="p-1.5 bg-white rounded-xl shadow-2xl rotate-3">
                        <img 
                            src={tempCaptureImage || nextImageSrc} 
                            alt="Captured" 
                            className="w-full h-auto rounded-lg border border-neutral-100 bg-white"
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Info / Placeholder Text */}
        <div className="w-full max-w-[280px] flex flex-col gap-4 items-center text-center">
             {/* Shutter Button */}
             <button 
                onClick={handleCapture}
                disabled={isCapturing}
                className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-white border-4 border-neutral-200 shadow-xl active:scale-95 transition-all duration-200 hover:border-neutral-300 outline-none"
             >
                <div className="absolute inset-0 rounded-full border border-neutral-100" />
                <Camera size={24} className={clsx(
                    "text-neutral-600 transition-transform duration-300",
                    isCapturing ? "scale-90" : "group-hover:scale-110"
                )} />
             </button>
             
             {/* Persistent Photo Display (Ticket Style Stack) */}
             <div className="relative w-full h-[140px] flex justify-center items-end perspective-[1000px]">
                 <AnimatePresence>
                    {recentPhotos.length > 0 ? (
                        recentPhotos.map((photo, index) => (
                            <motion.div
                                key={`${photo}-${index}`}
                                initial={{ opacity: 0, y: 50, scale: 0.8, rotateX: 20 }}
                                animate={{ 
                                    opacity: 1 - index * 0.15, 
                                    y: -index * 12, // Stack upwards
                                    z: -index * 20, // Depth
                                    scale: 1 - index * 0.05,
                                    rotate: (index % 2 === 0 ? 2 : -2) * index, // Slight random rotation
                                }}
                                exit={{ opacity: 0, y: 50, scale: 0.5 }}
                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                className="absolute bottom-4 w-[40%] bg-white/60 backdrop-blur-sm border border-white/60 rounded-xl p-2 shadow-lg group cursor-pointer hover:-translate-y-4 transition-transform duration-300 origin-bottom"
                                style={{ 
                                    zIndex: 10 - index,
                                    transformStyle: 'preserve-3d'
                                }}
                                onClick={() => window.open(photo, '_blank')}
                            >
                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-neutral-200/50 rounded-full" />
                                <div className="relative overflow-hidden rounded-lg aspect-[4/3] bg-white border border-neutral-100">
                                    <img src={photo} alt="Last capture" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <ExternalLink size={12} className="text-white drop-shadow-md" />
                                    </div>
                                </div>
                                {index === 0 && (
                                    <div className="mt-1.5 flex items-center justify-between px-0.5">
                                        <span className="text-[8px] font-mono text-neutral-400">IMG_{new Date().getHours()}{new Date().getMinutes()}</span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                    </div>
                                )}
                            </motion.div>
                        ))
                    ) : (
                        <motion.div 
                            key="text-label"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
                        >
                            <span className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase">
                                Quick Capture
                            </span>
                            <span className="text-[9px] text-neutral-400">
                                点击模拟拍照（采用预设的图片）
                            </span>
                        </motion.div>
                    )}
                 </AnimatePresence>
             </div>
        </div>
    </div>
  );
}
