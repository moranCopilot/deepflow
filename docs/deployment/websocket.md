# Live Practice 实时对话功能

## ✅ 已实现：HTTP + SSE 混合模式

已实现基于 HTTP + Server-Sent Events (SSE) 的替代方案，**无需单独部署 WebSocket 服务器**，可直接在 Vercel 上运行。

## 工作原理

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Browser)                            │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │ HTTP POST       │              │ EventSource (SSE)       │   │
│  │ 发送音频数据    │              │ 接收音频响应            │   │
│  └────────┬────────┘              └───────────▲─────────────┘   │
└───────────┼────────────────────────────────────┼─────────────────┘
            │                                    │
            ▼                                    │
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Serverless Function                    │
│                      /api/live-session                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Session Manager                        │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │    │
│  │  │ Audio Queue │◄───│ HTTP POST   │    │ SSE Stream  │──┼────┘
│  │  └──────┬──────┘    └─────────────┘    └──────▲──────┘  │
│  │         │                                      │         │
│  │         ▼                                      │         │
│  │  ┌─────────────────────────────────────────────┐        │
│  │  │          WebSocket to Gemini API            │        │
│  │  └─────────────────────────────────────────────┘        │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

1. **前端 → 后端**：HTTP POST 发送音频数据（`/api/live-session`）
2. **后端 → 前端**：SSE 流式返回音频响应
3. **后端内部**：WebSocket 连接到 Gemini Live API

## 使用方式

### 1. 初始化会话

```typescript
POST /api/live-session
{
  "sessionId": "unique_session_id",
  "action": "init",
  "script": "对话上下文...",
  "knowledgeCards": [...]
}
```

### 2. 建立 SSE 连接

```typescript
const eventSource = new EventSource('/api/live-session?sessionId=xxx');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'audio') {
    playAudioChunk(data.data);
  }
};
```

### 3. 发送音频数据

```typescript
POST /api/live-session
{
  "sessionId": "xxx",
  "action": "send",
  "audioData": "base64_encoded_pcm_audio"
}
```

### 4. 断开连接

```typescript
POST /api/live-session
{
  "sessionId": "xxx",
  "action": "disconnect"
}
```

## 部署配置

### Vercel 环境变量

确保设置以下环境变量：

```
GEMINI_API_KEY=your_api_key_here
```

### vercel.json 配置

```json
{
  "functions": {
    "api/live-session.ts": {
      "maxDuration": 60
    }
  }
}
```

## 注意事项

### Vercel 限制

1. **函数执行时间**：Hobby 计划最长 10 秒，Pro 计划最长 60 秒
2. **SSE 连接**：会在函数超时后断开
3. **内存状态**：Serverless 函数无状态，会话数据在函数重启后丢失

### 建议

- 对于长时间对话，建议升级到 Pro 计划
- 或使用 Railway/Render 部署完整的 WebSocket 服务器
- 生产环境建议使用 Redis 存储会话状态

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 相关文件

- `api/live-session.ts` - HTTP + SSE 服务端实现
- `src/hooks/useLiveSession.ts` - 前端 Hook
- `src/utils/api-config.ts` - API 配置

## 备选方案

如果 HTTP + SSE 方案不满足需求，可以考虑：

1. **Railway 部署**：支持完整的 WebSocket
2. **Render 部署**：支持 WebSocket
3. **Pusher/Ably**：第三方实时通信服务

