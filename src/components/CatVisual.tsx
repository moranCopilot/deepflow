import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CatVisualProps {
  stage: number; // 0-5
  progress: number; // 0-1
  primaryColor: string; // 猫咪主色
  mousePos: { x: number; y: number }; // 鼠标位置，用于眼睛跟随
}

export type CatMood = 'happy' | 'surprised' | 'sleepy' | 'playful';

/**
 * 激励体系视觉组件 - 猫咪版本
 * 实现幼猫到猫群的成长过程，包含复杂的SVG动画和视觉效果
 */
export const CatVisual: React.FC<CatVisualProps> = ({ stage, progress, primaryColor, mousePos }) => {
  // 根据阶段计算心情
  const mood: CatMood = useMemo(() => {
    if (stage === 0) return 'sleepy';
    if (stage === 1) return 'playful';
    if (stage === 2) return 'happy';
    if (stage === 3) return 'happy';
    if (stage === 4) return 'surprised';
    return 'happy';
  }, [stage]);

  // 根据阶段判断是否呼噜（高级阶段更容易呼噜）
  const canPurr = stage >= 2;

  // 仅在特定状态下触发呼噜：hover/tap 或接近阶段完成时短暂触发
  const [isHovering, setIsHovering] = useState(false);
  const [isTapPurring, setIsTapPurring] = useState(false);
  const tapPurrTimeoutRef = useRef<number | null>(null);
  const prevProgressRef = useRef(progress);

  useEffect(() => {
    return () => {
      if (tapPurrTimeoutRef.current) {
        window.clearTimeout(tapPurrTimeoutRef.current);
        tapPurrTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!canPurr) return;
    const prev = prevProgressRef.current;
    prevProgressRef.current = progress;
    if (prev < 0.9 && progress >= 0.9) {
      setIsTapPurring(true);
      if (tapPurrTimeoutRef.current) {
        window.clearTimeout(tapPurrTimeoutRef.current);
      }
      tapPurrTimeoutRef.current = window.setTimeout(() => {
        setIsTapPurring(false);
        tapPurrTimeoutRef.current = null;
      }, 1200);
    }
  }, [canPurr, progress]);

  // 计算眼睛跟随鼠标的偏移
  const eyeOffset = useMemo(() => {
    if (typeof window === 'undefined') {
      return { x: 0, y: 0 };
    }
    const dx = (mousePos.x - window.innerWidth / 2) / 100;
    const dy = (mousePos.y - window.innerHeight / 2) / 100;
    return {
      x: Math.max(-4, Math.min(4, dx)),
      y: Math.max(-2, Math.min(2, dy))
    };
  }, [mousePos]);

  const secondaryColor = "#ffffff";
  const eyeColor = mood === 'surprised' ? "#FFD700" : "#2D3436";

  // CSS Keyframes for cat animations
  const styles = `
    @keyframes purr {
      0%, 100% { transform: translateX(0px); }
      25% { transform: translateX(-1px); }
      75% { transform: translateX(1px); }
    }
    @keyframes tail-sway {
      0%, 100% { transform: rotate(-15deg); }
      50% { transform: rotate(15deg); }
    }
    @keyframes ear-left {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-5deg); }
    }
    @keyframes ear-right {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(5deg); }
    }
    @keyframes blink {
      0%, 90%, 100% { transform: scaleY(1); }
      95% { transform: scaleY(0.1); }
    }
    @keyframes breathing {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-3px); }
    }
    
    .animate-purr { animation: purr 0.3s ease-in-out infinite; }
    .animate-tail { transform-origin: 40 150; animation: tail-sway 2s ease-in-out infinite; }
    .animate-ear-left { transform-origin: 60 50; animation: ear-left 3s ease-in-out infinite; }
    .animate-ear-right { transform-origin: 140 50; animation: ear-right 3s ease-in-out infinite; }
    .animate-blink { transform-origin: center; animation: blink 3s ease-in-out infinite; }
    .animate-breathing { transform-origin: center; animation: breathing 3s ease-in-out infinite; }
    .cat-shadow { filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1)); }
  `;

  const stageConfig = useMemo(() => {
    switch (stage) {
      case 0: return { scale: 0.8, viewBox: "0 0 200 200", name: "kitten" };
      case 1: return { scale: 1.0, viewBox: "0 0 200 200", name: "young-cat" };
      case 2: return { scale: 1.0, viewBox: "0 0 200 200", name: "adult-cat" };
      case 3: return { scale: 1.0, viewBox: "0 0 250 250", name: "big-cat" };
      case 4: return { scale: 1.0, viewBox: "0 0 300 300", name: "cat-king" };
      case 5: return { scale: 1.0, viewBox: "0 0 500 300", name: "cat-group" };
      default: return { scale: 1.0, viewBox: "0 0 200 200", name: "cat" };
    }
  }, [stage]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <style>{styles}</style>
      
      <AnimatePresence mode="wait">
        <motion.div
          key={stageConfig.name}
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
          transition={{ 
            duration: 0.8,
            ease: "backOut"
          }}
          onPointerEnter={() => setIsHovering(true)}
          onPointerLeave={() => setIsHovering(false)}
          onPointerDown={() => {
            if (!canPurr) return;
            setIsTapPurring(true);
            if (tapPurrTimeoutRef.current) {
              window.clearTimeout(tapPurrTimeoutRef.current);
            }
            tapPurrTimeoutRef.current = window.setTimeout(() => {
              setIsTapPurring(false);
              tapPurrTimeoutRef.current = null;
            }, 1200);
          }}
          className={`w-full h-full flex items-center justify-center ${
            canPurr && (isHovering || isTapPurring) ? 'animate-purr' : ''
          }`}
        >
          {renderStageSVG(stage, progress, primaryColor, secondaryColor, eyeColor, eyeOffset)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const renderStageSVG = (
  stage: number,
  progress: number,
  primaryColor: string,
  secondaryColor: string,
  eyeColor: string,
  eyeOffset: { x: number; y: number }
) => {
  const defs = (
    <defs>
      {/* 猫咪毛色渐变 */}
      <linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={primaryColor} />
        <stop offset="100%" stopColor={primaryColor} stopOpacity="0.8" />
      </linearGradient>
      
      {/* 阴影滤镜 */}
      <filter id="catDropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="1" dy="1" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.3"/>
        </feComponentTransfer>
        <feMerge> 
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/> 
        </feMerge>
      </filter>
    </defs>
  );

  // Stage 0: 幼猫期 (Kitten)
  if (stage === 0) {
    const scale = 0.6 + progress * 0.2;
    // 猫咪坐标范围：从 cy=-35 (耳朵顶部) 到 cy=35 (爪子底部)，中心约在 cy=0
    // viewBox 200x200 的中心是 (100, 100)
    // SVG transform 从右到左执行：先 scale 再 translate
    // 为了让猫咪居中，需要补偿缩放：translate(100/scale, 100/scale) scale(scale)
    return (
      <svg width="100%" height="100%" viewBox="0 0 200 200" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`translate(${100/scale}, ${100/scale}) scale(${scale})`}>
          <g className="animate-breathing">
            {/* 身体 */}
            <ellipse cx="0" cy="20" rx="25" ry="20" fill={primaryColor} filter="url(#catDropShadow)" />
            
            {/* 头部 */}
            <circle cx="0" cy="-10" r="20" fill={primaryColor} />
            
            {/* 耳朵 */}
            <path d="M-15,-20 L-8,-35 L-2,-20 Z" fill={primaryColor} className="animate-ear-left" />
            <path d="M15,-20 L8,-35 L2,-20 Z" fill={primaryColor} className="animate-ear-right" />
            <path d="M-13,-22 L-9,-32 L-4,-22 Z" fill="#FFC0CB" opacity="0.6" />
            <path d="M13,-22 L9,-32 L4,-22 Z" fill="#FFC0CB" opacity="0.6" />
            
            {/* 眼睛 */}
            <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
              <circle cx="-8" cy="-8" r="4" fill="white" />
              <circle cx="-8" cy="-8" r="2" fill={eyeColor} />
              <circle cx="8" cy="-8" r="4" fill="white" />
              <circle cx="8" cy="-8" r="2" fill={eyeColor} />
            </g>
            
            {/* 鼻子 */}
            <path d="M-2,-2 L2,-2 L0,2 Z" fill="#FFC0CB" />
            
            {/* 嘴巴 */}
            <path d="M-2,2 Q0,4 2,2" fill="none" stroke="#2D3436" strokeWidth="1" strokeLinecap="round" />
            
            {/* 爪子 */}
            <circle cx="-15" cy="35" r="4" fill={primaryColor} />
            <circle cx="15" cy="35" r="4" fill={primaryColor} />
          </g>
        </g>
      </svg>
    );
  }

  // Stage 1: 小猫期 (Young Cat)
  if (stage === 1) {
    const scale = 0.7 + progress * 0.15;
    return (
      <svg width="100%" height="100%" viewBox="0 0 200 200" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`translate(${100/scale}, ${100/scale}) scale(${scale})`}>
          <g className="animate-breathing">
          {/* 尾巴 */}
          <path
            d="M-30,20 Q-40,10 -35,0 T-30,-15"
            fill="none"
            stroke={primaryColor}
            strokeWidth="8"
            strokeLinecap="round"
            className="animate-tail"
          />
          
          {/* 身体 */}
          <ellipse cx="0" cy="15" rx="30" ry="25" fill={primaryColor} filter="url(#catDropShadow)" />
          
          {/* 头部 */}
          <circle cx="0" cy="-5" r="25" fill={primaryColor} />
          
          {/* 耳朵 */}
          <path d="M-18,-15 L-10,-32 L-3,-15 Z" fill={primaryColor} className="animate-ear-left" />
          <path d="M18,-15 L10,-32 L3,-15 Z" fill={primaryColor} className="animate-ear-right" />
          <path d="M-16,-17 L-11,-28 L-5,-17 Z" fill="#FFC0CB" opacity="0.6" />
          <path d="M16,-17 L11,-28 L5,-17 Z" fill="#FFC0CB" opacity="0.6" />
          
          {/* 眼睛 */}
          <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
            <circle cx="-10" cy="-5" r="5" fill="white" />
            <circle cx="-10" cy="-5" r="2.5" fill={eyeColor} />
            <circle cx="10" cy="-5" r="5" fill="white" />
            <circle cx="10" cy="-5" r="2.5" fill={eyeColor} />
          </g>
          
          {/* 鼻子 */}
          <path d="M-2,2 L2,2 L0,5 Z" fill="#FFC0CB" />
          
          {/* 嘴巴 */}
          <path d="M-2,5 Q0,8 2,5" fill="none" stroke="#2D3436" strokeWidth="1.5" strokeLinecap="round" />
          
          {/* 爪子 */}
          <circle cx="-20" cy="38" r="5" fill={primaryColor} />
          <circle cx="20" cy="38" r="5" fill={primaryColor} />
          <circle cx="-10" cy="40" r="5" fill={primaryColor} />
          <circle cx="10" cy="40" r="5" fill={primaryColor} />
          </g>
        </g>
      </svg>
    );
  }

  // Stage 2: 成猫期 (Adult Cat)
  if (stage === 2) {
    const scale = 0.85 + progress * 0.1;
    return (
      <svg width="100%" height="100%" viewBox="0 0 200 200" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`translate(${100/scale}, ${100/scale}) scale(${scale})`}>
          <g className="animate-breathing">
          {/* 尾巴 */}
          <path
            d="M-35,25 Q-45,15 -40,0 T-35,-20"
            fill="none"
            stroke={primaryColor}
            strokeWidth="10"
            strokeLinecap="round"
            className="animate-tail"
          />
          
          {/* 身体 */}
          <ellipse cx="0" cy="20" rx="35" ry="30" fill={primaryColor} filter="url(#catDropShadow)" />
          <ellipse cx="0" cy="25" rx="25" ry="20" fill={secondaryColor} opacity="0.2" />
          
          {/* 头部 */}
          <circle cx="0" cy="0" r="30" fill={primaryColor} />
          
          {/* 耳朵 */}
          <path d="M-22,-10 L-12,-35 L-4,-10 Z" fill={primaryColor} className="animate-ear-left" />
          <path d="M22,-10 L12,-35 L4,-10 Z" fill={primaryColor} className="animate-ear-right" />
          <path d="M-20,-12 L-13,-28 L-6,-12 Z" fill="#FFC0CB" opacity="0.6" />
          <path d="M20,-12 L13,-28 L6,-12 Z" fill="#FFC0CB" opacity="0.6" />
          
          {/* 眼睛 */}
          <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
            <circle cx="-12" cy="-2" r="6" fill="white" />
            <circle cx="-12" cy="-2" r="3" fill={eyeColor} />
            <circle cx="12" cy="-2" r="6" fill="white" />
            <circle cx="12" cy="-2" r="3" fill={eyeColor} />
          </g>
          
          {/* 鼻子 */}
          <path d="M-3,5 L3,5 L0,8 Z" fill="#FFC0CB" />
          
          {/* 嘴巴 */}
          <path d="M-3,8 Q0,12 3,8" fill="none" stroke="#2D3436" strokeWidth="2" strokeLinecap="round" />
          
          {/* 胡须 */}
          <g stroke="#2D3436" strokeWidth="1" opacity="0.3">
            <line x1="-25" y1="3" x2="-40" y2="0" />
            <line x1="-25" y1="8" x2="-40" y2="8" />
            <line x1="-25" y1="13" x2="-40" y2="16" />
            <line x1="25" y1="3" x2="40" y2="0" />
            <line x1="25" y1="8" x2="40" y2="8" />
            <line x1="25" y1="13" x2="40" y2="16" />
          </g>
          
          {/* 爪子 */}
          <circle cx="-25" cy="48" r="6" fill={primaryColor} />
          <circle cx="25" cy="48" r="6" fill={primaryColor} />
          <circle cx="-12" cy="50" r="6" fill={primaryColor} />
          <circle cx="12" cy="50" r="6" fill={primaryColor} />
          </g>
        </g>
      </svg>
    );
  }

  // Stage 3: 大猫期 (Big Cat)
  if (stage === 3) {
    const scale = 1.0 + progress * 0.1;
    return (
      <svg width="100%" height="100%" viewBox="0 0 250 250" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`translate(${125/scale}, ${125/scale}) scale(${scale})`}>
          <g className="animate-breathing">
          {/* 尾巴 */}
          <path
            d="M-40,30 Q-50,20 -45,0 T-40,-25"
            fill="none"
            stroke={primaryColor}
            strokeWidth="12"
            strokeLinecap="round"
            className="animate-tail"
          />
          
          {/* 身体 */}
          <ellipse cx="0" cy="25" rx="45" ry="35" fill={primaryColor} filter="url(#catDropShadow)" />
          <ellipse cx="0" cy="30" rx="30" ry="25" fill={secondaryColor} opacity="0.2" />
          
          {/* 头部 */}
          <circle cx="0" cy="-5" r="35" fill={primaryColor} />
          
          {/* 耳朵 */}
          <path d="M-25,-15 L-15,-40 L-5,-15 Z" fill={primaryColor} className="animate-ear-left" />
          <path d="M25,-15 L15,-40 L5,-15 Z" fill={primaryColor} className="animate-ear-right" />
          <path d="M-23,-17 L-16,-33 L-7,-17 Z" fill="#FFC0CB" opacity="0.6" />
          <path d="M23,-17 L16,-33 L7,-17 Z" fill="#FFC0CB" opacity="0.6" />
          
          {/* 眼睛 */}
          <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
            <circle cx="-14" cy="-2" r="7" fill="white" />
            <circle cx="-14" cy="-2" r="3.5" fill={eyeColor} />
            <circle cx="14" cy="-2" r="7" fill="white" />
            <circle cx="14" cy="-2" r="3.5" fill={eyeColor} />
          </g>
          
          {/* 鼻子 */}
          <path d="M-3,8 L3,8 L0,12 Z" fill="#FFC0CB" />
          
          {/* 嘴巴 */}
          <path d="M-3,12 Q0,16 3,12" fill="none" stroke="#2D3436" strokeWidth="2" strokeLinecap="round" />
          
          {/* 胡须 */}
          <g stroke="#2D3436" strokeWidth="1.5" opacity="0.3">
            <line x1="-30" y1="5" x2="-48" y2="2" />
            <line x1="-30" y1="10" x2="-48" y2="10" />
            <line x1="-30" y1="15" x2="-48" y2="18" />
            <line x1="30" y1="5" x2="48" y2="2" />
            <line x1="30" y1="10" x2="48" y2="10" />
            <line x1="30" y1="15" x2="48" y2="18" />
          </g>
          
          {/* 爪子 */}
          <circle cx="-30" cy="58" r="8" fill={primaryColor} />
          <circle cx="30" cy="58" r="8" fill={primaryColor} />
          <circle cx="-15" cy="60" r="8" fill={primaryColor} />
          <circle cx="15" cy="60" r="8" fill={primaryColor} />
          </g>
        </g>
      </svg>
    );
  }

  // Stage 4: 猫王期 (Cat King)
  if (stage === 4) {
    const scale = 1.1 + progress * 0.1;
    return (
      <svg width="100%" height="100%" viewBox="0 0 300 300" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`translate(${150/scale}, ${150/scale}) scale(${scale})`}>
          <g className="animate-breathing">
          {/* 王冠 */}
          <g transform="translate(0, -50)">
            <path d="M-20,-30 L-10,-45 L0,-30 L10,-45 L20,-30 L15,-20 L-15,-20 Z" fill="#FFD700" opacity="0.9">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
            </path>
            <circle cx="-10" cy="-35" r="2" fill="#FF6B6B" />
            <circle cx="0" cy="-40" r="2" fill="#FF6B6B" />
            <circle cx="10" cy="-35" r="2" fill="#FF6B6B" />
          </g>
          
          {/* 尾巴 */}
          <path
            d="M-45,35 Q-55,25 -50,0 T-45,-30"
            fill="none"
            stroke={primaryColor}
            strokeWidth="14"
            strokeLinecap="round"
            className="animate-tail"
          />
          
          {/* 身体 */}
          <ellipse cx="0" cy="30" rx="50" ry="40" fill={primaryColor} filter="url(#catDropShadow)" />
          <ellipse cx="0" cy="35" rx="35" ry="30" fill={secondaryColor} opacity="0.2" />
          
          {/* 头部 */}
          <circle cx="0" cy="-10" r="40" fill={primaryColor} />
          
          {/* 耳朵 */}
          <path d="M-28,-20 L-18,-48 L-6,-20 Z" fill={primaryColor} className="animate-ear-left" />
          <path d="M28,-20 L18,-48 L6,-20 Z" fill={primaryColor} className="animate-ear-right" />
          <path d="M-26,-22 L-19,-40 L-8,-22 Z" fill="#FFC0CB" opacity="0.6" />
          <path d="M26,-22 L19,-40 L8,-22 Z" fill="#FFC0CB" opacity="0.6" />
          
          {/* 眼睛 */}
          <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
            <circle cx="-16" cy="-5" r="8" fill="white" />
            <circle cx="-16" cy="-5" r="4" fill={eyeColor} />
            <circle cx="16" cy="-5" r="8" fill="white" />
            <circle cx="16" cy="-5" r="4" fill={eyeColor} />
          </g>
          
          {/* 鼻子 */}
          <path d="M-4,10 L4,10 L0,15 Z" fill="#FFC0CB" />
          
          {/* 嘴巴 */}
          <path d="M-4,15 Q0,20 4,15" fill="none" stroke="#2D3436" strokeWidth="2.5" strokeLinecap="round" />
          
          {/* 胡须 */}
          <g stroke="#2D3436" strokeWidth="2" opacity="0.3">
            <line x1="-35" y1="8" x2="-55" y2="5" />
            <line x1="-35" y1="13" x2="-55" y2="13" />
            <line x1="-35" y1="18" x2="-55" y2="21" />
            <line x1="35" y1="8" x2="55" y2="5" />
            <line x1="35" y1="13" x2="55" y2="13" />
            <line x1="35" y1="18" x2="55" y2="21" />
          </g>
          
          {/* 爪子 */}
          <circle cx="-35" cy="68" r="10" fill={primaryColor} />
          <circle cx="35" cy="68" r="10" fill={primaryColor} />
          <circle cx="-18" cy="70" r="10" fill={primaryColor} />
          <circle cx="18" cy="70" r="10" fill={primaryColor} />
          </g>
        </g>
      </svg>
    );
  }

  // Stage 5: 猫群期 (Cat Group)
  if (stage === 5) {
    const groupScale = 1.0 + progress * 0.05;
    return (
      <svg width="100%" height="100%" viewBox="0 0 500 300" className="mx-auto overflow-visible" preserveAspectRatio="xMidYMid meet">
        {defs}
        <g transform={`scale(${groupScale})`} style={{ transformOrigin: 'bottom center' }}>
          {/* 远景猫咪 (模糊) */}
          <g transform="translate(80, 200) scale(0.5)" opacity="0.6" filter="blur(1px)">
            <ellipse cx="0" cy="15" rx="25" ry="20" fill={primaryColor} />
            <circle cx="0" cy="-5" r="20" fill={primaryColor} />
            <path d="M-15,-15 L-8,-30 L-2,-15 Z" fill={primaryColor} />
            <path d="M15,-15 L8,-30 L2,-15 Z" fill={primaryColor} />
          </g>
          
          <g transform="translate(420, 190) scale(0.6)" opacity="0.6" filter="blur(1px)">
            <ellipse cx="0" cy="15" rx="25" ry="20" fill={primaryColor} />
            <circle cx="0" cy="-5" r="20" fill={primaryColor} />
            <path d="M-15,-15 L-8,-30 L-2,-15 Z" fill={primaryColor} />
            <path d="M15,-15 L8,-30 L2,-15 Z" fill={primaryColor} />
          </g>
          
          {/* 中景猫咪 */}
          <g transform="translate(150, 220) scale(0.7)">
            <g className="animate-breathing">
              <path d="M-25,20 Q-30,10 -25,0" fill="none" stroke={primaryColor} strokeWidth="8" strokeLinecap="round" className="animate-tail" />
              <ellipse cx="0" cy="20" rx="30" ry="25" fill={primaryColor} />
              <circle cx="0" cy="0" r="25" fill={primaryColor} />
              <path d="M-18,-10 L-10,-28 L-3,-10 Z" fill={primaryColor} />
              <path d="M18,-10 L10,-28 L3,-10 Z" fill={primaryColor} />
              <circle cx="-10" cy="-2" r="5" fill="white" />
              <circle cx="-10" cy="-2" r="2.5" fill={eyeColor} />
              <circle cx="10" cy="-2" r="5" fill="white" />
              <circle cx="10" cy="-2" r="2.5" fill={eyeColor} />
            </g>
          </g>
          
          <g transform="translate(350, 210) scale(0.75)">
            <g className="animate-breathing" style={{ animationDelay: '0.5s' }}>
              <path d="M-25,20 Q-30,10 -25,0" fill="none" stroke={primaryColor} strokeWidth="8" strokeLinecap="round" className="animate-tail" />
              <ellipse cx="0" cy="20" rx="30" ry="25" fill={primaryColor} />
              <circle cx="0" cy="0" r="25" fill={primaryColor} />
              <path d="M-18,-10 L-10,-28 L-3,-10 Z" fill={primaryColor} />
              <path d="M18,-10 L10,-28 L3,-10 Z" fill={primaryColor} />
              <circle cx="-10" cy="-2" r="5" fill="white" />
              <circle cx="-10" cy="-2" r="2.5" fill={eyeColor} />
              <circle cx="10" cy="-2" r="5" fill="white" />
              <circle cx="10" cy="-2" r="2.5" fill={eyeColor} />
            </g>
          </g>
          
          {/* 主猫 (前景) */}
          <g transform="translate(250, 150) scale(1.0)">
            <g className="animate-breathing">
              <filter id="mainCatGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FFD700" floodOpacity="0.3" />
              </filter>
              <path
                d="M-40,30 Q-50,20 -45,0 T-40,-25"
                fill="none"
                stroke={primaryColor}
                strokeWidth="12"
                strokeLinecap="round"
                className="animate-tail"
              />
              <ellipse cx="0" cy="25" rx="45" ry="35" fill={primaryColor} filter="url(#mainCatGlow)" />
              <circle cx="0" cy="-5" r="35" fill={primaryColor} />
              <path d="M-25,-15 L-15,-40 L-5,-15 Z" fill={primaryColor} className="animate-ear-left" />
              <path d="M25,-15 L15,-40 L5,-15 Z" fill={primaryColor} className="animate-ear-right" />
              <g transform={`translate(${eyeOffset.x}, ${eyeOffset.y})`} className="animate-blink">
              <circle cx="-14" cy="-2" r="7" fill="white" />
              <circle cx="-14" cy="-2" r="3.5" fill={eyeColor} />
              <circle cx="14" cy="-2" r="7" fill="white" />
              <circle cx="14" cy="-2" r="3.5" fill={eyeColor} />
            </g>
            <path d="M-3,8 L3,8 L0,12 Z" fill="#FFC0CB" />
            <path d="M-3,12 Q0,16 3,12" fill="none" stroke="#2D3436" strokeWidth="2" strokeLinecap="round" />
              <circle cx="-30" cy="58" r="8" fill={primaryColor} />
              <circle cx="30" cy="58" r="8" fill={primaryColor} />
              <circle cx="-15" cy="60" r="8" fill={primaryColor} />
              <circle cx="15" cy="60" r="8" fill={primaryColor} />
            </g>
          </g>
        </g>
      </svg>
    );
  }

  return null;
};
