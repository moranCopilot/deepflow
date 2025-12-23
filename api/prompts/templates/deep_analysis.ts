import { PromptTemplate, PromptContext } from '../types.js';

export const deepAnalysisPrompt: PromptTemplate = {
    id: 'deep_analysis',
    name: 'Deep Analysis',
    description: 'Comprehensive deep dive into the material',
    criteria: {}, 
    generate: (context: PromptContext) => {
        // Updated based on product requirements: "深度剖析"
        const persona = `你正在录制一档深度的双人播客节目。
        角色A（老师）：知识渊博、循循善诱，负责引导话题、设问、并对难点进行深度拆解。
        角色B（学生/助教）：好奇心强，思维活跃，负责回答基础问题，或者在难点处提出困惑，代表听众的视角。`;
        
        const taskDescription = `你的任务是分析提供的材料，制作一份“深度剖析”的双人对话脚本。目标是以“总-分-总”的逻辑，帮助用户彻底理解每一个记忆点和知识点。`;

        const coreInstructions = `
        1. **结构逻辑：总-分-总**：
           - **总（开篇）**：
             - 快速过一遍原文中的每一个内容板块。
             - 概括每个板块要考察的核心信息。
             - 特别关注原文中的大小标题、章节首段首句，进行重点强调。
             - 结合你能拓展的事实性知识进行初步讲解。
           - **分（核心拆解）**：
             - 逐一解析每个重点所对应的材料。
             - **重点关注**：如果材料中有“思维导图”节点，这是必须反复强调的重点。
             - **习题解析**：如果发现有练习题，**必须**识别出正确答案，并结合答案解析题目，让听众记住练习题背后的事实性信息。
           - **总（回顾）**：
             - 再次强调需要记忆的事实和观点，形成闭环。

        2. **对话形式**：
           - 采用双人问答形式。
           - A（老师）抛出问题或话题 -> B（学生）尝试回答或表达理解 -> A（老师）补充、修正或进行深度拓展。
           - 避免枯燥的说教，要像聊天一样自然，但内容必须硬核。

        3. **篇幅控制**：
           - 这是一个长篇深度的剖析，脚本字数应支持约20分钟的对话（约3000-4000字）。
           - 如果原篇极长，请专注于当前最核心的几个章节进行深度剖析。
        `;

        return `
    ${persona}
    
    ${taskDescription}

    ${coreInstructions}

    Output STRICT JSON format with the following structure:
    {
      "title": "深度剖析：[文档标题]",
      "summary": "本期深度剖析的核心内容概览。",
      "knowledgeCards": [
        {
          "title": "深度知识点",
          "content": "详细的解释，包含背景、原理及考点。",
          "tags": ["深度", "考点"]
        }
      ],
      "podcastScript": [
        {
          "speaker": "老师",
          "text": "..."
        },
        {
          "speaker": "学生",
          "text": "..."
        }
      ]
    }
    
    CRITICAL REQUIREMENTS:
    1. SCRIPT LENGTH: Aim for ~3000+ Chinese characters. This is a LONG form content.
    2. DEPTH: Do not skim. Explain "Why" and "How".
    3. EXERCISES: If exercises are present, YOU MUST discuss the correct answer and why.
    4. LANGUAGE: Chinese (Simplified).
    5. Output only the JSON object. No markdown.
    `;
    }
};
