# 线上环境故障排查指南

## HTTP 404 错误排查

如果遇到 HTTP 404 错误，说明前端能够发送请求，但后端路由找不到。

### 1. 检查 API 路径配置

打开浏览器开发者工具（F12），查看 Console 标签页，应该能看到：
```
API URL: /api/analyze Current location: https://yourdomain.com/...
```

**检查点：**
- API URL 应该是 `/api/analyze`（相对路径）或完整的 URL
- 如果看到错误的路径，说明配置有问题

### 2. 检查后端服务状态

访问后端健康检查端点：
- 如果前后端同域名：`https://yourdomain.com/health`
- 如果前后端分离：`https://api.yourdomain.com/health`

应该返回：
```json
{"status":"ok","message":"DeepFlow Server is running"}
```

### 3. 检查后端路由配置

确保后端有以下路由：
- `POST /api/analyze` - 文件分析
- `POST /api/tts` - 文本转语音
- `GET /api/proxy-audio` - 音频代理
- `GET /health` - 健康检查

### 4. Nginx 反向代理配置

如果使用 Nginx，确保配置了正确的路径转发：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    location / {
        root /var/www/deepflow/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理 - 重要：确保路径匹配
    location /api {
        proxy_pass http://localhost:3000;  # 注意：不要加 /api
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**关键点：**
- `proxy_pass http://localhost:3000;` 后面**不要**加 `/api`
- Nginx 会自动将 `/api/analyze` 转发到 `http://localhost:3000/api/analyze`

### 5. 检查后端服务是否运行

```bash
# 检查后端进程
ps aux | grep node

# 检查端口是否监听
netstat -tuln | grep 3000
# 或
lsof -i :3000
```

### 6. 检查后端日志

查看后端服务的日志输出，应该能看到：
- 服务启动信息
- 请求日志
- 错误信息

### 7. 常见问题

#### 问题 1：前端部署在子路径下

如果前端部署在 `https://example.com/app/`，相对路径 `/api/analyze` 会变成 `https://example.com/app/api/analyze`。

**解决方案：**
- 方案 A：使用环境变量指定完整 API URL
  ```bash
  VITE_API_BASE_URL=https://api.example.com npm run build
  ```
- 方案 B：配置 Nginx 将 `/app/api` 也代理到后端

#### 问题 2：CORS 错误

如果看到 CORS 错误，检查后端 CORS 配置：
```typescript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true
}));
```

#### 问题 3：后端路由前缀不匹配

如果后端使用了路由前缀（如 `/v1/api/analyze`），需要更新前端配置或后端路由。

### 8. 测试步骤

1. **测试健康检查：**
   ```bash
   curl https://yourdomain.com/health
   ```

2. **测试 API 端点：**
   ```bash
   curl -X POST https://yourdomain.com/api/analyze \
     -F "files=@test.pdf" \
     -F "preferences={\"preset\":\"quick_summary\"}"
   ```

3. **检查浏览器 Network 标签：**
   - 打开开发者工具 → Network 标签
   - 触发文件上传
   - 查看请求的 URL、状态码、响应内容

### 9. 获取帮助

如果以上步骤都无法解决问题，请提供：
1. 浏览器 Console 的完整错误信息
2. Network 标签中请求的详细信息（URL、状态码、响应）
3. 后端服务的日志输出
4. Nginx 配置（如果使用）
5. 部署架构说明（前后端是否同域名）

