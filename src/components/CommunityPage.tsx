import React, { useState, useEffect } from 'react';
import { Search, Heart, Play } from 'lucide-react';
import { getCommunityLists, type SharedFlowList } from '../data/mock-community';
import { SCENE_CONFIGS, type SceneTag } from '../config/scene-config';
import { FlowListDetailPage } from './FlowListDetailPage';

interface CommunityPageProps {
  onImportFlowList: (flowList: SharedFlowList) => void;
  initialSelectedListId?: string | null;
}

const SCENE_COLORS: Record<string, string> = {
  commute: 'from-blue-400 to-blue-600',
  home_charge: 'from-orange-400 to-orange-600',
  focus: 'from-indigo-400 to-indigo-600',
  sleep_meditation: 'from-purple-400 to-purple-600',
  qa_memory: 'from-emerald-400 to-emerald-600',
  daily_review: 'from-rose-400 to-rose-600',
  default: 'from-slate-400 to-slate-600',
};

export const CommunityPage: React.FC<CommunityPageProps> = ({ onImportFlowList, initialSelectedListId }) => {
  const [selectedList, setSelectedList] = useState<SharedFlowList | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const allLists = getCommunityLists();
  const [initializedFromParent, setInitializedFromParent] = useState(false);

  useEffect(() => {
    if (initializedFromParent) return;
    if (!initialSelectedListId) return;
    const target = allLists.find(list => list.id === initialSelectedListId) || null;
    if (target) {
      setSelectedList(target);
      setInitializedFromParent(true);
    }
  }, [initialSelectedListId, allLists, initializedFromParent]);

  const filteredLists = allLists.filter(list => 
    list.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    list.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (selectedList) {
    return (
      <FlowListDetailPage 
        flowList={selectedList} 
        onBack={() => setSelectedList(null)} 
        onImport={(list) => {
          onImportFlowList(list);
        }}
      />
    );
  }

  return (
    <div className="h-full bg-[#F2F2F7] flex flex-col">
      {/* 顶部搜索栏 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 mb-3">社区发现</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="搜索 FlowList、标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 border-none rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-28">
        <div className="grid grid-cols-2 gap-4">
          {filteredLists.map(list => {
            const mainSceneTag = list.items[0]?.sceneTag || 'default';
            const sceneConfig = SCENE_CONFIGS[mainSceneTag as SceneTag] || SCENE_CONFIGS['default'];
            const Icon = sceneConfig.icon;
            const colorClass = SCENE_COLORS[mainSceneTag] || SCENE_COLORS['default'];

            return (
              <div 
                key={list.id}
                onClick={() => setSelectedList(list)}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 active:scale-95 transition-all duration-200"
              >
                {/* 封面 */}
                <div className="aspect-square w-full relative">
                  {list.coverImage ? (
                    <img src={list.coverImage} alt={list.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                      <Icon size={32} className="text-white opacity-80" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-black/20 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <Play size={8} fill="currentColor" />
                    {list.playCount}
                  </div>
                </div>
                
                {/* 信息 */}
                <div className="p-3">
                  <h3 className="font-bold text-slate-800 text-sm line-clamp-2 mb-1 h-10">
                    {list.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {list.author.avatar && (
                        <img src={list.author.avatar} alt={list.author.name} className="w-4 h-4 rounded-full" />
                      )}
                      <span className="text-[10px] text-slate-500 truncate max-w-[60px]">{list.author.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Heart size={10} />
                      {list.likeCount}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredLists.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Search size={48} className="opacity-20 mb-4" />
            <p className="text-sm">没有找到相关内容</p>
          </div>
        )}
      </div>
    </div>
  );
};
