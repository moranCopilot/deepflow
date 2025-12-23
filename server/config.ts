import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load environment variables with priority:
 * 1. process.env (Vercel/System)
 * 2. .env.local (Local override)
 * 3. .env (Default)
 */
function loadEnvironment() {
    // 1. Load default .env
    const defaultEnvPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(defaultEnvPath)) {
        dotenv.config({ path: defaultEnvPath });
    }

    // 2. Load .env.local and override
    const localEnvPath = path.resolve(__dirname, '.env.local');
    if (fs.existsSync(localEnvPath)) {
        const envConfig = dotenv.parse(fs.readFileSync(localEnvPath));
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
    }
}

// Initialize environment
loadEnvironment();

/**
 * Application Configuration Module
 * 
 * Centralizes configuration management for both Local Development and Vercel Deployment.
 * Supports legacy VUE_APP_ prefix for compatibility as requested.
 */
export const config = {
    /**
     * Server Port
     * Defaults to 3000 if not specified
     */
    port: process.env.PORT || 3000,

    /**
     * Gemini API Key
     * Tries GEMINI_API_KEY first, then falls back to VUE_APP_GEMINI_API_KEY
     */
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.VUE_APP_GEMINI_API_KEY || '',

    /**
     * Environment Name
     */
    nodeEnv: process.env.NODE_ENV || 'development',
    
    /**
     * Check if the API key is configured
     */
    get isConfigured() {
        return !!this.geminiApiKey;
    },

};

// Validation check on startup
if (!config.isConfigured) {
    console.warn("\n⚠️  CONFIGURATION WARNING");
    console.warn("   GEMINI_API_KEY is missing.");
    console.warn("   Please set it in .env, .env.local, or Vercel Environment Variables.");
    console.warn("   You can also use VUE_APP_GEMINI_API_KEY for compatibility.\n");
} else {
    console.log(`✅ Configuration loaded for environment: ${config.nodeEnv}`);
}
