import React, { useState, useEffect } from 'react';
import { X, Upload, Globe, Sparkles, Check } from 'lucide-react';
import { addCommunityList, type SharedFlowList } from '../data/mock-community';
import type { FlowItem } from './SupplyDepotApp';
import { SCENE_CONFIGS, type SceneTag } from '../config/scene-config';

interface ShareToCommunityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  flowItems: FlowItem[];
}

export const ShareToCommunityDialog: React.FC<ShareToCommunityDialogProps> = ({ isOpen, onClose, flowItems }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 自动生成默认值
  useEffect(() => {
    if (isOpen && flowItems.length > 0) {
      // 1. 生成标题
      const mainScene = flowItems[0].sceneTag || 'default';
      const sceneLabel = SCENE_CONFIGS[mainScene as SceneTag]?.label || '学习';
      const generatedTitle = `${sceneLabel}清单：${flowItems.length} 个精选内容`;
      setTitle(generatedTitle);

      // 2. 生成描述
      const totalDuration = flowItems.reduce((acc, item) => {
        const [min, sec] = (item.duration || '00:00').split(':').map(Number);
        return acc + (min * 60) + sec;
      }, 0);
      const durationText = Math.floor(totalDuration / 60) + ' 分钟';
      const generatedDesc = `包含 ${flowItems.length} 个音频内容，总时长约 ${durationText}。适合${sceneLabel}场景收听。`;
      setDescription(generatedDesc);

      // 3. 生成标签
      const newTags = new Set<string>();
      newTags.add(sceneLabel);
      flowItems.forEach(item => {
        if (item.subject) newTags.add(item.subject);
      });
      setTags(Array.from(newTags).slice(0, 5));
    }
  }, [isOpen, flowItems]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim()) && tags.length < 5) {
        setTags([...tags, tagInput.trim()]);
        setTagInput('');
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!title || !description) return;
    
    setIsSubmitting(true);
    
    // 模拟网络请求
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newList: SharedFlowList = {
      id: Math.random().toString(36).slice(2, 11),
      title,
      description,
      tags,
      author: {
        id: 'current-user',
        name: '我',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Me'
      },
      items: flowItems,
      playCount: 0,
      likeCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    addCommunityList(newList);
    
    setIsSubmitting(false);
    setIsSuccess(true);
    
    // 延迟关闭
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
              <Check size={32} strokeWidth={3} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">分享成功！</h3>
            <p className="text-slate-500">你的 FlowList 已发布到社区</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Globe size={18} className="text-indigo-500" />
                分享到社区
              </h3>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border-none text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="给你的 FlowList 起个好听的名字"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">描述</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border-none text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  placeholder="介绍一下这个清单的内容和适用场景..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  标签 <span className="text-slate-400 font-normal normal-case tracking-normal">(最多5个)</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-xs font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-indigo-800">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  disabled={tags.length >= 5}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border-none text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder={tags.length >= 5 ? "标签数量已达上限" : "输入标签后按回车"}
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSubmit}
                  disabled={!title || !description || isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles size={18} className="animate-spin" />
                      发布中...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      发布到社区
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
