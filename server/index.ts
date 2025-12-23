import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as googleTTS from 'google-tts-api';
import axios from 'axios';
import { promptManager } from './prompts/index.js';
import { config } from './config.js';

import { createServer } from 'http';
import liveSessionRouter from './live-session.js';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WordExtractor = require('word-extractor');

// Configure global proxy for all HTTP/HTTPS requests
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  
  // Configure global-agent for http/https modules (used by axios, etc.)
  const { bootstrap } = require('global-agent');
  if (!process.env.GLOBAL_AGENT_HTTP_PROXY && process.env.HTTP_PROXY) {
    process.env.GLOBAL_AGENT_HTTP_PROXY = process.env.HTTP_PROXY;
  }
  if (!process.env.GLOBAL_AGENT_HTTPS_PROXY && process.env.HTTPS_PROXY) {
    process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.HTTPS_PROXY;
  }
  bootstrap();
  
  // Configure undici (Node.js 18+ fetch) to use proxy
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log(`✅ Undici proxy configured: ${proxyUrl}`);
  } catch (e) {
    console.warn('⚠️  Could not configure undici proxy:', e);
  }
  
  console.log(`✅ Global proxy configured: ${proxyUrl}`);
}

const app = express();
const port = config.port;

// Create HTTP server
const server = createServer(app);

// Configure CORS
app.use(cors());
app.use(express.json());

// Mount Live Session API
app.use('/api/live-session', liveSessionRouter);

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini
// Config loaded from config.ts
const apiKey = config.geminiApiKey;

const genAI = new GoogleGenerativeAI(apiKey || '');
const fileManager = new GoogleAIFileManager(apiKey || '');
const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// Helper to wait for file to be processed
async function waitForFileActive(name: string) {
  let file = await fileManager.getFile(name);
  while (file.state === "PROCESSING") {
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await fileManager.getFile(name);
  }
  if (file.state !== "ACTIVE") {
    throw new Error(`File ${file.name} failed to process`);
  }
  return file;
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DeepFlow Server is running' });
});

// TTS Endpoint
app.post('/api/tts', async (req, res): Promise<any> => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }
    try {
        const urls = googleTTS.getAllAudioUrls(text, {
            lang: 'zh-CN',
            slow: false,
            host: 'https://translate.google.com',
        });
        res.json({ urls });
    } catch (error: any) {
        console.error("TTS Error:", error);
        res.status(500).json({ error: error.message || "TTS failed" });
    }
});

// Audio Proxy Endpoint
app.get('/api/proxy-audio', async (req, res): Promise<any> => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).send("Missing url parameter");
    }

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        res.set('Content-Type', 'audio/mpeg');
        response.data.pipe(res);
    } catch (error: any) {
        console.error("Proxy Error:", error.message);
        res.status(500).send("Failed to fetch audio");
    }
});

