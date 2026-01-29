/**
 * [INPUT]: 依赖 {Gemini API} 的 {内容生成能力}
 * [OUTPUT]: 提供 {UGC逐字稿JSON文件}
 * [POS]: scripts 的 {UGC内容生成器}
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root and server directory
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, 'server/.env.local') });

/* ========== 类型定义 ========== */

interface KnowledgeCard {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

interface ScriptItem {
  speaker: string;
  text: string;
}

interface ContentCategory {
  main: string;
  aux: string[];
}

interface UGCItem {
  id: string;
  title: string;
  duration: string;
  type: string;
  scene: string;
  audioUrl: string;
  script: ScriptItem[] | null;
  scriptUrl?: string;
  knowledgeCardsCount?: number;
  contentCategory?: ContentCategory;
  mode?: string;
}

interface UGCFlowList {
  id: string;
  title: string;
  description: string;
  tags: string[];
  items: UGCItem[];
}

interface CommunityContent {
  ugc: UGCFlowList[];
}

interface GeneratedScript {
  itemId: string;
  title: string;
  mode: string;
  script: ScriptItem[];
  knowledgeCards: KnowledgeCard[];
  contentCategory: ContentCategory;
  metadata: {
    duration: string;
    wordCount: number;
    createdAt: string;
    source: string;
  };
}

/* ========== 配置 ========== */

// 深度剖析 Item ID 列表（每个 flowlist 选一个）
const DEEP_ANALYSIS_ITEMS = new Set([
  'ugc-1-item-3',  // 三角形相似判定与比例线段
  'ugc-2-item-3',  // 串并联电路与电流电压关系
  'ugc-3-item-2',  // 化学方程式配平的三种常用方法
  'ugc-4-item-2',  // 导数在单调性与极值中的经典用法
  'ugc-5-item-1',  // 教育公平与成长故事：高分立意拆解
  'ugc-6-item-3',  // 完形填空中易混近义词辨析
  'ugc-7-item-1',  // 中国近代史重要事件时间轴
  'ugc-8-item-2',  // 化学计算题比例与守恒思路
]);

/* ========== Prompt 模板 ========== */

function buildQuickSummaryPrompt(item: UGCItem, parent: UGCFlowList): string {
  return `你是一位专业、干练的新闻播音员，擅长用最通俗易懂的语言向中国中学生受众传达核心知识。

【任务主题】
标题：${item.title}
标签：${parent.tags.join(', ')}
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
输出纯 JSON 格式（不要 markdown），结构如下：
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
- speaker 必须是 "AI主播"
- 禁止LaTeX，公式用中文表达（如"角ABC"、"根号2"）
- 输出纯JSON，无 markdown 标记`;
}

function buildDeepAnalysisPrompt(item: UGCItem, parent: UGCFlowList): string {
  return `你正在录制一档深度的双人播客节目，面向中国中学生。

【角色设定】
- 角色A（老师）：知识渊博、循循善诱，负责引导话题、设问、对难点进行深度拆解
- 角色B（学生）：好奇心强，思维活跃，代表听众视角，在难点处提出困惑

【任务主题】
标题：${item.title}
标签：${parent.tags.join(', ')}
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
输出纯 JSON 格式（不要 markdown），结构如下：
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
- speaker 必须是 "老师" 或 "学生"
- 深度剖析，不能泛泛而谈
- 禁止LaTeX，公式用中文表达（如"角ABC"、"根号2"）
- 输出纯JSON，无 markdown 标记`;
}

/* ========== 工具函数 ========== */

function extractJson(text: string): any {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 尝试提取 JSON 块
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse extracted JSON:', e.message);
    }
  }

  throw new Error('无法从响应中提取有效 JSON');
}

function calculateDuration(script: ScriptItem[]): string {
  // 估算字数，按每分钟 180 字计算
  const totalChars = script.reduce((sum, item) => sum + item.text.length, 0);
  const minutes = Math.ceil(totalChars / 180);
  return `${minutes.toString().padStart(2, '0')}:00`;
}

function generateKnowledgeCardId(itemId: string, index: number): string {
  return `kc-${itemId}-${index + 1}`;
}

/* ========== 主流程 ========== */

