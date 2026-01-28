# DeepFlow (深度心流)

> 听见你的专注力 | 青少年首款"离线伴学"AI音频学习平台

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 项目概览

DeepFlow 是一款面向青少年的 AI 驱动学习平台，核心理念是**反手机（Anti-Phone）& AI原生（AI Native）**。

- **手机是"补给站"**：负责数据吞吐、视觉整理
- **耳机和打印机是"战场"**：负责执行、沉浸、输出

### 核心功能

- **Pack My Bag**：一键上传学习材料，AI 自动生成音频内容
- **Go Flow**：沉浸式学习模式，支持音频播放和实时对话
- **知识卡片**：自动提取关键知识点，支持打印机输出
- **场景系统**：通勤、专注、睡前等多种学习场景
- **森林养成**：游戏化激励机制，可视化学习成长

## 技术栈

- **前端**：React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- **后端**：Node.js + Express / Vercel Serverless
- **AI 服务**：Google Gemini API（内容分析、实时对话）
- **TTS**：ListenHub API / Google TTS

## 文档

### 产品文档
- [产品介绍](docs/product/introduction.md) - 完整产品功能说明
- [产品需求文档](docs/product/prd.md) - 产品需求与规划

### 部署文档
- [部署指南](docs/deployment/overview.md) - 通用部署说明
- [Vercel 部署](docs/deployment/vercel.md) - Vercel 平台部署
- [WebSocket 部署](docs/deployment/websocket.md) - 实时对话功能部署

### 故障排查
- [Vercel 故障排查](docs/troubleshooting/vercel.md) - Vercel 部署问题
- [网络故障排查](docs/troubleshooting/network.md) - 网络连接问题

## 开发

```bash
# 类型检查
npx tsc -b

# 代码检查
npm run lint

# 本地开发 API（Vercel CLI）
vercel dev
```

## AI Agent 指南

如果你是 AI Agent（如 Claude、WARP），请查看 [AGENTS.md](AGENTS.md) 了解项目架构和开发规范。
