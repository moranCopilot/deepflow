import { useState, useEffect } from 'react';
import { Clock, Target, AlertCircle, Award, History, Sparkles } from 'lucide-react';
import { ForestGarden } from './ForestGarden';
import { CatGarden } from './CatGarden';
import { type RewardData } from '../utils/reward-manager';
import clsx from 'clsx';

type IncentiveTheme = 'tree' | 'cat';

const THEME_STORAGE_KEY = 'deepflow_incentive_theme';
const CAT_COLOR_STORAGE_KEY = 'deepflow_cat_color';
const DEFAULT_CAT_COLOR = '#FF6B6B';

// 预设的猫咪颜色选项
const CAT_COLORS = [
  { name: '橙色', value: '#FF6B6B' },
  { name: '灰色', value: '#9CA3AF' },
  { name: '黑色', value: '#2D3436' },
  { name: '白色', value: '#F5F5F5' },
  { name: '棕色', value: '#8B4513' },
  { name: '黄色', value: '#FBBF24' },
];

interface RewardPageProps {
  stats: RewardData;
  totalHours: number;
  updateStats: () => void;
}

/**
 * 格式化日期时间
 */
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function RewardPage({ stats, totalHours, updateStats }: RewardPageProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  
  // 主题和颜色状态
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

  // 刷新统计数据（当组件加载时）
  useEffect(() => {
    updateStats();
  }, [updateStats]);

  // 保存主题偏好
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, themeType);
    }
  }, [themeType]);

  // 保存猫咪颜色偏好
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CAT_COLOR_STORAGE_KEY, catColor);
    }
  }, [catColor]);

  // 鼠标位置跟踪
  useEffect(() => {
    if (themeType !== 'cat') return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [themeType]);

  const completionRate = stats.totalSessions > 0
    ? ((stats.totalSessions - stats.interruptedSessions) / stats.totalSessions * 100).toFixed(0)
    : '0';

  return (
    <div className="h-full bg-[#F2F2F7] flex flex-col">
      {/* 顶部标题 */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-200 z-10">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles size={24} className="text-indigo-500" />
          激励体系
        </h2>
        <span className="text-xs text-slate-400">学习成长记录</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-28 space-y-4">
        {/* 主题切换和养成游戏区域 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          {/* Theme Switcher & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100/50">
            {/* Theme Switcher - Compact Segmented Control */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setThemeType('cat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  themeType === 'cat'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>🐱</span>
                <span>猫咪</span>
              </button>
              <button
                onClick={() => setThemeType('tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  themeType === 'tree'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>🌱</span>
                <span>树苗</span>
              </button>
            </div>

            {/* Color Picker (Compact) */}
            {themeType === 'cat' && (
              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-300">
                {CAT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setCatColor(color.value)}
                    className={`w-5 h-5 rounded-full border transition-all ${
                      catColor === color.value
                        ? 'border-indigo-500 scale-110 shadow-sm ring-1 ring-indigo-500 ring-offset-1'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                    aria-label={color.name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 养成游戏显示区域 */}
          {themeType === 'tree' ? (
            <ForestGarden totalHours={totalHours} debugMode={debugMode} />
          ) : (
            <CatGarden 
              totalHours={totalHours} 
              debugMode={debugMode}
              primaryColor={catColor}
              mousePos={mousePos}
            />
          )}
          
          {/* 调试模式开关 */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
              <input 
                type="checkbox" 
                checked={debugMode} 
                onChange={e => setDebugMode(e.target.checked)}
                className="rounded text-indigo-500 focus:ring-indigo-500" 
              />
              调试模式 (预览各阶段)
            </label>
          </div>
        </div>

        {/* 核心数据概览 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Clock size={14} />
              <span>专注时长</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {Math.floor(stats.totalDuration / 3600)}
              <span className="text-sm font-normal text-slate-500 ml-1">小时</span>
            </div>
            <div className="text-xs text-slate-400">
              {Math.floor((stats.totalDuration % 3600) / 60)} 分钟
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Target size={14} />
              <span>完成率</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {completionRate}
              <span className="text-sm font-normal text-slate-500 ml-1">%</span>
            </div>
            <div className="text-xs text-slate-400">
              {stats.totalSessions} 次专注
            </div>
          </div>
        </div>

        {/* 详细统计 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Award size={18} className="text-orange-500" />
            详细统计
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Clock size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">平均专注时长</span>
                  <span className="text-[10px] text-slate-400">每次 Session</span>
                </div>
              </div>
              <span className="font-mono font-bold text-slate-800">
                {stats.totalSessions > 0 
                  ? Math.floor(stats.totalDuration / stats.totalSessions / 60) 
                  : 0} 分钟
              </span>
            </div>

            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <AlertCircle size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">中断次数</span>
                  <span className="text-[10px] text-slate-400">注意力分散</span>
                </div>
              </div>
              <span className="font-mono font-bold text-slate-800">
                {stats.interruptedSessions} 次
              </span>
            </div>
          </div>
        </div>

        {/* 历史记录 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <History size={18} className="text-slate-500" />
              最近记录
            </h3>
            <span className="text-xs text-slate-400">
              {showHistory ? '收起' : '展开'}
            </span>
          </button>
          
          {showHistory && (
            <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-3">
              {stats.sessions.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">暂无记录</p>
              ) : (
                stats.sessions.slice(0, 10).map((session: any) => (
                  <div key={session.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-700">
                        {formatDateTime(session.startTime)}
                      </span>
                      <span className={clsx(
                        "text-[10px]",
                        session.completed ? "text-green-500" : "text-orange-500"
                      )}>
                        {session.completed ? '完成' : '中断'}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-600">
                      {Math.floor((session.endTime - session.startTime) / 1000 / 60)} 分钟
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