async function generateScriptForItem(
  item: UGCItem,
  parent: UGCFlowList,
  genAI: GoogleGenerativeAI
): Promise<GeneratedScript> {
  const isDeepAnalysis = DEEP_ANALYSIS_ITEMS.has(item.id);
  const mode = isDeepAnalysis ? 'deep_analysis' : 'quick_summary';
  const prompt = isDeepAnalysis
    ? buildDeepAnalysisPrompt(item, parent)
    : buildQuickSummaryPrompt(item, parent);

  console.log(`\n[${item.id}] 生成${isDeepAnalysis ? '深度剖析' : '速听精华'}脚本: ${item.title}`);

  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const data = extractJson(responseText);

  // 验证响应结构
  if (!data.podcastScript || !Array.isArray(data.podcastScript)) {
    throw new Error('响应缺少 podcastScript 数组');
  }
  if (!data.knowledgeCards || !Array.isArray(data.knowledgeCards)) {
    throw new Error('响应缺少 knowledgeCards 数组');
  }
  if (!data.contentCategory) {
    throw new Error('响应缺少 contentCategory');
  }

  // 构建结果
  const script: GeneratedScript = {
    itemId: item.id,
    title: data.title || item.title,
    mode,
    script: data.podcastScript,
    knowledgeCards: data.knowledgeCards.map((card: any, idx: number) => ({
      id: generateKnowledgeCardId(item.id, idx),
      title: card.title,
      content: card.content,
      tags: card.tags || []
    })),
    contentCategory: data.contentCategory,
    metadata: {
      duration: calculateDuration(data.podcastScript),
      wordCount: data.podcastScript.reduce((sum: number, s: ScriptItem) => sum + s.text.length, 0),
      createdAt: new Date().toISOString(),
      source: 'generated'
    }
  };

  console.log(`  ✓ 脚本字数: ${script.metadata.wordCount}`);
  console.log(`  ✓ 知识小票: ${script.knowledgeCards.length}个`);

  return script;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VUE_APP_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY 未配置');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // 读取 community-content.json
  const contentPath = path.join(projectRoot, 'public/data/community-content.json');
  const content: CommunityContent = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

  // 创建输出目录
  const scriptsDir = path.join(projectRoot, 'public/data/scripts/ugc');
  fs.mkdirSync(scriptsDir, { recursive: true });

  console.log('========================================');
  console.log('UGC 脚本生成 - 第一阶段：文本生成');
  console.log('========================================');
  console.log(`总计: ${content.ugc.length} 个系列, ${content.ugc.reduce((sum, f) => sum + f.items.length, 0)} �� item`);
  console.log(`深度剖析: ${DEEP_ANALYSIS_ITEMS.size} 个`);
  console.log(`速听精华: ${content.ugc.reduce((sum, f) => sum + f.items.length, 0) - DEEP_ANALYSIS_ITEMS.size} 个`);
  console.log('========================================');

  const errors: { itemId: string; error: string }[] = [];
  let completedCount = 0;
  let totalCount = 0;

  // 遍历所有 UGC flowlist
  for (const flowlist of content.ugc) {
    console.log(`\n📚 系列: ${flowlist.title}`);

    for (const item of flowlist.items) {
      totalCount++;

      try {
        // 生成脚本
        const script = await generateScriptForItem(item, flowlist, genAI);

        // 保存逐字稿 JSON
        const scriptPath = path.join(scriptsDir, `${item.id}.json`);
        fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf-8');

        // 更新 item 字段
        item.scriptUrl = `/data/scripts/ugc/${item.id}.json`;
        item.knowledgeCardsCount = script.knowledgeCards.length;
        item.contentCategory = script.contentCategory;
        item.mode = script.mode;
        item.duration = script.metadata.duration;

        completedCount++;
        console.log(`  ✅ [${completedCount}/${totalCount}] 已保存: ${item.id}.json`);

        // 添加延迟避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        const errorMsg = error.message || String(error);
        errors.push({ itemId: item.id, error: errorMsg });
        console.error(`  ❌ [${totalCount}] 失败: ${item.id} - ${errorMsg}`);
      }
    }
  }

  // 写回 community-content.json
  fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf-8');
  console.log('\n✅ 已更新 community-content.json');

  // 生成报告
  console.log('\n========================================');
  console.log('生成完成');
  console.log('========================================');
  console.log(`成功: ${completedCount}/${totalCount}`);
  console.log(`失败: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ 失败列表:');
    errors.forEach(({ itemId, error }) => {
      console.log(`  - ${itemId}: ${error}`);
    });
  }

  // 保存生成报告
  const reportPath = path.join(projectRoot, 'scripts/generation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    completed: completedCount,
    total: totalCount,
    errors,
    deepAnalysisItems: Array.from(DEEP_ANALYSIS_ITEMS)
  }, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