// Analyze endpoint
app.post('/api/analyze', upload.array('files'), async (req, res): Promise<any> => {
  if (!apiKey) {
    return res.status(500).json({ error: "Server API Key not configured" });
  }

  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    console.log(`Received ${files.length} files for analysis...`);
    const uploadResponses = [];

    // 1. Upload files to Gemini
    const processedFiles = [];
    for (const file of files) {
      // Fix filename encoding (Multer often messes up UTF-8 filenames)
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      console.log(`Processing ${originalName} (${file.mimetype})...`);
      
      // Handle Word Documents (.doc, .docx)
      if (
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
          console.log(`Converting Word document ${originalName} to text...`);
          try {
             let textContent = '';

             // Check if it's .doc (binary) or .docx (XML/Zip)
             // Using mimetype is unreliable, check extension or try both
             const isDocx = originalName.toLowerCase().endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
             
             if (isDocx) {
                // Use mammoth for .docx
                const result = await mammoth.extractRawText({ path: file.path });
                textContent = result.value;
             } else {
                // Use word-extractor for .doc
                const extractor = new WordExtractor();
                const extracted = await extractor.extract(file.path);
                textContent = extracted.getBody();
             }
             
             if (!textContent) {
                throw new Error('No text content extracted from document');
             }

             // Create a temporary text file
             const txtPath = file.path + '.txt';
             fs.writeFileSync(txtPath, textContent);
             
             // Upload the TEXT file instead
             try {
               const uploadResponse = await fileManager.uploadFile(txtPath, {
                  mimeType: 'text/plain',
                  displayName: originalName + '.txt',
               });
               
               console.log(`Uploaded converted text for ${originalName} as ${uploadResponse.file.name}`);
               uploadResponses.push(uploadResponse);
               
               // Clean up
               fs.unlinkSync(txtPath);
               fs.unlinkSync(file.path);
               continue; // Skip standard upload
             } catch (uploadError: any) {
               // Clean up on error
               if (fs.existsSync(txtPath)) {
                 fs.unlinkSync(txtPath);
               }
               if (fs.existsSync(file.path)) {
                 fs.unlinkSync(file.path);
               }
               
               // Check if it's a network error
               const errorMessage = uploadError?.message || String(uploadError);
               if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
                 throw new Error(`无法连接到 Google API 服务器。请检查：\n1. 网络连接是否正常\n2. 是否需要配置代理（如果在中国大陆）\n3. API Key 是否有效\n\n原始错误: ${errorMessage}`);
               }
               throw uploadError;
             }

          } catch (conversionError) {
              console.error(`Failed to convert ${originalName}:`, conversionError);
              
              // Clean up the original file since we failed
              fs.unlinkSync(file.path);

              // Throw error to stop processing this request or just skip this file?
              // Better to inform frontend, but for now let's skip this file and let others proceed if any.
              // OR throw to fail the whole request as the user expects this file to be analyzed.
              throw new Error(`Failed to process Word document: ${originalName}. Please ensure it is a valid .doc or .docx file.`);
          }
      }

      // Standard Upload for supported types (PDF, Image, Audio, Video)
      // Use the fixed originalName for display
      try {
        const uploadResponse = await fileManager.uploadFile(file.path, {
          mimeType: file.mimetype,
          displayName: originalName,
        });
        
        console.log(`Uploaded ${originalName} as ${uploadResponse.file.name}`);
        uploadResponses.push(uploadResponse);

        // Clean up local file immediately after upload
        fs.unlinkSync(file.path);
      } catch (uploadError: any) {
        // Clean up local file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
        // Check if it's a network error
        const errorMessage = uploadError?.message || String(uploadError);
        if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
          throw new Error(`无法连接到 Google API 服务器。请检查：\n1. 网络连接是否正常\n2. 是否需要配置代理（如果在中国大陆）\n3. API Key 是否有效\n\n原始错误: ${errorMessage}`);
        }
        throw uploadError;
      }
    }

    // 2. Wait for processing
    console.log("Waiting for files to be processed...");
    for (const response of uploadResponses) {
      await waitForFileActive(response.file.name);
    }
    console.log("All files ready.");

    // 3. Generate Content
    const fileParts = uploadResponses.map(response => ({
      fileData: {
        mimeType: response.file.mimeType,
        fileUri: response.file.uri,
      },
    }));

    // Calculate context for prompt selection
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    const types = [...new Set(files.map(file => file.mimetype))];
    
    const fileStats = {
        totalSize,
        fileCount: files.length,
        types
    };

    let preferences;
    try {
        if (req.body.preferences) {
            preferences = JSON.parse(req.body.preferences);
            console.log("Using user preferences:", preferences);
        }
    } catch (e) {
        console.warn("Failed to parse preferences:", e);
    }

    const promptTemplate = promptManager.getBestMatch({
        fileStats,
        preferences
    });

    console.log(`Selected prompt template: ${promptTemplate.name} (${promptTemplate.id})`);

    const prompt = promptTemplate.generate({
        fileStats,
        preferences
    });

    console.log("Generating content...");
    const result = await model.generateContent([
      prompt,
      ...fileParts
    ]);

    const responseText = result.response.text();
    console.log("Generation complete.");
    
    // Clean up: Delete files from Gemini to save storage (optional, but good practice)
    // for (const response of uploadResponses) {
    //   await fileManager.deleteFile(response.file.name);
    // }

    // Parse JSON safely
    let parsedData;
    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            parsedData = { raw: responseText };
        }
    } catch (e) {
        parsedData = { raw: responseText, error: "Failed to parse JSON" };
    }

    res.json(parsedData);

  } catch (error: any) {
    console.error("Error processing request:", error);
    const errorMessage = error?.message || String(error) || "Internal Server Error";
    
    // Provide more helpful error messages
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes('无法连接到 Google API')) {
      userFriendlyMessage = errorMessage;
    } else if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout')) {
      userFriendlyMessage = `网络连接失败：无法访问 Google API 服务器。\n\n可能的原因：\n1. 网络连接问题\n2. 需要配置代理（如果在中国大陆）\n3. 防火墙阻止了连接\n\n原始错误: ${errorMessage}`;
    }
    
    res.status(500).json({ error: userFriendlyMessage });
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`API Key configured: ${!!apiKey}`);
});
