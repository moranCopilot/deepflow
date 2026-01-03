import { useState, useRef, useCallback } from 'react';
import { floatTo16BitPCM, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/audio-utils';
import { getApiUrl } from '../utils/api-config';

export function useLiveSession(
    script: string, 
    knowledgeCards: any[],
    onConnect?: () => void,
    onDisconnect?: () => void,
    onError?: (error: any) => void,
    onKnowledgeCard?: (card: any) => void,
    onTranscription?: (transcription: { source: 'input' | 'output'; text: string }) => void
) {
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioQueueRef = useRef<Array<{ data: string; timestamp: number }>>([]);
    const hasErrorRef = useRef<boolean>(false);
    
    const nextStartTimeRef = useRef<number>(0);

    const playAudioChunk = (base64Data: string, mimeType?: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        
        // Resume AudioContext if suspended (required for autoplay policies)
        if (ctx.state === 'suspended') {
            ctx.resume().catch(err => {
                console.error('[useLiveSession] Failed to resume AudioContext:', err);
            });
        }
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const float32Data = new Float32Array(arrayBuffer.byteLength / 2);
        const dataView = new DataView(arrayBuffer);

        for (let i = 0; i < float32Data.length; i++) {
            const int16 = dataView.getInt16(i * 2, true); // Little endian
            float32Data[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
        }

        // Gemini Live API outputs 24kHz PCM audio by default
        let sampleRate = 24000;
        if (mimeType) {
            // Try to parse sample rate from mimeType (e.g., "audio/pcm;rate=24000")
            const m = /rate=(\d+)/i.exec(mimeType);
            if (m) {
                const parsed = parseInt(m[1], 10);
                if (!Number.isNaN(parsed) && parsed > 0) {
                    sampleRate = parsed;
                }
            }
        }
        // Ensure we always use 24kHz for Gemini Live API output
        if (sampleRate !== 24000) {
            sampleRate = 24000;
        }
        try {
            const buffer = ctx.createBuffer(1, float32Data.length, sampleRate); 
            buffer.getChannelData(0).set(float32Data);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);

            const currentTime = ctx.currentTime;
            if (nextStartTimeRef.current < currentTime) {
                nextStartTimeRef.current = currentTime;
            }
            
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
        } catch (playError) {
            console.error('[useLiveSession] Error playing audio chunk:', playError);
        }
    };

    const connect = useCallback(async () => {
        try {
            // Validate script before proceeding
            if (!script || script.trim().length === 0) {
                throw new Error('脚本内容不能为空。请确保已选择包含脚本内容的学习材料。');
            }

            // Reset error flag
            hasErrorRef.current = false;

            // Initialize AudioContext for audio playback
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            
            // Resume AudioContext if suspended (required for autoplay policies)
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            // Close and clean up existing EventSource connection if any
            if (eventSourceRef.current) {
                // Remove all event listeners
                eventSourceRef.current.onopen = null;
                eventSourceRef.current.onmessage = null;
                eventSourceRef.current.onerror = null;
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }

            // Reset audio timing for new session
            nextStartTimeRef.current = 0;

            // Generate unique session ID
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            sessionIdRef.current = sessionId;

            // Initialize session
            // 在实时对话模式下，不传递预生成的知识卡片，全部采用实时 AI 生成
            const initResponse = await fetch(getApiUrl('/api/live-session'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'init',
                    script,
                    knowledgeCards: [] // 实时对话模式下不使用预生成知识卡片
                })
            });

            // Verify response is JSON
            const contentType = initResponse.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('实时练习服务返回了无效响应。请检查服务是否正常运行。');
            }

            // Read and verify the response JSON (only read once)
            try {
                const initData = await initResponse.json();
                if (!initResponse.ok) {
                    throw new Error(initData.error || 'Failed to initialize session');
                }
                if (!initData.success) {
                    throw new Error(initData.error || '会话初始化失败');
                }
            } catch (parseError: any) {
                if (parseError instanceof Error && parseError.message !== '会话初始化失败' && !parseError.message.includes('Failed to initialize')) {
                    throw new Error('无法解析服务器响应。请检查服务是否正常运行。');
                }
                throw parseError;
            }

            // Create EventSource for SSE
            const eventSource = new EventSource(`${getApiUrl('/api/live-session')}?sessionId=${sessionId}`);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'connected') {
                        console.log('Live session connected');
                        hasErrorRef.current = false; // Reset error flag on successful connection
                        setIsConnected(true);
                        
                        // Ensure AudioContext is ready for playback
                        if (!audioContextRef.current) {
                            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                        }
                        if (audioContextRef.current.state === 'suspended') {
                            audioContextRef.current.resume().then(() => {
                            }).catch(err => {
                                console.error('[useLiveSession] Failed to resume AudioContext:', err);
                            });
                        }
                        
                        onConnect?.();
                        
                        // Send queued audio chunks
                        while (audioQueueRef.current.length > 0) {
                            const chunk = audioQueueRef.current.shift();
                            if (chunk) {
                                sendAudioChunk(chunk.data);
                            }
                        }
                    } else if (data.type === 'audio') {
                        if (data.data) {
                            // Ensure AudioContext is ready
                            if (!audioContextRef.current) {
                                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                            }
                            playAudioChunk(data.data, data.mimeType);
                        }
                    } else if (data.type === 'knowledgeCard') {
                        // Handle knowledge card from AI
                        if (data.card && onKnowledgeCard) {
                            console.log('[LiveSession] Knowledge card received');
                            onKnowledgeCard(data.card);
                        } else {
                            console.warn('[useLiveSession] Knowledge card received but callback not available:', {
                                hasCard: !!data.card,
                                hasCallback: !!onKnowledgeCard
                            });
                        }
                    } else if (data.type === 'transcription') {
                        // Handle transcription (for LCD screen display)
                        if (data.source && data.text && onTranscription) {
                            onTranscription({
                                source: data.source,
                                text: data.text
                            });
                        }
                    } else if (data.type === 'error') {
                        if (!hasErrorRef.current) {
                            hasErrorRef.current = true;
                            console.error('SSE Error:', data.message);
                            setIsConnected(false);
                            onError?.(new Error(data.message));
                        }
                    } else if (data.type === 'ping') {
                        // Keep-alive ping, ignore
                    }
                } catch (e) {
                    console.error('Failed to parse SSE message:', e);
                }
            };

            eventSource.onerror = (error) => {
                // Prevent duplicate error callbacks
                if (hasErrorRef.current) {
                    return;
                }

                // Only trigger error if EventSource is closed (readyState === 2)
                // EventSource.readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
                if (eventSource.readyState === 2) {
                    hasErrorRef.current = true;
                    console.error('SSE Error', error);
                    const errorMessage = '实时会话连接失败，请检查网络连接或稍后重试。';
                    setIsConnected(false);
                    onError?.(new Error(errorMessage));
                    // Close the EventSource
                    eventSource.close();
                }
            };
        } catch (error: any) {
            console.error("Failed to connect:", error);
            const errorMessage = `无法创建实时会话连接：${error.message}`;
            onError?.(new Error(errorMessage));
        }
    }, [script, knowledgeCards, onConnect, onDisconnect, onError]);

    const sendAudioChunk = async (base64Data: string) => {
        if (!sessionIdRef.current) return;

        try {
            const response = await fetch(getApiUrl('/api/live-session'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionIdRef.current,
                    action: 'send',
                    audioData: base64Data
                })
            });

            if (!response.ok) {
                console.error('Failed to send audio chunk');
            }
        } catch (error) {
            console.error('Error sending audio chunk:', error);
        }
    };

    const startRecording = async () => {
        if (!audioContextRef.current) {
            // Use default sample rate for best playback quality (usually 44.1kHz or 48kHz)
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        } else if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        
        const ctx = audioContextRef.current;
        try {
            // Request 16kHz from microphone if possible
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                channelCount: 1,
                sampleRate: 16000
            } });
            streamRef.current = stream;

            const source = ctx.createMediaStreamSource(stream);
            // Buffer size 4096
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Downsample to 16kHz if context is running at higher rate
                let processData = inputData;
                const targetRate = 16000;
                
                if (ctx.sampleRate > targetRate) {
                    const ratio = Math.ceil(ctx.sampleRate / targetRate);
                    const newLength = Math.floor(inputData.length / ratio);
                    const downsampled = new Float32Array(newLength);
                    
                    for (let i = 0; i < newLength; i++) {
                        // Simple decimation with averaging to reduce aliasing
                        let sum = 0;
                        const offset = i * ratio;
                        const count = Math.min(ratio, inputData.length - offset);
                        for (let j = 0; j < count; j++) {
                            sum += inputData[offset + j];
                        }
                        downsampled[i] = sum / count;
                    }
                    processData = downsampled;
                }

                // Convert to PCM 16-bit
                const pcmData = floatTo16BitPCM(processData);
                const base64 = arrayBufferToBase64(pcmData.buffer as ArrayBuffer);

                if (isConnected) {
                    sendAudioChunk(base64);
                } else {
                    // Queue audio chunks if not connected yet
                    audioQueueRef.current.push({
                        data: base64,
                        timestamp: Date.now()
                    });
                }
            };

            source.connect(processor);
            processor.connect(ctx.destination); // ScriptProcessor needs connection to destination to work in some browsers
            setIsSpeaking(true);
        } catch (e) {
            console.error("Mic Error", e);
        }
    };

    const stopRecording = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        setIsSpeaking(false);
    };

    const disconnect = useCallback(async () => {
        stopRecording();
        
        // Close EventSource and remove all event listeners
        if (eventSourceRef.current) {
            // Remove event listeners by setting them to null
            eventSourceRef.current.onopen = null;
            eventSourceRef.current.onmessage = null;
            eventSourceRef.current.onerror = null;
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        // Disconnect session on server
        if (sessionIdRef.current) {
            try {
                await fetch(getApiUrl('/api/live-session'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionIdRef.current,
                        action: 'disconnect'
                    })
                });
            } catch (error) {
                console.error('Error disconnecting session:', error);
            }
            sessionIdRef.current = null;
        }

        // Clear audio queue
        audioQueueRef.current = [];

        // Reset audio timing
        nextStartTimeRef.current = 0;

        // Reset error flag
        hasErrorRef.current = false;

        // Close AudioContext
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(err => {
                console.warn('Error closing AudioContext:', err);
            });
            audioContextRef.current = null;
        }

        // Reset all states
        setIsConnected(false);
        setIsSpeaking(false);
        
        onDisconnect?.();
    }, [onDisconnect, onKnowledgeCard]);

    return {
        connect,
        disconnect,
        startRecording,
        stopRecording,
        isConnected,
        isSpeaking
    };
}
