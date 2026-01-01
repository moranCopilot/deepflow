import { useEffect, useState } from 'react';
import { Clock, Award } from 'lucide-react';
import { IncentiveVisual } from './IncentiveVisual';
import type { RewardData } from '../utils/reward-manager';

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

  // 计算成长阶段
  const growthStage = getGrowthStage(totalHours);

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
      {/* 小树苗区域 */}
      <div className="w-full flex flex-col items-center gap-1 shrink-0">
        <div className="relative w-16 h-16 flex items-center justify-center overflow-hidden">
          <IncentiveVisual stage={growthStage.stage} progress={growthStage.progress} />
        </div>
        <div className="text-[10px] font-medium text-white/80 px-2 py-0.5 bg-indigo-500/20 rounded-full border border-indigo-500/30">
          {growthStage.stageName}
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

