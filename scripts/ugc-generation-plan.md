# UGC内容音频生成实施计划（��善版）

## 概述

为 `community-content.json` 中所有 8 个 UGC 内容（共 24 个 item）生成：
1. **速听精华音频**（5分钟，单人主播）- 16个
2. **深度剖析音频**（20分钟，双人对话）- 每个flowlist 1个，共8个
3. **逐字稿 script**（单独存储为 JSON 文件）
4. **知识小票 knowledgeCards**（AI 生成的核心知识点卡片）

---

## 一、模式分配：速听精华 vs 深度剖析

### 选择原则
- **深度剖析**：选择每个flowlist中最具深度、考点密集、需要深度理解的item
- **速听精华**：适合快速记忆、概念性内容

### 分配方案

| FlowList | 系列标题 | 深度剖析Item | 速听精华Items |
|----------|----------|--------------|---------------|
| ugc-1 | 初中数学：必考函数与几何基础 | **ugc-1-item-3** 三角形相似判定与比例线段 | item-1, item-2 |
| ugc-2 | 初中物理：力学与电学核心考点 | **ugc-2-item-3** 串并联电路与电流电压关系 | item-1, item-2 |
| ugc-3 | 初中化学：方程式与基本实验安全 | **ugc-3-item-2** 化学方程式配平的三种常用方法 | item-1, item-3 |
| ugc-4 | 高中数学：函数、导数与不等式 | **ugc-4-item-2** 导数在单调性与极值中的经典用法 | item-1, item-3 |
| ugc-5 | 高中语文：作文素材与名篇精读 | **ugc-5-item-1** 教育公平与成长故事：高分立意拆解 | item-2, item-3 |
| ugc-6 | 高中英语：完形与阅读高频词汇 | **ugc-6-item-3** 完形填空中易混近义词辨析 | item-1, item-2 |
| ugc-7 | 中考总复习：政治与历史主干线 | **ugc-7-item-1** 中国近代史重要事件时间轴 | item-2, item-3 |
| ugc-8 | 高考冲刺：理综错题回顾与心态调整 | **ugc-8-item-2** 化学计算题比例与守恒思路 | item-1, item-3 |

---

## 二、Prompt 设计（基于标题生成）

### 2.1 速听精华 Prompt 模板

```typescript
const quickSummaryPrompt = `你是一位专业、干练的新闻播音员，擅长用最通俗易懂的语言向中国中学生受众传达核心知识。

【任务主题】
标题：${item.title}
标签：${item.tags.join(', ')}
类型：${item.type}
场景：${item.scene}
所属系列：${parent.title} - ${parent.description}

【任务要求】
生成一份约5分钟（800-1000字）的"速听精华"音频脚本。

【内容要求】
1. **紧扣中国中学生考试需求**：
   - 聚焦中考/高考真题中的高频考点
   - 提炼课本上的定义、公式、核心结论
   - 避免泛泛而谈，每句话都要有"干货"

2. **结构安排**：
   - **开篇（30秒）**：一句话概括主题，点明这是中考/高考的必考知识点
   - **核心展开（4分钟）**：讲解3-5个核心点，每个点遵循"概念定义 → 考查方式 → 记忆口诀"的结构
   - **总结（30秒）**：快速回顾本期"星标"重点

3. **语气风格**：
   - 新闻播报风格，清晰、流畅、节奏感强
   - 使用"这里请大家画个重点"、"考试常考"、"记住"等强调词

4. **知识小票要求**：
   - 3-5个卡片，每个对应一个考点
   - 内容包含：定义/公式 + 考查方式 + 记忆技巧

【输出格式】
{
  "title": "文档标题",
  "summary": "一句话概括本期速听精华的核心内容",
  "contentCategory": {
    "main": "数学",
    "aux": ["函数", "初中"]
  },
  "knowledgeCards": [
    {
      "title": "核心考点",
      "content": "定义+考查方式+记忆技巧",
      "tags": ["重点", "星标"]
    }
  ],
  "podcastScript": [
    {"speaker": "AI主播", "text": "..."}
  ]
}

CRITICAL:
- 脚本800-1000字
- 禁止LaTeX，公式用中文表达
- 输出纯JSON，无markdown`;
```

### 2.2 深度剖析 Prompt 模板

```typescript
const deepAnalysisPrompt = `你正在录制一档深度的双人播客节目，面向中国中学生。

【角色设定】
- 角色A（老师）：知识渊博、循循善诱，负责引导话题、设问、对难点进行深度拆解
- 角色B（学生）：好奇心强，思维活跃，代表听众视角，在难点处提出困惑

【任务主题】
标题：${item.title}
标签：${item.tags.join(', ')}
类型：${item.type}
场景：${item.scene}
所属系列：${parent.title} - ${parent.description}

【任务要求】
生成一份约20分钟（3000-4000字）的"深度剖析"双人对话脚本。

【内容要求】
1. **紧扣中国中学生真实需求**：
   - 深入讲解中考/高考中的易错点、难点
   - 结合典型真题/模拟题进行剖析
   - 讲清"为什么"、"怎么做"、"怎么避坑"

2. **结构逻辑（总-分-总）**：
   - **总（开篇2分钟）**：概述本知识点在考试中的地位、常见考查形式
   - **分（核心16分钟）**：
     * 拆解核心概念的本质
     * 讲解典型例题的解题思路
     * 学生提问常见困惑，老师逐一解答
     * 强调易错点和解题技巧
   - **总（回顾2分钟）**：总结核心要点，形成知识网络

