import { useEffect, useState } from 'react';
import { Clock, Award } from 'lucide-react';
import { IncentiveVisual } from './IncentiveVisual';
import { CatVisual } from './CatVisual';
import type { RewardData } from '../utils/reward-manager';

type IncentiveTheme = 'tree' | 'cat';

const THEME_STORAGE_KEY = 'deepflow_incentive_theme';
const CAT_COLOR_STORAGE_KEY = 'deepflow_cat_color';
const DEFAULT_CAT_COLOR = '#FF6B6B';

// 阶段名称映射：树苗 -> 猫咪
const STAGE_NAME_MAP: Record<string, string> = {
  '种子期': '幼猫期',
  '树苗期': '小猫期',
  '小树期': '成猫期',
  '中树期': '大猫期',
  '大树期': '猫王期',
  '森林期': '猫群期',
};

interface FlowRewardDisplayProps {
  sessionStartTime: number | null;
  stats: RewardData;
  totalHours: number;
}

/**
 * 计算成长阶段信息（从 ForestGarden 复制）
 */
interface GrowthStage {
  stage: number;
  stageName: string;
  minHours: number;
  maxHours: number;
  progress: number;
  nextStageHours: number;
}

const STAGES = [
  { stage: 0, name: '种子期', min: 0, max: 1 },
  { stage: 1, name: '树苗期', min: 1, max: 5 },
  { stage: 2, name: '小树期', min: 5, max: 15 },
  { stage: 3, name: '中树期', min: 15, max: 30 },
  { stage: 4, name: '大树期', min: 30, max: 60 },
  { stage: 5, name: '森林期', min: 60, max: Infinity },
];

function getGrowthStage(totalHours: number): GrowthStage {
  for (let i = 0; i < STAGES.length; i++) {
    const stageInfo = STAGES[i];
    if (totalHours >= stageInfo.min && totalHours < stageInfo.max) {
      const progress = stageInfo.max === Infinity 
        ? 1 
        : (totalHours - stageInfo.min) / (stageInfo.max - stageInfo.min);
      
      const nextStageHours = stageInfo.max === Infinity 
        ? Infinity 
        : stageInfo.max;
      
      return {
        stage: stageInfo.stage,
        stageName: stageInfo.name,
        minHours: stageInfo.min,
        maxHours: stageInfo.max,
        progress: Math.min(1, Math.max(0, progress)),
        nextStageHours
      };
    }
  }
  
  // 默认返回最后一个阶段
  const lastStage = STAGES[STAGES.length - 1];
  return {
    stage: lastStage.stage,
    stageName: lastStage.name,
    minHours: lastStage.min,
    maxHours: lastStage.max,
    progress: 1,
    nextStageHours: Infinity
  };
}

/**
 * 计算本次会话的预估积分
 * 规则：前30分钟每分钟1分，30-60分钟每分钟2分，60分钟以上每分钟3分
 * 在全屏模式下，积分积累速度增加 10 倍（方便 demo 演示）
 */
function calculateCurrentPoints(durationSeconds: number): number {
  const minutes = Math.floor(durationSeconds / 60);
  
  let points = 0;
  if (minutes <= 30) {
    points = minutes * 1;
  } else if (minutes <= 60) {
    points = 30 * 1 + (minutes - 30) * 2;
  } else {
    points = 30 * 1 + 30 * 2 + (minutes - 60) * 3;
  }
  
  // 全屏模式下积分速度增加 10 倍（方便 demo 演示）
  return points * 10;
}

/**
 * 格式化时长显示（秒转换为 mm:ss 或 HH:mm:ss）
 */
function formatSessionDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化总时长显示
 */
function formatTotalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function FlowRewardDisplay({ sessionStartTime, stats, totalHours }: FlowRewardDisplayProps) {
  const [currentDuration, setCurrentDuration] = useState(0);
  const [currentPoints, setCurrentPoints] = useState(0);
  
  // 读取主题和颜色偏好
  const [themeType, setThemeType] = useState<IncentiveTheme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return (stored === 'tree' || stored === 'cat') ? stored : 'cat';
    }
    return 'cat';
  });
  
  const [catColor, setCatColor] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(CAT_COLOR_STORAGE_KEY);
      return stored || DEFAULT_CAT_COLOR;
    }
    return DEFAULT_CAT_COLOR;
  });
  
  // 鼠标位置跟踪（用于猫咪眼睛跟随）
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // 计算成长阶段
  const growthStage = getGrowthStage(totalHours);
  
  // 根据主题获取阶段名称
  const displayStageName = themeType === 'cat' 
    ? STAGE_NAME_MAP[growthStage.stageName] || growthStage.stageName
    : growthStage.stageName;
  
  // 监听 localStorage 变化（当用户在激励页面切换主题时）
  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== 'undefined') {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        const storedColor = localStorage.getItem(CAT_COLOR_STORAGE_KEY);
        if (storedTheme === 'tree' || storedTheme === 'cat') {
          setThemeType(storedTheme);
        }
        if (storedColor) {
          setCatColor(storedColor);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    // 也监听自定义事件（同页面内的变化）
    const interval = setInterval(handleStorageChange, 500);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
  // 鼠标位置跟踪（仅在猫咪模式下）
  useEffect(() => {
    if (themeType !== 'cat') return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [themeType]);

  // 实时更新本次学习时长和积分
  useEffect(() => {
    if (!sessionStartTime) {
      setCurrentDuration(0);
      setCurrentPoints(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const duration = (now - sessionStartTime) / 1000;
      setCurrentDuration(duration);
      setCurrentPoints(calculateCurrentPoints(duration));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  if (!sessionStartTime) {
    return null;
  }

  return (
    <div className="w-full flex flex-col items-center gap-2 shrink-0">
      {/* 激励形象区域 */}
      <div className="w-full flex flex-col items-center gap-1 shrink-0">
        <div className="relative w-16 h-16 flex items-center justify-center overflow-hidden">
          {themeType === 'cat' ? (
            <CatVisual 
              stage={growthStage.stage} 
              progress={growthStage.progress}
              primaryColor={catColor}
              mousePos={mousePos}
            />
          ) : (
            <IncentiveVisual 
              stage={growthStage.stage} 
              progress={growthStage.progress} 
            />
          )}
        </div>
        <div className="text-[10px] font-medium text-white/80 px-2 py-0.5 bg-indigo-500/20 rounded-full border border-indigo-500/30">
          {displayStageName}
        </div>
      </div>

      {/* 数据指标区域 */}
      <div className="w-full px-2.5 py-2 bg-white/5 rounded-xl backdrop-blur-sm border border-white/10 shrink-0">
        <div className="grid grid-cols-2 gap-3">
          {/* 本次时长 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-white/70" />
              <span className="text-[10px] text-white/60">本次时长</span>
            </div>
            <div className="text-sm font-semibold text-white/90">
              {formatSessionDuration(currentDuration)}
            </div>
          </div>

          {/* 本次积分 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <Award size={12} className="text-white/70" />
              <span className="text-[10px] text-white/60">本次积分</span>
            </div>
            <div className="text-sm font-semibold text-white/90">
              {currentPoints}
            </div>
          </div>

          {/* 累计时长 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-white/50" />
              <span className="text-[10px] text-white/50">累计时长</span>
            </div>
            <div className="text-sm font-semibold text-white/80">
              {formatTotalDuration(stats.totalDuration)}
            </div>
          </div>

          {/* 总积分 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <Award size={12} className="text-white/50" />
              <span className="text-[10px] text-white/50">总积分</span>
            </div>
            <div className="text-sm font-semibold text-white/80">
              {stats.totalPoints}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

