import React from 'react';
import { ArrowLeft, Heart, Clock, User, Sparkles, Play } from 'lucide-react';
import clsx from 'clsx';
import { type SharedFlowList } from '../data/mock-community';
import { SCENE_CONFIGS, type SceneTag } from '../config/scene-config';
import { hasItemScript } from '../utils/script-loader';

interface FlowListDetailPageProps {
  flowList: SharedFlowList;
  onBack: () => void;
  onImport: (flowList: SharedFlowList) => void;
  onItemClick?: (item: SharedFlowList['items'][number]) => void;
}

export const FlowListDetailPage: React.FC<FlowListDetailPageProps> = ({ flowList, onBack, onImport, onItemClick }) => {
  // 计算总时长
  const totalDuration = flowList.items.reduce((acc, item) => {
    const [min, sec] = (item.duration || '00:00').split(':').map(Number);
    return acc + (min * 60) + sec;
  }, 0);
  
  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    return `${min} 分钟`;
  };

  // 获取主场景配置
  const mainSceneTag = flowList.items[0]?.sceneTag || 'default';
  const sceneConfig = SCENE_CONFIGS[mainSceneTag as SceneTag] || SCENE_CONFIGS['default'];
  
  const SCENE_COLORS: Record<string, string> = {
    commute: 'from-blue-400 to-blue-600',
    home_charge: 'from-orange-400 to-orange-600',
    focus: 'from-indigo-400 to-indigo-600',
    sleep_meditation: 'from-purple-400 to-purple-600',
    qa_memory: 'from-emerald-400 to-emerald-600',
    daily_review: 'from-rose-400 to-rose-600',
    default: 'from-slate-400 to-slate-600',
  };
  
  const colorClass = SCENE_COLORS[mainSceneTag] || SCENE_COLORS['default'];

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] animate-in slide-in-from-right duration-300 relative">
      {/* 头部导航 - 绝对定位，背景透明 */}
      <div className="absolute top-0 left-0 w-full z-20 p-4 flex items-center justify-between pointer-events-none">
        <button 
          onClick={onBack}
          className="pointer-events-auto w-9 h-9 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/30 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        {/* 标题已移除 */}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* 封面区域 */}
        <div className="relative h-48 w-full overflow-hidden">
          {flowList.coverImage ? (
            <img src={flowList.coverImage} alt={flowList.title} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
              <sceneConfig.icon size={64} className="text-white opacity-50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col justify-end p-6">
            <h1 className="text-2xl font-bold text-white mb-2 shadow-sm">{flowList.title}</h1>
            <div className="flex items-center gap-2 text-white/90 text-xs">
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                {flowList.author.avatar ? (
                  <img src={flowList.author.avatar} alt={flowList.author.name} className="w-3 h-3 rounded-full" />
                ) : (
                  <User size={12} />
                )}
                <span>{flowList.author.name}</span>
              </div>
              <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full">
                <Clock size={12} />
                <span>{formatDuration(totalDuration)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 描述与操作 */}
        <div className="p-4 bg-white mb-2">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {flowList.description}
          </p>
          
          <div className="flex gap-3">
            <button 
              onClick={() => onImport(flowList)}
              className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <Sparkles size={16} />
              Go Flow
            </button>
            <button className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <Heart size={20} />
            </button>
          </div>
        </div>

        {/* 列表内容 */}
        <div className="bg-white min-h-[300px]">
          <div>
            {flowList.items.map((item) => {
              const itemSceneConfig = SCENE_CONFIGS[item.sceneTag as SceneTag] || SCENE_CONFIGS['default'];
              const ItemIcon = itemSceneConfig.icon;
              
              const isPlayable = hasItemScript(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => isPlayable && onItemClick?.(item)}
                  className={clsx(
                    "w-full flex items-center justify-between py-2 px-4 group transition-all border-b border-slate-50 last:border-0",
                    isPlayable && "cursor-pointer hover:bg-slate-50/60 active:scale-[0.99]"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* 图标 */}
                    <div className={clsx(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-all duration-300",
                      "bg-slate-50 text-slate-400 group-hover:bg-white group-hover:shadow-md group-hover:text-indigo-500 group-hover:scale-105"
                    )}>
                      <ItemIcon size={18} strokeWidth={1.5} />
                    </div>
                    
                    {/* 内容区域 */}
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      {/* Category Pills */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {itemSceneConfig.label}
                        </span>
                        <span className="text-[9px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md">
                          {item.duration}
                        </span>
                      </div>

                      {/* 标题 */}
                      <span className="text-[13px] font-bold leading-snug line-clamp-1 text-slate-800 group-hover:text-slate-900 transition-colors">
                        {item.title}
                      </span>
                      
                      {/* 副标题 */}
                      <span className="text-[9px] text-slate-400 font-medium line-clamp-1 group-hover:text-slate-500 transition-colors">
                        {isPlayable ? '点击播放音频' : '暂无音频'}
                      </span>
                    </div>
                  </div>

                  {/* 播放按钮 */}
                  <div className="pl-3 py-2">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                      isPlayable
                        ? "bg-slate-100 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:scale-110 group-hover:shadow-md"
                        : "bg-slate-50 text-slate-200"
                    )}>
                      <Play size={12} fill="currentColor" className="ml-0.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
