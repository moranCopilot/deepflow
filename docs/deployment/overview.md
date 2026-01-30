# 部署指南

## 前端部署配置

### 环境变量配置

前端会自动检测环境并配置 API 地址：

- **开发环境**：默认使用 `http://localhost:3000`
- **生产环境**：默认使用相对路径（与前端同域名）

### 自定义 API 地址

如果需要指定后端 API 地址，可以设置环境变量：

```bash
# .env 文件（开发环境）
VITE_API_BASE_URL=http://localhost:3000

# 生产环境（构建时设置）
VITE_API_BASE_URL=https://api.yourdomain.com
```

### 部署选项

#### 选项 1：前后端同域名（推荐）

如果前后端部署在同一个域名下（例如使用 Nginx 反向代理），不需要设置任何环境变量，前端会自动使用相对路径。

**Nginx 配置示例：**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    location / {
        root /var/www/deepflow/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
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

#### 选项 2：前后端分离部署

如果前后端部署在不同域名，需要设置环境变量：

```bash
# 构建时设置
VITE_API_BASE_URL=https://api.yourdomain.com
```

然后构建：
```bash
npm run build
```

## 后端部署配置

### 环境变量

后端需要配置以下环境变量（在 `server/.env.local` 或部署平台的环境变量中）：

```bash
# Gemini API Key
GEMINI_API_KEY=your_api_key_here

# 服务器端口（可选，默认 3000）
PORT=3000

# 代理配置（如果需要）
HTTP_PROXY=http://127.0.0.1:7897
HTTPS_PROXY=http://127.0.0.1:7897
```

### CORS 配置

如果前后端分离部署，需要确保后端 CORS 配置允许前端域名访问。当前代码已配置为允许所有来源（`app.use(cors())`），生产环境建议限制为特定域名。

## 构建和部署步骤

### 前端

```bash
# 安装依赖
npm install

# 开发环境运行
npm run dev

# 生产环境构建
npm run build

# 构建产物在 dist/ 目录
```

### 后端

```bash
cd server

# 安装依赖
npm install

# 开发环境运行
npm run dev

# 生产环境构建
npm run build

# 生产环境运行
npm start
```

## 常见问题

### 1. 线上环境无法连接到后端

**原因**：前端仍在使用 `localhost:3000`

**解决方案**：
- 确保前后端部署在同一域名下（推荐）
- 或设置 `VITE_API_BASE_URL` 环境变量指向正确的后端地址

### 2. WebSocket 连接失败

**原因**：WebSocket URL 配置不正确

**解决方案**：
- 如果前后端同域名，确保 Nginx 配置了 WebSocket 代理
- 如果分离部署，设置 `VITE_WS_URL` 环境变量

### 3. CORS 错误

**原因**：后端 CORS 配置不允许前端域名

**解决方案**：
- 修改后端 CORS 配置，添加前端域名到允许列表

