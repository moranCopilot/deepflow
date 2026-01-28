# Vercel 部署故障排查指南

## HTTP 500 错误排查

### 1. 检查 Vercel 函数日志

在 Vercel Dashboard 中：
1. 进入项目 → Functions 标签
2. 查看最近的函数执行日志
3. 查找错误堆栈信息

### 2. 常见错误及解决方案

#### 错误：`Cannot find module './prompts/index.js'`
**原因**：prompts 目录未正确部署

**解决方案**：
- 确保 `api/prompts/` 目录存在
- 检查 `.vercelignore` 是否排除了 `api/` 目录
- 重新部署项目

#### 错误：`Server API Key not configured`
**原因**：环境变量未设置

**解决方案**：
1. 在 Vercel 项目设置中添加环境变量：
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
2. 重新部署项目

#### 现象：TTS 总是 fallback 到 Google
**原因**：ListenHub API Key 未生效，或 ListenHub 调用失败

**解决方案**：
1. 在 Vercel 项目设置中添加（Production 环境）：
   ```
   LISTENHUB_API_KEY=your_listenhub_api_key_here
   # 或 MARSWAVE_API_KEY=...
   ```
2. 重新部署后，在 Functions 日志里查看 `/api/tts` 的输出（会打印 `apiKeySource` 和 fallback 原因，不会打印 Key 值）
3. 如果日志里是 `fetch failed`，通常是网络/DNS/地域连通性问题；如果是 `401/403`，通常是 Key 无效或权限不足

#### 错误：`fetch failed` 或 `timeout`
**原因**：无法连接到 Google API

**解决方案**：
- 检查 API Key 是否有效
- 检查网络连接
- 查看 Vercel 函数日志获取详细错误

#### 错误：`Failed to parse JSON`
**原因**：请求体格式错误

**解决方案**：
- 检查前端是否正确发送请求
- 确认 Content-Type 头设置正确

### 3. 验证步骤

#### 步骤 1：检查健康检查端点
```bash
curl https://your-domain.vercel.app/api/health
```
应该返回：`{"status":"ok","message":"DeepFlow Server is running"}`

#### 步骤 2：检查文件结构
确保以下文件存在：
```
api/
  ├── health.ts
  ├── tts.ts
  ├── proxy-audio.ts
  ├── analyze.ts
  └── prompts/
      ├── index.ts
      ├── types.ts
      └── templates/
          ├── default.ts
          ├── quick_summary.ts
          ├── deep_analysis.ts
          ├── detailed_dialogue.ts
          └── interactive_practice.ts
```

#### 步骤 3：检查环境变量
在 Vercel Dashboard → Settings → Environment Variables 中确认：
- `GEMINI_API_KEY` 已设置
- 环境变量已应用到 Production 环境

### 4. 调试技巧

#### 添加详细日志
在 API 函数中添加 console.log：
```typescript
console.log('Request received:', {
  method: req.method,
  headers: req.headers,
  body: req.body
});
```

#### 测试本地环境
使用 Vercel CLI 本地测试：
```bash
npm install -g vercel
vercel dev
```

### 5. 联系支持

如果问题仍然存在，请提供：
1. Vercel 函数日志（完整错误堆栈）
2. 请求详情（URL、方法、headers）
3. 环境变量配置（隐藏敏感信息）
4. 重现步骤
