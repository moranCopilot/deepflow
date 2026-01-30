/**
 * [INPUT]: 接收 count（总数）、currentIndex（当前索引）、onIndexChange（切换回调）、theme（主题）
 * [OUTPUT]: 渲染小圆点指示器 UI
 * [POS]: Go Flow 全屏视图的 Item 切换组件
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

import { clsx } from 'clsx';

interface ItemIndicatorProps {
  count: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  theme?: 'dark' | 'light';
}

export function ItemIndicator({
  count,
  currentIndex,
  onIndexChange,
  theme = 'dark'
}: ItemIndicatorProps) {
  // 只有一个 item 时不显示
  if (count <= 1) return null;

  const activeColor = theme === 'dark' ? 'bg-white' : 'bg-indigo-600';
  const inactiveColor = theme === 'dark' ? 'bg-white/30' : 'bg-neutral-200';

  return (
    <div className="flex gap-2 items-center justify-center mt-3">
      {Array.from({ length: count }).map((_, index) => (
        <button
          key={index}
          onClick={() => onIndexChange(index)}
          className={clsx(
            "rounded-full transition-all duration-200",
            index === currentIndex
              ? clsx(activeColor, "w-6 h-2")
              : clsx(inactiveColor, "w-2 h-2 hover:opacity-70")
          )}
          aria-label={`切换到第 ${index + 1} 个内容`}
        />
      ))}
    </div>
  );
}
