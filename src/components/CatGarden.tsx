import { useState, useEffect } from 'react';
import { CatVisual } from './CatVisual';

interface CatGardenProps {
  totalHours: number; // 实际学习总时长（小时）
  debugMode?: boolean; // 是否启用调试模式
  onStageChange?: (stage: number) => void; // 调试模式下阶段切换回调
  primaryColor: string; // 猫咪主色
  mousePos: { x: number; y: number }; // 鼠标位置
}

interface GrowthStage {
  stage: number;
  stageName: string;
  minHours: number;
  maxHours: number;
  progress: number; // 0-1，当前阶段内的进度
  nextStageHours: number; // 到达下一阶段需要的总小时数
}

const STAGES = [
  { stage: 0, name: '幼猫期', min: 0, max: 1 },
  { stage: 1, name: '小猫期', min: 1, max: 5 },
  { stage: 2, name: '成猫期', min: 5, max: 15 },
  { stage: 3, name: '大猫期', min: 15, max: 30 },
  { stage: 4, name: '猫王期', min: 30, max: 60 },
  { stage: 5, name: '猫群期', min: 60, max: Infinity },
];

/**
 * 计算成长阶段信息
 */
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
 * 获取模拟时长（用于调试模式下计算进度）
 */
function getSimulatedHours(stage: number): number {
  const stageInfo = STAGES.find(s => s.stage === stage);
  if (!stageInfo) return 0;
  
  if (stageInfo.max === Infinity) {
    return stageInfo.min + 10; // 猫群期使用 min + 10
  }
  
  // 使用阶段的中间值
  return (stageInfo.min + stageInfo.max) / 2;
}

export function CatGarden({ totalHours, debugMode = false, onStageChange, primaryColor, mousePos }: CatGardenProps) {
  const [debugStage, setDebugStage] = useState<number>(0);
  
  // 计算当前阶段
  const effectiveHours = debugMode ? getSimulatedHours(debugStage) : totalHours;
  const growthStage = getGrowthStage(effectiveHours);
  
  // 调试模式下通知父组件
  useEffect(() => {
    if (debugMode && onStageChange) {
      onStageChange(debugStage);
    }
  }, [debugMode, debugStage, onStageChange]);
  
  // 更新调试阶段的初始值
  useEffect(() => {
    if (debugMode) {
      setDebugStage(growthStage.stage);
    }
  }, [debugMode, growthStage.stage]);
  
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {/* 猫咪视觉 */}
      <div className="relative flex items-center justify-center min-h-[260px] w-full overflow-hidden bg-gradient-to-b from-pink-50/30 to-white/0 rounded-3xl border border-slate-100/50 shadow-inner">
        <CatVisual 
          stage={growthStage.stage} 
          progress={growthStage.progress}
          primaryColor={primaryColor}
          mousePos={mousePos}
        />
      </div>
      
      {/* 阶段信息 */}
      <div className="text-center relative z-10">
        <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-2">
          {growthStage.stageName}
          {debugMode && (
             <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] border border-amber-200">
               DEBUG
             </span>
          )}
        </div>
        
        {debugMode && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <button 
                onClick={() => setDebugStage(Math.max(0, debugStage - 1))}
                className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                disabled={debugStage === 0}
            >
                Prev
            </button>
            <span className="text-xs font-mono text-slate-500 w-24 text-center">
                Stage {debugStage}
            </span>
            <button 
                onClick={() => setDebugStage(Math.min(5, debugStage + 1))}
                className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                disabled={debugStage === 5}
            >
                Next
            </button>
          </div>
        )}

        {!debugMode && growthStage.nextStageHours !== Infinity && (
          <div className="text-xs text-slate-500 mt-1">
            还需 {(growthStage.nextStageHours - totalHours).toFixed(1)} 小时到达下一阶段
          </div>
        )}
      </div>
    </div>
  );
}
