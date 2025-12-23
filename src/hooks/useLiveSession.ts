import { useState, useRef, useCallback } from 'react';
import { floatTo16BitPCM, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/audio-utils';
import { getApiUrl } from '../utils/api-config';

export function useLiveSession(
    script: string, 
    knowledgeCards: any[],
    onConnect?: () => void,
    onDisconnect?: () => void,
    onError?: (error: any) => void
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

    const playAudioChunk = (base64Data: string) => {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        const float32Data = new Float32Array(arrayBuffer.byteLength / 2);
        const dataView = new DataView(arrayBuffer);

        for (let i = 0; i < float32Data.length; i++) {
            const int16 = dataView.getInt16(i * 2, true); // Little endian
            float32Data[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
        }

        // Gemini 2.0 Flash Exp output is typically 24kHz
        const buffer = ctx.createBuffer(1, float32Data.length, 24000); 
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
    };

    const connect = useCallback(async () => {
        try {
            // Validate script before proceeding
            if (!script || script.trim().length === 0) {
                throw new Error('脚本内容不能为空。请确保已选择包含脚本内容的学习材料。');
            }

            // Reset error flag
            hasErrorRef.current = false;

            // Close existing EventSource connection if any
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }

            // Generate unique session ID
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionIdRef.current = sessionId;

            // Initialize session
            const initResponse = await fetch(getApiUrl('/api/live-session'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    action: 'init',
                    script,
                    knowledgeCards
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
                console.log('SSE Connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'connected') {
                        console.log('Live session connected');
                        hasErrorRef.current = false; // Reset error flag on successful connection
                        setIsConnected(true);
                        onConnect?.();
                        
                        // Send queued audio chunks
                        while (audioQueueRef.current.length > 0) {
                            const chunk = audioQueueRef.current.shift();
                            if (chunk) {
                                sendAudioChunk(chunk.data);
                            }
                        }
                    } else if (data.type === 'audio') {
                        playAudioChunk(data.data);
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
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        } else if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        
        const ctx = audioContextRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                channelCount: 1,
                sampleRate: 16000
            } });
            streamRef.current = stream;

            const source = ctx.createMediaStreamSource(stream);
            // Buffer size 4096 gives ~0.25s latency at 16k
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert to PCM 16-bit
                const pcmData = floatTo16BitPCM(inputData);
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
        
        // Close EventSource
        if (eventSourceRef.current) {
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

        // Don't close AudioContext immediately as it might cut off playback, 
        // but for "End Session" it's fine.
        audioContextRef.current?.close();
        audioContextRef.current = null;
        setIsConnected(false);
        onDisconnect?.();
    }, [onDisconnect]);

    return {
        connect,
        disconnect,
        startRecording,
        stopRecording,
        isConnected,
        isSpeaking
    };
}
