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

            if (!initResponse.ok) {
                const errorData = await initResponse.json();
                throw new Error(errorData.error || 'Failed to initialize session');
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
                        console.error('SSE Error:', data.message);
                        onError?.(new Error(data.message));
                    } else if (data.type === 'ping') {
                        // Keep-alive ping, ignore
                    }
                } catch (e) {
                    console.error('Failed to parse SSE message:', e);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE Error', error);
                const errorMessage = '实时会话连接失败，请检查网络连接或稍后重试。';
                onError?.(new Error(errorMessage));
                setIsConnected(false);
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
