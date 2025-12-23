import { PromptTemplate, PromptContext } from '../types.js';

export const detailedDialoguePrompt: PromptTemplate = {
    id: 'detailed_dialogue',
    name: 'Detailed Deep Dive',
    description: 'Extensive analysis with high detail retention',
    criteria: {
        minSize: 1024 * 10, 
    }, 
    generate: (context: PromptContext) => {
        const { preferences } = context;
        const mode = preferences?.mode || 'dual';
        const type = preferences?.type || 'discussion';
        const duration = preferences?.duration || 'medium';

        let persona = '';
        if (mode === 'single') {
            persona = `You are Deep, an analytical and articulate expert narrator. Your tone is professional yet engaging.`;
        } else {
            persona = `You are Deep and Flow, two podcast hosts. Deep is analytical, structured, and skeptical. Flow is creative, intuitive, and enthusiastic.`;
        }

        let taskDescription = '';
        if (mode === 'single') {
            taskDescription = `Your task is to analyze the provided materials and create a HIGHLY DETAILED monologue script.`;
        } else {
            taskDescription = `Your task is to analyze the provided materials and create a HIGHLY DETAILED podcast dialogue script.`;
        }

        let lengthInstruction = '';
        if (duration === 'short') {
            lengthInstruction = `- Keep the script concise but dense. Aim for ~500-800 words.`;
        } else if (duration === 'long') {
             lengthInstruction = `- The generated script content must be EXTENSIVE. Aim for ~2000+ words. Expand heavily on every point.`;
        } else {
            lengthInstruction = `- The generated script content must be AT LEAST 150% of the original material's information density. Expand on every point.`;
        }

        let structureInstruction = '';
        if (type === 'output') {
            structureInstruction = `- Structure: Present the content as a structured lecture or narrative flow. Use rhetorical questions if needed to maintain engagement.`;
        } else {
            // Discussion
             structureInstruction = `- Structure: For each Knowledge Card, create a specific Q&A exchange or discussion segment. 1 Knowledge Point = 1 Dedicated Segment.`;
        }

        return `
    ${persona}
    
    ${taskDescription}

    Output STRICT JSON format with the following structure:
    {
      "title": "A catchy title for this session",
      "summary": "A brief summary of the content (max 100 words)",
      "knowledgeCards": [
        {
          "title": "Concept Name",
          "content": "A concise factual explanation. Focus on ONE concept per card. MUST include source location (e.g., 'Source: Page 2' or 'Source: 00:15').",
          "tags": ["tag1", "tag2"]
        }
      ],
      "podcastScript": [
        {
          "speaker": "${mode === 'single' ? 'Deep' : 'Deep'}",
          "text": "..."
        }${mode === 'dual' ? `,
        {
          "speaker": "Flow",
          "text": "..."
        }` : ''}
      ]
    }
    
    CRITICAL REQUIREMENTS:

    1. SCRIPT LENGTH & DETAIL:
       ${lengthInstruction}
       - STRICTLY RETAIN specific details, numbers, dates, and key data from the source. Do not summarize away the specifics.
    
    2. STRUCTURE & KNOWLEDGE CARDS:
       - Organize the content around the Knowledge Cards.
       ${structureInstruction}
    
    3. KNOWLEDGE CARD SPECIFICATIONS:
       - Extract ONLY specific factual content.
       - DO NOT include global comments, general summaries, or framework-level descriptions in the cards.
       - MUST mark the original position/source for every knowledge point.
    
    4. GENERAL:
       - Language: Chinese (Simplified).
       - Tone: Natural, engaging, deep dive.
       - Output only the JSON object. No markdown.
    `;
    }
};
