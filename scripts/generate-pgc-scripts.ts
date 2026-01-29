/**
 * [INPUT]: 依赖 {Gemini API} 的 {内容生成能力}
 * [OUTPUT]: 提供 {PGC逐字稿JSON文件}
 * [POS]: scripts 的 {PGC内容生成器}
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

interface PGCItem {
  id: string;
  title: string;
  mode: string;
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

/* ========== PGC 内容配置 ========== */

const PGC_CONTENT = [
  {
    id: 'pgc-1',
    title: '数理化加油站：初中核心考点',
    description: '覆盖数学、物理、化学三大理科的中考高频考点，用听的方式帮你吃透概念与题型。',
    tags: ['数理化', '初中', '中考'],
    scene: 'focus',
    items: [
      { id: 'pgc-1-item-1', title: '一次函数与二次函数：图像与性质对比', mode: 'quick_summary' },
      { id: 'pgc-1-item-2', title: '力学三大定律：从受力分析到运动状态', mode: 'quick_summary' },
      { id: 'pgc-1-item-3', title: '化学方程式配平与质量守恒定律', mode: 'deep_analysis' }
    ]
  },
  {
    id: 'pgc-2',
    title: '学习力提升：方法指导与语文素养',
    description: '涵盖高效学习法、时间管理技巧，以及古诗文阅读与作文写作的核心能力。',
    tags: ['学习方法', '语文', '素养'],
    scene: 'home_charge',
    items: [
      { id: 'pgc-2-item-1', title: '番茄工作法与专注力训练', mode: 'quick_summary' },
      { id: 'pgc-2-item-2', title: '艾宾浩斯遗忘曲线与科学复习', mode: 'quick_summary' },
      { id: 'pgc-2-item-3', title: '古诗文作文素材：家国情怀主题', mode: 'deep_analysis' }
    ]
  },
  {
    id: 'pgc-3',
    title: '考前加油站：应试技巧与心态调适',
    description: '专为考前冲刺设计，包含答题策略、时间分配和心态调整三大核心能力。',
    tags: ['备考', '心态', '应试'],
    scene: 'qa_memory',
    items: [
      { id: 'pgc-3-item-1', title: '考场时间分配策略与答题顺序', mode: 'quick_summary' },
      { id: 'pgc-3-item-2', title: '常见考试失误与避坑指南', mode: 'quick_summary' },
      { id: 'pgc-3-item-3', title: '考试焦虑自救与积极心态建立', mode: 'deep_analysis' }
    ]
  }
];

/* ========== Prompt 模板 ========== */

function buildQuickSummaryPrompt(item: PGCItem, parent: typeof PGC_CONTENT[0]): string {
  return `你是一位温暖、专业的女教师，擅长用最通俗易懂的语言向中国中学生受众传达核心知识。

【任务主题】
标题：${item.title}
标签：${parent.tags.join(', ')}
场景：${parent.scene}
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
   - 温暖女教师风格，清晰、流畅、亲切自然
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
    {"speaker": "女老师", "text": "..."}
  ]
}

CRITICAL:
- 脚本800-1000字
- speaker 必须是 "女老师"
- 禁止LaTeX，公式用中文表达（如"角ABC"、"根号2"）
- 输出纯JSON，无 markdown 标记`;
}

function buildDeepAnalysisPrompt(item: PGCItem, parent: typeof PGC_CONTENT[0]): string {
  return `你正在录制一档深度的双人播客节目，面向中国中学生。

【角色设定】
- 角色A（女老师）：知识渊博、循循善诱，负责引导话题、设问、对难点进行深度拆解
- 角色B（学生）：好奇心强，思维活跃，代表听众视角，在难点处提出困惑

【任务主题】
标题：${item.title}
标签：${parent.tags.join(', ')}
场景：${parent.scene}
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
    {"speaker": "女老师", "text": "..."},
    {"speaker": "学生", "text": "..."}
  ]
}

CRITICAL:
- 脚本3000-4000字
- speaker 必须是 "女老师" 或 "学生"
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
  const totalChars = script.reduce((sum, item) => sum + item.text.length, 0);
  const minutes = Math.ceil(totalChars / 180);
  return `${minutes.toString().padStart(2, '0')}:00`;
}

function generateKnowledgeCardId(itemId: string, index: number): string {
  return `kc-${itemId}-${index + 1}`;
}

/* ========== 主流程 ========== */

async function generateScriptForItem(
  item: PGCItem,
  parent: typeof PGC_CONTENT[0],
  genAI: GoogleGenerativeAI
): Promise<GeneratedScript> {
  const isDeepAnalysis = item.mode === 'deep_analysis';
  const prompt = isDeepAnalysis
    ? buildDeepAnalysisPrompt(item, parent)
    : buildQuickSummaryPrompt(item, parent);

  console.log(`\n[${item.id}] 生成${isDeepAnalysis ? '深度剖析' : '速听精华'}脚本: ${item.title}`);

  // 使用 gemini-2.5-pro (或可用的模型)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

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
    mode: item.mode,
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

  // 创建输出目录
  const scriptsDir = path.join(projectRoot, 'public/data/scripts/pgc');
  fs.mkdirSync(scriptsDir, { recursive: true });

  console.log('========================================');
  console.log('PGC 脚本生成 - 第一阶段：文本生成');
  console.log('========================================');
  const totalItems = PGC_CONTENT.reduce((sum, f) => sum + f.items.length, 0);
  const deepAnalysisCount = PGC_CONTENT.reduce((sum, f) =>
    sum + f.items.filter(i => i.mode === 'deep_analysis').length, 0);
  console.log(`总计: ${PGC_CONTENT.length} 个系列, ${totalItems} 个 item`);
  console.log(`深度剖析: ${deepAnalysisCount} 个`);
  console.log(`速听精华: ${totalItems - deepAnalysisCount} 个`);
  console.log('========================================');

  const errors: { itemId: string; error: string }[] = [];
  let completedCount = 0;
  let totalCount = 0;
  const allScripts: GeneratedScript[] = [];

  // 遍历所有 PGC flowlist
  for (const flowlist of PGC_CONTENT) {
    console.log(`\n📚 系列: ${flowlist.title}`);

    for (const item of flowlist.items) {
      totalCount++;

      try {
        // 生成脚本
        const script = await generateScriptForItem(item, flowlist, genAI);
        allScripts.push(script);

        // 保存逐字稿 JSON
        const scriptPath = path.join(scriptsDir, `${item.id}.json`);
        fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf-8');

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
  const reportPath = path.join(projectRoot, 'scripts/pgc-script-generation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    completed: completedCount,
    total: totalCount,
    errors,
    scripts: allScripts.map(s => ({
      itemId: s.itemId,
      title: s.title,
      mode: s.mode,
      wordCount: s.metadata.wordCount,
      knowledgeCardsCount: s.knowledgeCards.length
    }))
  }, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
