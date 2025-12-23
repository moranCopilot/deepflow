import { useState, useRef, type MouseEvent, type Dispatch, type SetStateAction, useEffect } from 'react';
import { Camera, FileText, Mic, Package, Play, Loader2, Sparkles, Brain, Coffee, Library, Tag, List, Calendar, X, AlignLeft, Users, Radio, MessageCircle, Plus, ChevronUp, Music, CheckCircle, Circle, ChevronLeft, ChevronRight, AlertCircle, Mic2, Square, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { useLiveSession } from '../hooks/useLiveSession';
import { PackingAnimation } from './PackingAnimation';
import { getApiUrl } from '../utils/api-config';

export interface KnowledgeCard {
    id: string;
    title: string;
    content: string;
    tags: string[];
    timestamp: Date;
}

interface RawInput {
    id: string;
    type: string;
    name?: string;
    time: string;
    timestamp: number;
}

interface FlowItem {
    id: string;
    title: string;
    duration: string;
    type: string;
    tldr: string;
    subtitles: { time: string; text: string }[];
    status: 'ready' | 'playing' | 'completed';
    scenes: string[];
    subject: string;
    mode: 'single' | 'dual';
    contentType: 'output' | 'discussion' | 'interactive';
    script?: { speaker: string; text: string }[];
    knowledgeCards?: KnowledgeCard[];
}

interface SupplyDepotAppProps {
  onStartFlow: () => void;
  onStopFlow: () => void;
  isFlowing: boolean;
  knowledgeCards: KnowledgeCard[];
  onUpdateKnowledgeCards: Dispatch<SetStateAction<KnowledgeCard[]>>;
  currentContext: 'deep_work' | 'casual';
  onContextChange: (context: 'deep_work' | 'casual') => void;
}

export function SupplyDepotApp({ onStartFlow, onStopFlow, isFlowing, knowledgeCards, onUpdateKnowledgeCards, currentContext, onContextChange }: SupplyDepotAppProps) {
  const [rawInputs, setRawInputs] = useState<RawInput[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentInputType, setCurrentInputType] = useState<string>('');
  
  const [archivedInputs, setArchivedInputs] = useState<RawInput[]>([]);
  const [flowItems, setFlowItems] = useState<FlowItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [readyToFlow, setReadyToFlow] = useState(false);
  const [gardenTab, setGardenTab] = useState<'cards' | 'files'>('cards');
  const [flowViewMode, setFlowViewMode] = useState<'scenes' | 'list'>('scenes');
  const [selectedItem, setSelectedItem] = useState<FlowItem | null>(null);
  const [filterPreset, setFilterPreset] = useState('all');
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [isGardenOpen, setIsGardenOpen] = useState(false);
  const [playlistSelection, setPlaylistSelection] = useState<Set<string>>(new Set());
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(false);

  // Generation Preferences
  const [genPreset, setGenPreset] = useState('quick_summary');
  const [generationPreferences, setGenerationPreferences] = useState({
    duration: 'short',
    mode: 'single',
    type: 'output',
    preset: 'quick_summary'
  });

  const PRESETS: Record<string, { label: string, duration: string, mode: string, type: string }> = {
      quick_summary: { label: '速听精华', duration: 'short', mode: 'single', type: 'output' },
      deep_analysis: { label: '深度剖析', duration: 'long', mode: 'dual', type: 'discussion' },
      interactive_practice: { label: '提问练习', duration: 'medium', mode: 'dual', type: 'interactive' }
  };

  useEffect(() => {
      const p = PRESETS[genPreset];
      if (p) {
          setGenerationPreferences({
              duration: p.duration,
              mode: p.mode,
              type: p.type,
              preset: genPreset
          });
      }
  }, [genPreset]);


  // Audio Player State
  const [audioUrls, setAudioUrls] = useState<{url: string, shortText: string}[]>([]);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  // Live Session State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const liveSession = useLiveSession(
      selectedItem?.script?.map(s => `${s.speaker}: ${s.text}`).join('\n') || '',
      selectedItem?.knowledgeCards || [],
      () => console.log("Live Connected"),
      () => {
          console.log("Live Disconnected");
          setIsLiveMode(false);
      },
      (error) => {
          console.error("Live Session Error:", error);
          const errorMessage = error?.message || "连接实时服务失败";
          
          // Show user-friendly error message
          alert(errorMessage);
          setIsLiveMode(false);
      }
  );

  useEffect(() => {
      if (isLiveMode && !liveSession.isConnected) {
          try {
              liveSession.connect();
          } catch (error: any) {
              console.error("Failed to start live session:", error);
              alert(`无法启动实时会话：${error?.message || '未知错误'}\n\n注意：Vercel Serverless Functions 不支持 WebSocket，此功能需要单独部署 WebSocket 服务器。`);
              setIsLiveMode(false);
          }
      }
      return () => {
          if (isLiveMode && liveSession.isConnected) {
              try {
                  liveSession.disconnect();
              } catch (error) {
                  console.error("Error disconnecting:", error);
              }
          }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode]);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
      if (audioRef.current && audioUrls.length > 0) {
          audioRef.current.load(); // Reload audio source
          audioRef.current.play().catch(e => console.log("Auto-play prevented/pending interaction", e));
      }
  }, [currentAudioIndex, audioUrls]);

  // Calculate and update actual audio duration when audio URLs are loaded
  useEffect(() => {
    if (audioUrls.length > 0 && selectedItem) {
      let isCancelled = false;
      
      // Calculate total duration of all audio segments
      const audioPromises = audioUrls.map(urlObj => {
        return new Promise<number>((resolve) => {
          const audio = new Audio(urlObj.url);
          const handleLoadedMetadata = () => {
            if (!isCancelled) {
              resolve(audio.duration || 0);
            }
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('error', handleError);
          };
          const handleError = () => {
            if (!isCancelled) {
              resolve(0);
            }
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('error', handleError);
          };
          
          audio.addEventListener('loadedmetadata', handleLoadedMetadata);
          audio.addEventListener('error', handleError);
          
          // Timeout fallback (5 seconds)
          setTimeout(() => {
            if (!isCancelled) {
              resolve(0);
              audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
              audio.removeEventListener('error', handleError);
            }
          }, 5000);
        });
      });
      
      Promise.all(audioPromises).then(durations => {
        if (isCancelled) return;
        
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        if (totalDuration > 0 && selectedItem) {
          const minutes = Math.floor(totalDuration / 60);
          const seconds = Math.floor(totalDuration % 60);
          const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          
          // Only update if duration changed and item still exists
          setFlowItems(prev => prev.map(item => {
            if (item.id === selectedItem.id && item.duration !== formattedDuration) {
              console.log(`Updating duration for ${item.title}: ${item.duration} -> ${formattedDuration}`);
              return { ...item, duration: formattedDuration };
            }
            return item;
          }));
        }
      });
      
      return () => {
        isCancelled = true;
      };
    }
  }, [audioUrls, selectedItem]);

  const handlePlayAudio = async (item: FlowItem) => {
    if (!item.script) return;
    setIsPlayingAudio(true);
    setAudioError(null);
    
    const cleanText = item.script.map(s => `${s.speaker}: ${s.text}`).join('\n');

    try {
        const response = await fetch(getApiUrl('/api/tts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText })
        });
        const data = await response.json();
        if (data.urls) {
            // Convert to proxy URLs
            const proxyUrls = data.urls.map((u: any) => ({
                ...u,
                url: `${getApiUrl('/api/proxy-audio')}?url=${encodeURIComponent(u.url)}`
            }));
            setAudioUrls(proxyUrls);
            setCurrentAudioIndex(0);
            
            // Calculate and update actual audio duration
            const calculateDuration = () => {
              const audioPromises = proxyUrls.map((urlObj: {url: string, shortText: string}) => {
                return new Promise<number>((resolve) => {
                  const audio = new Audio(urlObj.url);
                  const handleLoadedMetadata = () => {
                    resolve(audio.duration || 0);
                    audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    audio.removeEventListener('error', handleError);
                  };
                  const handleError = () => {
                    resolve(0);
                    audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    audio.removeEventListener('error', handleError);
                  };
                  
                  audio.addEventListener('loadedmetadata', handleLoadedMetadata);
                  audio.addEventListener('error', handleError);
                  
                  // Timeout fallback
                  setTimeout(() => {
                    resolve(0);
                    audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    audio.removeEventListener('error', handleError);
                  }, 5000);
                });
              });
              
              Promise.all(audioPromises).then(durations => {
                const totalDuration = durations.reduce((sum, d) => sum + d, 0);
                if (totalDuration > 0) {
                  const minutes = Math.floor(totalDuration / 60);
                  const seconds = Math.floor(totalDuration % 60);
                  const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  
                  // Update FlowItem duration
                  setFlowItems(prev => prev.map(flowItem => {
                    if (flowItem.id === item.id && flowItem.duration !== formattedDuration) {
                      return { ...flowItem, duration: formattedDuration };
                    }
                    return flowItem;
                  }));
                }
              });
            };
            
            // Delay to ensure URLs are ready
            setTimeout(calculateDuration, 300);
        }
    } catch (error) {
        console.error("TTS Error", error);
        setIsPlayingAudio(false);
        setAudioError("Failed to generate audio. Please try again.");
    }
  };

  const handleAudioError = (e: any) => {
      console.error("Audio Load Error", e);
      setAudioError("Failed to load audio segment. Network error or format not supported.");
  };

  const convertScriptToMarkdown = (script: { speaker: string; text: string }[]): string => {
      if (!script || script.length === 0) return '';
      
      const markdown = script.map((line) => {
          return `## ${line.speaker}\n\n${line.text}`;
      }).join('\n\n');
      
      return markdown;
  };

  const copyScriptAsMarkdown = async () => {
      if (!selectedItem?.script) return;
      
      const markdown = convertScriptToMarkdown(selectedItem.script);
      
      try {
          await navigator.clipboard.writeText(markdown);
          setCopiedScript(true);
          setTimeout(() => setCopiedScript(false), 2000);
      } catch (error) {
          console.error('Failed to copy:', error);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = markdown;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          try {
              document.execCommand('copy');
              setCopiedScript(true);
              setTimeout(() => setCopiedScript(false), 2000);
          } catch (err) {
              console.error('Fallback copy failed:', err);
          }
          document.body.removeChild(textArea);
      }
  };

  const addRawInput = (type: string) => {
    setCurrentInputType(type);
    if (fileInputRef.current) {
        // Reset value to allow selecting the same file again
        fileInputRef.current.value = '';
        if (type === '图片') fileInputRef.current.accept = "image/*";
        else if (type === '录音') fileInputRef.current.accept = "audio/*";
        else fileInputRef.current.accept = ".pdf,.doc,.docx,.txt";
        fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        setSelectedFiles(prev => [...prev, ...files]);
        
        // Add visual feedback
        const newInputs = files.map((file) => ({
            id: Math.random().toString(36).slice(2, 11),
            type: currentInputType,
            name: file.name,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
        }));
        setRawInputs(prev => [...prev, ...newInputs]);
    }
  };

  const generateFlowList = async (retryCount = 0) => {
    if (rawInputs.length === 0) return;
    
    const maxRetries = 2;
    setIsGenerating(true);
    setGenerationProgress(retryCount > 0 ? `重试中 (${retryCount}/${maxRetries})...` : '正在上传文件...');

    try {
        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });
        
        // Add generation preferences
        formData.append('preferences', JSON.stringify(generationPreferences));

        setGenerationProgress(retryCount > 0 ? `重试中 (${retryCount}/${maxRetries})...` : '正在分析内容...');
        
        // Use the new API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 65000); // 65s timeout (slightly more than Vercel's 60s)
        
        let response: Response;
        try {
            response = await fetch(getApiUrl('/api/analyze'), {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            // Check if it's an abort error (timeout)
            if (fetchError.name === 'AbortError') {
                throw new Error('TIMEOUT_ERROR');
            }
            
            // Network error - backend is likely not running or CORS issue
            console.error("Network error:", fetchError);
            throw new Error('NETWORK_ERROR');
        }

        if (!response.ok) {
            // Try to parse error message from response
            let errorMessage = `服务器错误: ${response.status} ${response.statusText}`;
            let isRetryable = false;
            
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                    // Check if error suggests retry
                    isRetryable = errorMessage.includes('超时') || 
                                  errorMessage.includes('timeout') || 
                                  errorMessage.includes('重试') ||
                                  response.status === 504 ||
                                  response.status === 503;
                }
            } catch (e) {
                // If response is not JSON, use default message
            }
            
            // Auto-retry for timeout errors
            if (isRetryable && retryCount < maxRetries) {
                console.log(`Retrying due to timeout (attempt ${retryCount + 1}/${maxRetries})...`);
                setGenerationProgress(`请求超时，自动重试 (${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                return generateFlowList(retryCount + 1);
            }
            
            throw new Error(`HTTP_ERROR|${response.status}|${errorMessage}`);
        }

        setGenerationProgress('正在生成内容...');
        const data = await response.json();
        
        // Check if response contains error
        if (data.error) {
            // Check if error suggests retry
            const isRetryable = data.error.includes('超时') || 
                                data.error.includes('timeout') || 
                                data.error.includes('重试');
            
            if (isRetryable && retryCount < maxRetries) {
                console.log(`Retrying due to error (attempt ${retryCount + 1}/${maxRetries})...`);
                setGenerationProgress(`生成失败，自动重试 (${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return generateFlowList(retryCount + 1);
            }
            
            throw new Error(`SERVER_ERROR|${data.error}`);
        }
        
        setGenerationProgress('处理结果...');
        
        // Archive raw inputs
        setArchivedInputs(prev => [...prev, ...rawInputs]);
        setRawInputs([]);
        setSelectedFiles([]);

        // Process Knowledge Cards
        let newCards: KnowledgeCard[] = [];
        if (data.knowledgeCards && Array.isArray(data.knowledgeCards)) {
            newCards = data.knowledgeCards.map((card: any) => ({
                id: Math.random().toString(36).slice(2, 11),
                title: card.title,
                content: card.content,
                tags: card.tags || [],
                timestamp: new Date()
            }));
            onUpdateKnowledgeCards(prev => [...newCards, ...prev]);
        }

        // Create Flow Item from Podcast Script
        const subtitles = data.podcastScript ? data.podcastScript.map((line: any, index: number) => ({
            time: `00:${index < 10 ? '0' + index : index}0`, // Fake timing for now
            text: `${line.speaker}: ${line.text}`
        })) : [];

        const aiFlowItem: FlowItem = {
            id: Math.random().toString(36).slice(2, 11),
            title: data.title || 'AI 深度分析',
            duration: '10:00', // Estimate
            type: 'insight',
            tldr: data.summary || '基于上传素材的深度解析',
            subtitles: subtitles,
            status: 'ready',
            scenes: ['deep_work', 'casual'],
            subject: 'tech', // Could be inferred
            mode: generationPreferences?.preset === 'quick_summary' ? 'single' : 'dual',
            contentType: generationPreferences?.preset === 'interactive_practice' ? 'interactive' : 
                         generationPreferences?.preset === 'quick_summary' ? 'output' : 'discussion',
            script: data.podcastScript,
            knowledgeCards: newCards
        };

        setFlowItems(prev => [aiFlowItem, ...prev]);
        setReadyToFlow(true);
        setShowInputPanel(false);
        setGenerationProgress('');

    } catch (error: any) {
        console.error("Failed to generate flow list:", error);
        
        let errorMessage = "生成失败";
        let canRetry = false;
        
        if (error.message === 'TIMEOUT_ERROR') {
            errorMessage = "请求超时（65秒）\n\n可能原因：\n1. 文件过大\n2. 服务器繁忙\n\n建议：\n1. 使用较小的文件\n2. 点击「重试」按钮";
            canRetry = true;
        } else if (error.message === 'NETWORK_ERROR') {
            errorMessage = "生成失败，无法连接到后端服务\n\n请检查：\n1. 后端服务是否已启动\n2. 网络连接是否正常";
        } else if (error.message.startsWith('HTTP_ERROR|')) {
            const parts = error.message.split('|');
            const statusCode = parts[1];
            const httpError = parts.slice(2).join('|');
            errorMessage = `生成失败 (HTTP ${statusCode})\n\n${httpError}`;
            canRetry = statusCode === '504' || statusCode === '503';
        } else if (error.message.startsWith('SERVER_ERROR|')) {
            const serverError = error.message.replace('SERVER_ERROR|', '');
            errorMessage = `生成失败: ${serverError}`;
            canRetry = serverError.includes('超时') || serverError.includes('重试');
        } else {
            errorMessage = `生成失败: ${error.message || '未知错误'}`;
        }
        
        // Show retry option if applicable
        if (canRetry && retryCount < maxRetries) {
            const shouldRetry = confirm(`${errorMessage}\n\n是否自动重试？`);
            if (shouldRetry) {
                setGenerationProgress(`手动重试中...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return generateFlowList(retryCount + 1);
            }
        } else {
            alert(errorMessage);
        }
    } finally {
        setIsGenerating(false);
        setGenerationProgress('');
    }
  };

  const toggleSelection = (id: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPlaylistSelection(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    });
  };

  const clearPlaylistSelection = () => {
    setPlaylistSelection(new Set());
    setIsPlaylistExpanded(false);
  };

  const removeFromPlaylist = (id: string) => {
    setPlaylistSelection(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const selectedPlaylistItems = Array.from(playlistSelection)
    .map(id => flowItems.find(item => item.id === id))
    .filter((item): item is FlowItem => Boolean(item));

  const renderInputPanel = () => {
    if (isGenerating) {
        return <PackingAnimation fileNames={selectedFiles.map(f => f.name)} />;
    }

    return (
    <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">知识打包 (Pack My Bag)</h3>
        <div className="grid grid-cols-3 gap-3">
            <button onClick={() => addRawInput('图片')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Camera size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">拍照</span>
            </button>
            <button onClick={() => addRawInput('文档')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                    <FileText size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">导入</span>
            </button>
            <button onClick={() => addRawInput('录音')} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors active:scale-95">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                    <Mic size={20} />
                </div>
                <span className="text-[10px] font-medium text-slate-600">录音</span>
            </button>
        </div>

        {/* Raw Input List */}
        {rawInputs.length > 0 && (
            <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
                {rawInputs.map((input) => (
                    <div key={input.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs">
                        <span className="text-slate-600 flex items-center gap-2 min-w-0" title={input.name}>
                            {input.type === '图片' && <Camera size={12} className="shrink-0" />}
                            {input.type === '文档' && <FileText size={12} className="shrink-0" />}
                            {input.type === '录音' && <Mic size={12} className="shrink-0" />}
                            <span className="truncate">{input.name || `${input.type}输入`}</span>
                        </span>
                        <span className="text-slate-400 font-mono shrink-0 ml-2">{input.time}</span>
                    </div>
                ))}
            </div>
        )}

        {/* Generation Preferences */}
        {rawInputs.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4 mt-2">
                {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                        key={key}
                        onClick={() => setGenPreset(key)}
                        className={clsx(
                            "p-2 rounded-xl border text-left transition-all",
                            genPreset === key
                                ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                                : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        )}
                    >
                        <div className={clsx("text-xs font-bold mb-0.5", genPreset === key ? "text-indigo-700" : "text-slate-700")}>
                            {preset.label}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {preset.duration === 'short' ? '5m' : preset.duration === 'medium' ? '15m' : '>15m'} · {preset.mode === 'single' ? '单人' : '双人'} · {preset.type === 'output' ? '输出' : '探讨'}
                        </div>
                    </button>
                ))}
            </div>
        )}

        {/* Generate Button - Only show when there are inputs */}
        {rawInputs.length > 0 && (
            <div className="space-y-2">
                <button 
                    onClick={() => generateFlowList()}
                    disabled={isGenerating}
                    className={clsx(
                        "w-full py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-all",
                        !isGenerating
                            ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200" 
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    )}
                >
                    {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {generationProgress || '生成中...'}</>
                    ) : (
                        <><Sparkles size={16} /> AI 整理</>
                    )}
                </button>
                {isGenerating && (
                    <p className="text-xs text-slate-400 text-center">
                        大文件可能需要 30-60 秒，请耐心等待
                    </p>
                )}
            </div>
        )}
    </div>
    );
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
    <div className="flex flex-col h-full bg-[#F2F2F7] relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        className="hidden" 
        multiple 
      />
      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <button
          onClick={() => setIsGardenOpen(true)}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          aria-label="打开花园"
        >
          <Library size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deep Flow</h1>
          <p className="text-slate-500 text-sm font-medium truncate">准备你的专注素材</p>
        </div>
        
        {/* View Toggle - REMOVED (Controlled by parent) */}
        <div className="flex items-center gap-2">
            {/* Placeholder for alignment if needed */}
        </div>

        {flowItems.length > 0 && (
          <button
            onClick={() => setShowInputPanel(true)}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            aria-label="添加素材"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {isGardenOpen && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setIsGardenOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-[#F2F2F7] shadow-2xl rounded-r-3xl overflow-hidden animate-in slide-in-from-left duration-200">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-slate-900">花园</h2>
                <span className="text-xs text-slate-400">知识小票 & 原始文件</span>
              </div>
              <button
                onClick={() => setIsGardenOpen(false)}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
                aria-label="关闭花园"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button
                  onClick={() => setGardenTab('cards')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    gardenTab === 'cards' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  )}
                >
                  知识小票
                </button>
                <button
                  onClick={() => setGardenTab('files')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    gardenTab === 'files' ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                  )}
                >
                  原始文件库
                </button>
              </div>
            </div>

            <div className="px-4 pb-5 overflow-y-auto no-scrollbar space-y-4" style={{ height: 'calc(100% - 126px)' }}>
              {gardenTab === 'cards' ? (
                knowledgeCards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                    <Library size={48} className="opacity-20" />
                    <p className="text-sm">暂无知识小票</p>
                    <p className="text-xs max-w-[220px] text-center opacity-60">在 Flow 模式中自动生成并归档。</p>
                  </div>
                ) : (
                  knowledgeCards.map(card => (
                    <div key={card.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-3">
                        <h3 className="font-bold text-slate-800 text-sm line-clamp-2">{card.title}</h3>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{card.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
                )
              ) : (
                archivedInputs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                    <Package size={48} className="opacity-20" />
                    <p className="text-sm">暂无原始文件</p>
                    <p className="text-xs max-w-[220px] text-center opacity-60">打包生成后自动归档至此。</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {archivedInputs.map((input) => (
                      <div key={input.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            input.type === '图片' ? "bg-blue-100 text-blue-600" :
                            input.type === '文档' ? "bg-orange-100 text-orange-600" :
                            "bg-red-100 text-red-600"
                          )}>
                            {input.type === '图片' && <Camera size={14} />}
                            {input.type === '文档' && <FileText size={14} />}
                            {input.type === '录音' && <Mic size={14} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-slate-700 truncate" title={input.name}>{input.name || `${input.type}输入 #${input.id.slice(0, 4)}`}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">{new Date(input.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 shrink-0">已归档</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {showInputPanel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInputPanel(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">添加素材</h3>
              <button onClick={() => setShowInputPanel(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <X size={16} />
              </button>
            </div>
            {renderInputPanel()}
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto no-scrollbar pb-28">
        {flowItems.length === 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            {renderInputPanel()}
          </div>
        )}

        {flowItems.length > 0 && (
        <div className="bg-white rounded-3xl p-5 shadow-sm min-h-[200px] animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Flow List</h3>
            {flowItems.length > 0 && (
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setFlowViewMode('scenes')}
                  className={clsx(
                    "p-1.5 rounded-md transition-all",
                    flowViewMode === 'scenes' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
                  )}
                >
                  <Calendar size={14} />
                </button>
                <button
                  onClick={() => setFlowViewMode('list')}
                  className={clsx(
                    "p-1.5 rounded-md transition-all",
                    flowViewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
                  )}
                >
                  <List size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
              {flowViewMode === 'scenes' ? (
                <div className="space-y-4">
                  {[
                    { id: 'deep_work', label: '深度学习', icon: Brain, color: 'bg-black text-white', desc: '高强度专注' },
                    { id: 'casual', label: '休闲听书', icon: Coffee, color: 'bg-green-600 text-white', desc: '轻松氛围' }
                  ].map(scene => {
                    const sceneItems = flowItems.filter(item => item.scenes.includes(scene.id));
                    if (sceneItems.length === 0) return null;

                    const isActive = currentContext === scene.id;

                    return (
                      <div
                        key={scene.id}
                        className={clsx(
                          "bg-slate-50 rounded-2xl p-4 border transition-all duration-300",
                          isActive ? "border-indigo-500 shadow-md ring-1 ring-indigo-500 bg-white" : "border-slate-100 hover:border-slate-300"
                        )}
                        onClick={() => onContextChange(scene.id as 'deep_work' | 'casual')}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center transition-colors", isActive ? "bg-indigo-600 text-white" : scene.color)}>
                              <scene.icon size={16} />
                            </div>
                            <div>
                              <h4 className={clsx("text-sm font-bold", isActive ? "text-indigo-900" : "text-slate-800")}>{scene.label}</h4>
                              <p className="text-[10px] text-slate-400">{scene.desc}</p>
                            </div>
                          </div>
                          {isActive && <CheckCircle size={18} className="text-indigo-600" />}
                        </div>
                        <div className="space-y-2">
                          {sceneItems.map(item => (
                            <button
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                              className="w-full flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-100 hover:border-indigo-100 transition-all text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <Play size={12} fill="currentColor" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-semibold text-slate-700 truncate">{item.title}</h5>
                                <p className="text-[10px] text-slate-400 truncate">{item.tldr}</p>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">{item.duration}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button
                        onClick={() => setFilterPreset('all')}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border whitespace-nowrap",
                            filterPreset === 'all'
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                        )}
                    >
                        全部
                    </button>
                    {Object.entries(PRESETS).map(([key, preset]) => (
                        <button
                            key={key}
                            onClick={() => setFilterPreset(key)}
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border whitespace-nowrap",
                                filterPreset === key
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                    : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                            )}
                        >
                            {preset.label}
                        </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {flowItems.filter(item => {
                      if (filterPreset === 'all') return true;
                      
                      const preset = PRESETS[filterPreset];
                      if (!preset) return true;

                      // Check Mode
                      if (item.mode !== preset.mode) return false;
                      // Check Type
                      if (item.contentType !== preset.type) return false;
                      
                      // Check Duration
                      const mins = parseInt(item.duration.split(':')[0]);
                      if (preset.duration === 'short' && mins >= 5) return false;
                      if (preset.duration === 'medium' && (mins < 5 || mins > 15)) return false;
                      if (preset.duration === 'long' && mins <= 15) return false;

                      return true;
                    }).map(item => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        role="button"
                        tabIndex={0}
                        className={clsx(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.98]",
                          playlistSelection.has(item.id)
                            ? "bg-indigo-50 border-indigo-200 hover:border-indigo-300"
                            : "bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-indigo-100"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            {item.mode === 'dual' ? <Users size={16} /> : <Play size={16} fill="currentColor" />}
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-semibold text-slate-700 text-left line-clamp-1">{item.title}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-500">{item.duration}</span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                {item.contentType === 'discussion' ? <MessageCircle size={10} /> : <Radio size={10} />}
                                {item.contentType === 'discussion' ? '探讨' : '输出'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => toggleSelection(item.id, e)}
                          className={clsx(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0",
                            playlistSelection.has(item.id)
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                          )}
                          aria-label={playlistSelection.has(item.id) ? "取消选择" : "选择加入播放列表"}
                        >
                          {playlistSelection.has(item.id) ? (
                            <CheckCircle size={18} className="text-white" />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>
        )}
      </div>

      {flowViewMode === 'list' && selectedPlaylistItems.length > 0 && (
        <div className="absolute left-0 right-0 bottom-0 z-40 px-3 pb-3">
          <div className="mx-auto w-full max-w-[420px] bg-white border border-slate-200 rounded-xl shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Music size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 truncate">
                    {selectedPlaylistItems.length === 1
                      ? selectedPlaylistItems[0]?.title
                      : `${selectedPlaylistItems[0]?.title} +${selectedPlaylistItems.length - 1}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={clearPlaylistSelection}
                  className="text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={() => setIsPlaylistExpanded(v => !v)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
                  aria-label={isPlaylistExpanded ? "收起播放列表" : "展开播放列表"}
                >
                  <ChevronUp
                    size={14}
                    className={clsx("transition-transform", isPlaylistExpanded ? "rotate-180" : "rotate-0")}
                  />
                </button>
                <button
                  onClick={onStartFlow}
                  className="h-8 px-3 rounded-full bg-black text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
                >
                  <Play size={14} fill="currentColor" /> go flow
                </button>
              </div>
            </div>

            {isPlaylistExpanded && (
              <div className="border-t border-slate-100 max-h-44 overflow-y-auto">
                {selectedPlaylistItems.map(item => (
                  <div
                    key={item.id}
                    className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-semibold text-slate-800 truncate">{item.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.duration}</div>
                    </button>
                    <button
                      onClick={() => removeFromPlaylist(item.id)}
                      className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
                      aria-label="从播放列表移除"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {flowItems.length > 0 && !(flowViewMode === 'list' && selectedPlaylistItems.length > 0) && (
        <div className="absolute left-0 right-0 bottom-0 px-4 pb-4 pt-2">
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
      )}

      {/* Detail View Modal / Overlay */}
      {selectedItem && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                  <div className="flex flex-col">
                      <h2 className="text-lg font-bold text-slate-900">{selectedItem.title}</h2>
                      <span className="text-xs text-slate-400">AI Audio Gen • {selectedItem.duration}</span>
                  </div>
                  <button onClick={() => setSelectedItem(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100">
                      <X size={20} />
                  </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 p-6 overflow-y-auto">
                  {/* Audio Player Section */}
                  <div className="w-full mb-8">
                      <div className="w-full bg-slate-900 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-xl text-white">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 to-slate-900 z-0" />
                      
                      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
                          <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center animate-pulse">
                              <Music size={32} className="text-indigo-400" />
                          </div>
                          
                          <div className="text-center">
                              <h3 className="font-bold text-lg">{selectedItem.title}</h3>
                              <p className="text-sm text-slate-400">DeepFlow Audio • {selectedItem.duration}</p>
                          </div>

                          {isLiveMode ? (
                              <div className="w-full flex flex-col items-center gap-4 py-4 mt-4 bg-black/20 rounded-2xl border border-white/10">
                                  {!liveSession.isConnected ? (
                                      <div className="flex flex-col items-center justify-center py-8">
                                          <Loader2 size={24} className="animate-spin text-indigo-400 mb-2" />
                                          <span className="text-xs text-slate-400">Connecting to Gemini Live...</span>
                                      </div>
                                  ) : (
                                      <>
                                          <div className="flex items-center gap-2 text-green-400 mb-2">
                                               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                               <span className="text-xs font-bold uppercase tracking-wider">Live Practice Session</span>
                                          </div>
                                          
                                          <div className="w-full h-24 flex items-center justify-center gap-1">
                                               {[1,2,3,4,5,4,3,2,1].map((h, i) => (
                                                   <div key={i} className="w-2 bg-indigo-500 rounded-full animate-bounce" style={{ height: h * 8 + 'px', animationDelay: i * 0.1 + 's' }} />
                                               ))}
                                          </div>
                              
                                          <div className="flex items-center gap-4 mt-4">
                                               <button 
                                                   onClick={liveSession.isSpeaking ? liveSession.stopRecording : liveSession.startRecording}
                                                   className={clsx(
                                                       "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg",
                                                       liveSession.isSpeaking ? "bg-red-500 text-white animate-pulse shadow-red-500/50" : "bg-white text-slate-900 hover:scale-105"
                                                   )}
                                               >
                                                   {liveSession.isSpeaking ? <Square fill="currentColor" /> : <Mic2 size={28} />}
                                               </button>
                                          </div>
                                          <p className="text-xs text-slate-400 mt-2">{liveSession.isSpeaking ? "Listening..." : "Tap to Speak"}</p>
                                      </>
                                  )}
                                  
                                  <button 
                                      onClick={() => {
                                          liveSession.disconnect();
                                          setIsLiveMode(false);
                                      }}
                                      className="text-xs text-slate-400 hover:text-white transition-colors mt-2 underline"
                                  >
                                      End Session
                                  </button>
                              </div>
                          ) : (
                              selectedItem.contentType === 'interactive' ? (
                                <button 
                                    onClick={() => setIsLiveMode(true)}
                                    className="mt-4 px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform shadow-lg shadow-indigo-500/30"
                                >
                                    <Mic2 size={18} />
                                    Start Live Practice
                                </button>
                              ) : (
                                  audioUrls.length > 0 ? (
                              <div className="w-full mt-4 flex flex-col items-center">
                                  <div className="w-full flex justify-end mb-2 px-1">
                                      <button 
                                          onClick={() => {
                                              const rates = [1, 1.25, 1.5, 2];
                                              const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
                                              setPlaybackRate(rates[nextIndex]);
                                          }}
                                          className="text-[10px] font-bold text-slate-400 bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition-colors"
                                      >
                                          {playbackRate}x
                                      </button>
                                  </div>
                                  <audio
                                      ref={audioRef}
                                      controls
                                      className="w-full mb-3"
                                      src={audioUrls[currentAudioIndex]?.url}
                                      onError={handleAudioError}
                                      onEnded={() => {
                                        if (currentAudioIndex < audioUrls.length - 1) {
                                            setCurrentAudioIndex(prev => prev + 1);
                                        } else {
                                            setIsPlayingAudio(false);
                                        }
                                    }}
                                  />
                                  
                                  <div className="flex items-center justify-between w-full px-4 mt-2">
                                      <button 
                                          onClick={() => setCurrentAudioIndex(prev => Math.max(0, prev - 1))}
                                          disabled={currentAudioIndex === 0}
                                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                                      >
                                          <ChevronLeft size={20} />
                                      </button>
                                      
                                      <div className="flex flex-col items-center flex-1 min-w-0 px-2">
                                        <p className="text-center text-xs text-slate-400 font-mono mb-1">
                                            Part {currentAudioIndex + 1} / {audioUrls.length}
                                        </p>
                                        <p className="text-[10px] text-slate-500 w-full text-center truncate">
                                            {audioUrls[currentAudioIndex]?.shortText}
                                        </p>
                                      </div>

                                      <button 
                                          onClick={() => setCurrentAudioIndex(prev => Math.min(audioUrls.length - 1, prev + 1))}
                                          disabled={currentAudioIndex === audioUrls.length - 1}
                                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                                      >
                                          <ChevronRight size={20} />
                                      </button>
                                  </div>
                              </div>
                          ) : (
                              <button 
                                  onClick={() => handlePlayAudio(selectedItem)}
                                  disabled={isPlayingAudio}
                                  className="mt-4 px-8 py-3 bg-white text-slate-900 rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                              >
                                  {isPlayingAudio ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
                                  {isPlayingAudio ? "Generating Audio..." : "Play Podcast"}
                              </button>
                          )
                              )
                          )}

                          {audioError && (
                              <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-xl border border-red-500/20 text-xs">
                                  <AlertCircle size={14} />
                                  <span>{audioError}</span>
                              </div>
                          )}
                      </div>
                      </div>
                  </div>

                  <div className="space-y-8">
                      {/* TLDR Section */}
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-indigo-600">
                          <Sparkles size={16} />
                          <h3 className="text-xs font-bold uppercase tracking-wider">AI 提炼 (TL;DR)</h3>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-2xl text-sm text-indigo-900 leading-relaxed">
                          {selectedItem.tldr}
                      </div>
                  </div>

                  {/* Knowledge Cards Section */}
                  {selectedItem.knowledgeCards && selectedItem.knowledgeCards.length > 0 && (
                      <div className="space-y-3">
                          <div className="flex items-center gap-2 text-orange-600">
                              <Library size={16} />
                              <h3 className="text-xs font-bold uppercase tracking-wider">核心知识点</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                              {selectedItem.knowledgeCards.map((card, idx) => (
                                  <div key={idx} className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl">
                                      <h4 className="font-bold text-slate-800 text-sm mb-2">{card.title}</h4>
                                      <p className="text-xs text-slate-600 leading-relaxed">{card.content}</p>
                                      {card.tags && (
                                          <div className="flex gap-2 mt-3">
                                              {card.tags.map(tag => (
                                                  <span key={tag} className="px-2 py-0.5 bg-white text-orange-600 text-[10px] rounded border border-orange-100">
                                                      #{tag}
                                                  </span>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  {/* Full Script Section */}
                  {selectedItem.script && (
                      <div className="space-y-4">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-400">
                                  <AlignLeft size={16} />
                                  <h3 className="text-xs font-bold uppercase tracking-wider">完整逐字稿</h3>
                              </div>
                              <button
                                  onClick={copyScriptAsMarkdown}
                                  className={clsx(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                      copiedScript
                                          ? "bg-green-50 text-green-600 border border-green-200"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                                  )}
                                  title="复制整篇 Markdown"
                              >
                                  {copiedScript ? (
                                      <>
                                          <Check size={14} />
                                          <span>已复制</span>
                                      </>
                                  ) : (
                                      <>
                                          <Copy size={14} />
                                          <span>复制 Markdown</span>
                                      </>
                                  )}
                              </button>
                          </div>
                          <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                              {selectedItem.script.map((line, i) => (
                                  <div key={i} className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                          <div className={clsx(
                                              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]",
                                              line.speaker === 'Deep' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                                          )}>
                                              {line.speaker[0]}
                                          </div>
                                          <div className="text-xs font-bold text-slate-400">{line.speaker}</div>
                                      </div>
                                      <p className="text-sm text-slate-800 leading-[1.2]">{line.text}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
