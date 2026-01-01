import React, { useState } from 'react';
import { Library, Package, Trash2, Glasses, Camera, FileText, Mic, Tag, Printer } from 'lucide-react';
import clsx from 'clsx';
import { cacheManager } from '../utils/cache-manager';
import type { KnowledgeCard } from './SupplyDepotApp';

interface ArchivedInput {
  id: string;
  name: string;
  type: string;
  timestamp: number;
  [key: string]: any;
}

interface GardenPageProps {
  knowledgeCards: KnowledgeCard[];
  onPrintCard?: (card: KnowledgeCard) => void;
  files: ArchivedInput[];
  onDeleteFile: (id: string, name: string) => void;
}

export const GardenPage: React.FC<GardenPageProps> = ({ 
  knowledgeCards, 
  onPrintCard, 
  files, 
  onDeleteFile 
}) => {
  const [gardenTab, setGardenTab] = useState<'cards' | 'files' | 'cache'>('cards');
  const [cacheStats, setCacheStats] = useState<{ files: number; audio: number; metadata: number } | null>(null);
  
  // 删除确认弹窗状态
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ show: boolean; fileId: string | null; fileName: string | null }>({ 
    show: false, 
    fileId: null, 
    fileName: null 
  });

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteConfirmDialog({ show: true, fileId: id, fileName: name });
  };

  const confirmDeleteFile = () => {
    if (deleteConfirmDialog.fileId && deleteConfirmDialog.fileName) {
      onDeleteFile(deleteConfirmDialog.fileId, deleteConfirmDialog.fileName);
      setDeleteConfirmDialog({ show: false, fileId: null, fileName: null });
    }
  };

  const cancelDeleteFile = () => {
    setDeleteConfirmDialog({ show: false, fileId: null, fileName: null });
  };

  return (
    <div className="h-full bg-[#F2F2F7] flex flex-col relative">
      {/* 顶部标题 */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-200 z-10 flex justify-between items-center">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Library size={24} className="text-emerald-500" />
            知识
          </h2>
          <span className="text-xs text-slate-400">知识与灵感归档</span>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex bg-slate-200/50 p-1 rounded-xl">
          <button
            onClick={() => setGardenTab('cards')}
            className={clsx(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              gardenTab === 'cards' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            知识小票
          </button>
          <button
            onClick={() => setGardenTab('files')}
            className={clsx(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              gardenTab === 'files' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            原始文件库
          </button>
          <button
            onClick={async () => {
              setGardenTab('cache');
              const stats = await cacheManager.getCacheSize();
              setCacheStats(stats);
            }}
            className={clsx(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              gardenTab === 'cache' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            缓存管理
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-28 space-y-4">
        {gardenTab === 'cards' ? (
          knowledgeCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
              <Library size={48} className="opacity-20" />
              <p className="text-sm">暂无知识小票</p>
              <p className="text-xs max-w-[220px] text-center opacity-60">在 Flow 模式中自动生成并归档。</p>
            </div>
          ) : (
            knowledgeCards.map(card => (
              <div key={card.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3 group relative hover:shadow-md transition-all duration-300">
                <div className="flex justify-between items-start gap-3">
                  <h3 className="font-bold text-slate-800 text-sm line-clamp-2">{card.title}</h3>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {(card.timestamp instanceof Date ? card.timestamp : new Date(card.timestamp)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
                  {card.content}
                </p>
                <div className="flex flex-col gap-3 mt-1">
                  <div className="flex gap-2 flex-wrap">
                    {card.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-medium">
                        <Tag size={10} /> {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrintCard?.(card);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200"
                      title="打印小票"
                    >
                      <Printer size={14} />
                      <span className="text-xs font-bold">打印</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )
        ) : gardenTab === 'cache' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm mb-3">缓存统计</h3>
              {cacheStats ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">已缓存文件</span>
                    <span className="text-sm font-semibold text-slate-800">{cacheStats.files}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">已缓存音频</span>
                    <span className="text-sm font-semibold text-slate-800">{cacheStats.audio}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">已缓存 FlowItem</span>
                    <span className="text-sm font-semibold text-slate-800">{cacheStats.metadata}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">加载中...</p>
              )}
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">缓存操作</h3>
              <button
                onClick={async () => {
                  await cacheManager.clearExpiredCache();
                  const stats = await cacheManager.getCacheSize();
                  setCacheStats(stats);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                清理过期缓存
              </button>
              <button
                onClick={async () => {
                  if (confirm('确定要清理所有缓存吗？此操作无法撤销。')) {
                    await cacheManager.clearAllCache();
                    const stats = await cacheManager.getCacheSize();
                    setCacheStats(stats);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
              >
                清理所有缓存
              </button>
              <button
                onClick={async () => {
                  const stats = await cacheManager.getCacheSize();
                  setCacheStats(stats);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors"
              >
                刷新统计
              </button>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-xs text-slate-600 leading-relaxed">
                缓存功能可以避免重复上传和生成，提升使用体验。缓存数据存储在浏览器本地，不会上传到服务器。
              </p>
            </div>
          </div>
        ) : (
          files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
              <Package size={48} className="opacity-20" />
              <p className="text-sm">暂无原始文件</p>
              <p className="text-xs max-w-[220px] text-center opacity-60">打包生成后自动归档至此。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((input) => (
                <div key={input.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      input.type === 'glasses_capture' ? "bg-purple-100 text-purple-600" :
                      input.type === '图片' ? "bg-blue-100 text-blue-600" :
                      input.type === '文档' ? "bg-orange-100 text-orange-600" :
                      "bg-red-100 text-red-600"
                    )}>
                      {input.type === 'glasses_capture' && <Glasses size={14} />}
                      {input.type === '图片' && <Camera size={14} />}
                      {input.type === '文档' && <FileText size={14} />}
                      {input.type === '录音' && <Mic size={14} />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-slate-700 truncate" title={input.name}>{input.name || `${input.type}输入 #${input.id.slice(0, 4)}`}</span>
                      <span className="text-[10px] text-slate-400 font-mono truncate">{new Date(input.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">已归档</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(input.id, input.name);
                      }}
                      className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors"
                      aria-label="删除文件"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirmDialog.show && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={cancelDeleteFile} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900 mb-2">确认删除</h3>
                <p className="text-sm text-slate-600">
                  确定要删除文件 <span className="font-medium text-slate-900">"{deleteConfirmDialog.fileName || '未命名文件'}"</span> 吗？
                </p>
                <p className="text-xs text-slate-400 mt-2">此操作无法撤销</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={cancelDeleteFile}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteFile}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
