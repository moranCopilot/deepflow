export interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    criteria: {
        fileTypes?: string[];
        minSize?: number;
        maxSize?: number;
        minLength?: number; // Estimated word count or duration
    };
    generate: (context: PromptContext) => string;
}

export interface PromptContext {
    fileStats: {
        totalSize: number;
        fileCount: number;
        types: string[];
    };
    userInstructions?: string;
    preferences?: {
        duration?: 'short' | 'medium' | 'long';
        mode?: 'single' | 'dual';
        type?: 'output' | 'discussion' | 'interactive';
        preset?: string;
    };
}
