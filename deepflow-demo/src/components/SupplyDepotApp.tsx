import { useState } from 'react';
import { Camera, FileText, Mic, Package, Play, Check, Loader2, Sparkles, Brain, Moon, Coffee, Home, Library, Tag, Settings } from 'lucide-react';
import clsx from 'clsx';

export interface KnowledgeCard {
    id: string;
    title: string;
    content: string;
    tags: string[];
    timestamp: Date;
}

interface SupplyDepotAppProps {
  onStartFlow: () => void;
  onStopFlow: () => void;
  isFlowing: boolean;
  knowledgeCards: KnowledgeCard[];
  currentContext: 'deep_work' | 'casual';
  onContextChange: (context: 'deep_work' | 'casual') => void;
}

export function SupplyDepotApp({ onStartFlow, onStopFlow, isFlowing, knowledgeCards, currentContext, onContextChange }: SupplyDepotAppProps) {
  const [items, setItems] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [readyToFlow, setReadyToFlow] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'garden' | 'scenes'>('home');

  const addItem = (type: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      setItems(prev => [...prev, type]);
      setIsProcessing(false);
      setReadyToFlow(true);
    }, 1500);
  };

  if (isFlowing) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-white p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-black to-black opacity-80" />
        <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center mb-8 animate-pulse">
                <Brain className="w-12 h-12 text-indigo-400" />
            </div>
            <h2 className="text-3xl font-light tracking-tight mb-2">DeepFlow</h2>
            <p className="text-white/50 text-sm mb-12">心流会话进行中...</p>
            
            <div className="flex gap-4 mb-12">
               <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-lg font-mono">24</span>
                  </div>
                  <span className="text-xs text-white/30">MIN</span>
               </div>
            </div>

            {/* Context Switcher in Flow Mode */}
            <div className="flex gap-3 mb-12 bg-white/5 p-1 rounded-full border border-white/10">
                <button 
                    onClick={() => onContextChange('deep_work')}
                    className={clsx(
                        "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium transition-all duration-300",
                        currentContext === 'deep_work' 
                            ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105" 
                            : "text-white/40 hover:text-white/70 hover:bg-white/5"
                    )}
                >
                    <Brain size={14} /> 深度
                </button>
                <button 
                    onClick={() => onContextChange('casual')}
                    className={clsx(
                        "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium transition-all duration-300",
                        currentContext === 'casual' 
                            ? "bg-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-105" 
                            : "text-white/40 hover:text-white/70 hover:bg-white/5"
                    )}
                >
                    <Coffee size={14} /> 休闲
                </button>
            </div>

            <button 
                onClick={onStopFlow}
                className="px-8 py-3 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm font-medium hover:bg-white/20 transition-colors"
            >
                结束会话
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      
      {activeTab === 'home' ? (
          <>
            {/* Header */}
            <div className="px-6 pt-4 pb-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">补给站 (Depot)</h1>
                <p className="text-slate-500 text-sm font-medium">准备你的专注素材</p>
            </div>

            {/* Main Card */}
            <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto no-scrollbar">
                
                {/* Input Methods */}
                <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">知识打包 (Pack My Bag)</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => addItem('图片')} disabled={isProcessing} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                <Camera size={20} />
                            </div>
                            <span className="text-[10px] font-medium text-slate-600">拍照</span>
                        </button>
                        <button onClick={() => addItem('文档')} disabled={isProcessing} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                                <FileText size={20} />
                            </div>
                            <span className="text-[10px] font-medium text-slate-600">导入</span>
                        </button>
                        <button onClick={() => addItem('录音')} disabled={isProcessing} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                <Mic size={20} />
                            </div>
                            <span className="text-[10px] font-medium text-slate-600">录音</span>
                        </button>
                    </div>
                </div>

                {/* Bag Contents / Status */}
                <div className="bg-white rounded-3xl p-5 shadow-sm min-h-[160px]">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">背包内容</h3>
                        {isProcessing && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                    </div>
                    
                    {items.length === 0 ? (
                        <div className="h-24 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                            <Package size={24} className="mb-2 opacity-50" />
                            <span className="text-xs">空空如也</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                            <Sparkles size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-700">{item} 碎片</span>
                                            <span className="text-[10px] text-slate-400">AI 已处理</span>
                                        </div>
                                    </div>
                                    <Check className="w-4 h-4 text-green-500" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

             {/* Bottom Action - Only on Home */}
            <div className="px-6 pb-2 pt-2 bg-gradient-to-t from-[#F2F2F7] to-transparent">
                <button 
                    onClick={onStartFlow}
                    disabled={!readyToFlow}
                    className={clsx(
                        "w-full h-14 rounded-full flex items-center justify-center gap-2 font-bold text-lg shadow-lg transition-all duration-300 transform active:scale-95",
                        readyToFlow ? "bg-black text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                >
                    <Play fill="currentColor" size={18} />
                    Go Flow
                </button>
            </div>
          </>
      ) : activeTab === 'garden' ? (
          /* Garden Tab */
          <>
             <div className="px-6 pt-4 pb-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">知识花园</h1>
                <p className="text-slate-500 text-sm font-medium">收集的知识碎片与小票</p>
            </div>
            
            <div className="flex-1 px-4 py-4 overflow-y-auto no-scrollbar space-y-4">
                {knowledgeCards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                        <Library size={48} className="opacity-20" />
                        <p className="text-sm">暂无知识小票</p>
                        <p className="text-xs max-w-[200px] text-center opacity-60">在 Flow 模式中，打印机会自动为你生成知识小票并归档于此。</p>
                    </div>
                ) : (
                    knowledgeCards.map(card => (
                        <div key={card.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-slate-800">{card.title}</h3>
                                <span className="text-[10px] text-slate-400 font-mono">{card.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
                                {card.content}
                            </p>
                            <div className="flex gap-2 flex-wrap">
                                {card.tags.map(tag => (
                                    <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-medium">
                                        <Tag size={10} /> {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
          </>
      ) : (
          /* Scenes Tab */
          <>
            <div className="px-6 pt-4 pb-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">场景配置</h1>
                <p className="text-slate-500 text-sm font-medium">设定你的心流环境</p>
            </div>
            
            <div className="flex-1 px-4 py-4 overflow-y-auto no-scrollbar space-y-4">
                 <button 
                    onClick={() => onContextChange('deep_work')}
                    className={clsx(
                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300",
                        currentContext === 'deep_work' 
                            ? "bg-black text-white border-black shadow-lg scale-[1.02]" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                >
                    <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center", currentContext === 'deep_work' ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                        <Brain size={24} />
                    </div>
                    <div className="flex-1 text-left">
                        <h3 className="font-bold text-sm">深度学习 (Deep Work)</h3>
                        <p className={clsx("text-xs mt-1", currentContext === 'deep_work' ? "text-white/60" : "text-slate-400")}>高强度专注，屏蔽干扰</p>
                    </div>
                    {currentContext === 'deep_work' && <Check size={20} className="text-green-400" />}
                </button>

                <button 
                    onClick={() => onContextChange('casual')}
                    className={clsx(
                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300",
                        currentContext === 'casual' 
                            ? "bg-green-600 text-white border-green-600 shadow-lg scale-[1.02]" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                >
                    <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center", currentContext === 'casual' ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                        <Coffee size={24} />
                    </div>
                    <div className="flex-1 text-left">
                        <h3 className="font-bold text-sm">休闲听书 (Casual)</h3>
                        <p className={clsx("text-xs mt-1", currentContext === 'casual' ? "text-white/80" : "text-slate-400")}>轻松氛围，享受阅读</p>
                    </div>
                    {currentContext === 'casual' && <Check size={20} className="text-white" />}
                </button>

                <button disabled className="w-full flex items-center gap-4 p-4 rounded-2xl border bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center">
                        <Moon size={24} />
                    </div>
                    <div className="flex-1 text-left">
                        <h3 className="font-bold text-sm text-slate-400">助眠模式 (Sleep)</h3>
                        <p className="text-xs mt-1 text-slate-400">开发中...</p>
                    </div>
                </button>
            </div>
          </>
      )}

      {/* Bottom Navigation */}
      <div className="h-16 bg-white border-t border-slate-200 grid grid-cols-3">
          <button 
            onClick={() => setActiveTab('home')}
            className={clsx(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                activeTab === 'home' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
              <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">补给站</span>
          </button>
          <button 
            onClick={() => setActiveTab('garden')}
            className={clsx(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                activeTab === 'garden' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
              <Library size={24} strokeWidth={activeTab === 'garden' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">花园</span>
          </button>
          <button 
            onClick={() => setActiveTab('scenes')}
            className={clsx(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                activeTab === 'scenes' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
              <Settings size={24} strokeWidth={activeTab === 'scenes' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">场景</span>
          </button>
      </div>

    </div>
  );
}
