/**
 * [INPUT]: 接收 items（标题列表）、currentIndex（当前索引）、onIndexChange（切换回调）、theme（主题）
 * [OUTPUT]: 渲染可滑动标题 UI，支持滑动手势和箭头切换
 * [POS]: Go Flow 全屏视图的标题切换组件
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface SwipeableTitleProps {
  items: Array<{ id: string; title: string }>;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  theme?: 'dark' | 'light';
}

export function SwipeableTitle({
  items,
  currentIndex,
  onIndexChange,
  theme = 'dark'
}: SwipeableTitleProps) {
  const [direction, setDirection] = useState(0);
  const dragConstraintsRef = useRef(null);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setDirection(-1);
      onIndexChange(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setDirection(1);
      onIndexChange(currentIndex + 1);
    }
  };

  const handleDragEnd = (_: any, info: any) => {
    const threshold = 50;
    if (info.offset.x > threshold && hasPrev) {
      handlePrev();
    } else if (info.offset.x < -threshold && hasNext) {
      handleNext();
    }
  };

  // 只有一个 item 时只显示标题
  if (items.length <= 1) {
    return (
      <div className="w-full px-4 mb-6 min-h-[2.5rem] flex items-center justify-center">
        <h3 className="text-base font-semibold text-white/90 line-clamp-2 leading-snug drop-shadow-md">
          {items[0]?.title}
        </h3>
      </div>
    );
  }

  const arrowColor = theme === 'dark' ? 'text-white/50' : 'text-neutral-400';
  const titleColor = theme === 'dark' ? 'text-white/90' : 'text-neutral-900';

  return (
    <div className="w-full px-4 mb-6 min-h-[2.5rem] flex items-center justify-center relative">
      {/* 左箭头 */}
      {hasPrev && (
        <button
          onClick={handlePrev}
          className={clsx("absolute left-2 z-10 p-1", arrowColor)}
          aria-label="上一个"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* 可滑动标题区域 */}
      <motion.div
        ref={dragConstraintsRef}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        className="w-full max-w-[80%] flex items-center justify-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.h3
            key={items[currentIndex].id}
            initial={{ opacity: 0, x: direction * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -20 }}
            transition={{ duration: 0.2 }}
            className={clsx("text-base font-semibold line-clamp-2 leading-snug drop-shadow-md text-center", titleColor)}
          >
            {items[currentIndex].title}
          </motion.h3>
        </AnimatePresence>
      </motion.div>

      {/* 右箭头 */}
      {hasNext && (
        <button
          onClick={handleNext}
          className={clsx("absolute right-2 z-10 p-1", arrowColor)}
          aria-label="下一个"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* 进度提示 */}
      <div className={clsx("absolute -bottom-5 text-xs", theme === 'dark' ? 'text-white/40' : 'text-neutral-400')}>
        {currentIndex + 1}/{items.length}
      </div>
    </div>
  );
}