3. **对话形式**：
   - A抛出问题/话题 → B尝试回答 → A补充/修正/拓展
   - 避免枯燥说教，要像聊天一样自然
   - 老师多用"你想想看"、"很多同学会犯这样的错误"等互动语言

4. **知识小票要求**：
   - 5-8个卡片，覆盖深度知识点
   - 内容包含：原理详解 + 典型题型 + 易错提醒

【输出格式】
{
  "title": "文档标题",
  "summary": "本期深度剖析的核心内容概览",
  "contentCategory": {
    "main": "数学",
    "aux": ["几何", "相似"]
  },
  "knowledgeCards": [
    {
      "title": "深度知识点",
      "content": "原理详解+典型题型+易错提醒",
      "tags": ["深度", "考点"]
    }
  ],
  "podcastScript": [
    {"speaker": "老师", "text": "..."},
    {"speaker": "学生", "text": "..."}
  ]
}

CRITICAL:
- 脚本3000-4000字
- 双人对话形式
- 深度剖析，不能泛泛而谈
- 禁止LaTeX，公式用中文表达
- 输出纯JSON，无markdown`;
```

---

## 三、执行计划：两阶段

### 第一阶段：文本生成（脚本+知识小票）

#### 执行文件
`/scripts/generate-ugc-scripts.ts`（新建）

#### 执行流程
```
1. 读取 community-content.json
2. 创建目录 public/data/scripts/ugc/
3. 遍历8个UGC flowlist，24个item
4. 对每个item：
   a. 根据分配方案选择 prompt 模板（速听/深度）
   b. 构造 Gemini API 请求
   c. 获取响应并验证
   d. 保存逐字稿 JSON：public/data/scripts/ugc/{itemId}.json
   e. 更新 item 字段（scriptUrl, knowledgeCardsCount, contentCategory）
5. 写回 community-content.json
6. 生成预览报告供用户确认
```

#### 输出文件
- `/public/data/scripts/ugc/*.json` - 24个逐字稿文件
- `/public/data/community-content.json` - 更新后的配置
- `/scripts/generation-report.md` - 生成报告预览

#### 验证点
- [ ] 24个逐字稿JSON文件存在
- [ ] 每个文件包含完整的 script、knowledgeCards、contentCategory
- [ ] 深度剖析脚本字数 3000+
- [ ] 速听精华脚本字数 800-1000
- [ ] 内容紧扣中学生考试需求

---

### 第二阶段：音频生成（用户确认后）

#### 执行文件
`/scripts/generate-ugc-audio.ts`（新建）

#### 前置条件
- 用户已确认第一阶段生成的文本内容质量
- ListenHub API Key 已配置

#### 执行流程
```
1. 读取已更新的 community-content.json
2. 创建音频目录：public/assets/audio/ugc-{id}/
3. 遍历24个item：
   a. 读取对应的 script JSON
   b. 调用 ListenHub API 生成音频
   c. 下载音频到指定目录
   d. 更新 item.audioUrl
4. 写回 community-content.json
```

#### 输出文件
- `/public/assets/audio/ugc-{id}/*.mp3` - 24个音频文件
- `/public/data/community-content.json` - 最终配置

---

## 四、数据结构

### 逐字稿文件格式
```json
{
  "itemId": "ugc-1-item-1",
  "title": "一次函数基础概念与图像特征",
  "mode": "quick_summary",  // 新增：quick_summary | deep_analysis
  "script": [
    {"speaker": "AI主播", "text": "欢迎来到今天的速听精华..."}
  ],
  "knowledgeCards": [
    {
      "id": "kc-ugc-1-1-1",
      "title": "一次函数定义",
      "content": "形如 y=kx+b（k≠0）的函数叫做一次函数...",
      "tags": ["重点", "星标"]
    }
  ],
  "contentCategory": {
    "main": "数学",
    "aux": ["函数", "初中"]
  },
  "metadata": {
    "duration": "05:00",
    "wordCount": 950,
    "createdAt": "2024-01-01T00:00:00Z",
    "source": "generated"
  }
}
```

### 主JSON更新字段
```typescript
interface UGCItem {
  id: string;
  title: string;
  duration: string;
  type: string;
  scene: string;
  audioUrl: string;           // 第二阶段更新
  scriptUrl: string;          // 第一阶段更新 ✅
  knowledgeCardsCount: number; // 第一阶段更新 ✅
  contentCategory: {          // 第一阶段更新 ✅
    main: string;
    aux: string[];
  };
  mode?: string;              // 第一阶段新增 ✅
}
```

---

## 五、执行命令

### 第一阶段：文本生成
```bash
cd /Users/leozhou/Documents/Vibe\ Coding/deepflow
tsx scripts/generate-ugc-scripts.ts
```

### 第二阶段：音频生成（用户确认后）
```bash
tsx scripts/generate-ugc-audio.ts
```

---

## 六、质量保证

### 文本质量检查清单
- [ ] 标题与内容一致（扣题）
- [ ] 针对中国中学生考试需求
- [ ] 包含具体的考点/知识点
- [ ] 语言通俗易懂，避免空洞
- [ ] 知识小票有实际价值

### 深度剖析额外检查
- [ ] 双人对话自然流畅
- [ ] 有典型例题/真题解析
- [ ] 讲清易错点和解题技巧
- [ ] 字数达到3000+
