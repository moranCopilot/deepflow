import { PromptTemplate, PromptContext } from './types.js';
import { detailedDialoguePrompt } from './templates/detailed_dialogue.js';
import { defaultPrompt } from './templates/default.js';
import { quickSummaryPrompt } from './templates/quick_summary.js';
import { deepAnalysisPrompt } from './templates/deep_analysis.js';
import { interactivePracticePrompt } from './templates/interactive_practice.js';

class PromptManager {
    private templates: PromptTemplate[] = [];

    constructor() {
        // Register templates
        this.registerTemplate(quickSummaryPrompt);
        this.registerTemplate(deepAnalysisPrompt);
        this.registerTemplate(detailedDialoguePrompt);
        this.registerTemplate(interactivePracticePrompt);
        this.registerTemplate(defaultPrompt);
    }

    registerTemplate(template: PromptTemplate) {
        this.templates.push(template);
    }

    getTemplate(id: string): PromptTemplate | undefined {
        return this.templates.find(t => t.id === id);
    }

    getBestMatch(context: PromptContext): PromptTemplate {
        // 1. Check for explicit preset in preferences
        if (context.preferences?.preset) {
            const preset = context.preferences.preset;
            
            if (preset === 'quick_summary') return this.getTemplate('quick_summary') || defaultPrompt;
            if (preset === 'deep_analysis') return this.getTemplate('deep_analysis') || defaultPrompt;
            if (preset === 'dual_discussion') return this.getTemplate('detailed_dialogue') || defaultPrompt;
            if (preset === 'interactive_practice') return this.getTemplate('interactive_practice') || defaultPrompt;
        }

        // 2. Fallback to criteria matching (Legacy or general usage)
        for (const template of this.templates) {
            if (template.id === 'detailed_dialogue' && this.matchesCriteria(template, context)) {
                return template;
            }
        }

        return defaultPrompt;
    }

    private matchesCriteria(template: PromptTemplate, context: PromptContext): boolean {
        const { criteria } = template;
        const { fileStats } = context;

        if (criteria.minSize && fileStats.totalSize < criteria.minSize) return false;
        if (criteria.maxSize && fileStats.totalSize > criteria.maxSize) return false;
        
        // Check file types intersection
        if (criteria.fileTypes && criteria.fileTypes.length > 0) {
            const hasMatchingType = fileStats.types.some(t => criteria.fileTypes?.includes(t));
            if (!hasMatchingType) return false;
        }

        return true;
    }
}

export const promptManager = new PromptManager();
