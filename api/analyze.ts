import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm, File as FormidableFile } from 'formidable';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { promptManager } from './prompts/index.js';
import fs from 'fs';
import mammoth from 'mammoth';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const WordExtractor = require('word-extractor');

// Helper to wait for file to be processed with timeout
async function waitForFileActive(fileManager: GoogleAIFileManager, name: string, timeoutMs: number = 30000) {
  const startTime = Date.now();
  let file = await fileManager.getFile(name);
  let checkCount = 0;
  
  while (file.state === "PROCESSING") {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`File ${file.name} processing timeout after ${timeoutMs}ms`);
    }
    
    // Progressive backoff: start with 1s, increase to 3s max
    const waitTime = Math.min(1000 + checkCount * 500, 3000);
    checkCount++;
    
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    file = await fileManager.getFile(name);
  }
  
  if (file.state !== "ACTIVE") {
    throw new Error(`File ${file.name} failed to process. State: ${file.state}`);
  }
  
  return file;
}

// Helper to generate content with timeout and retries
async function generateContentWithRetry(
  model: any, 
  prompt: string, 
  fileParts: any[], 
  maxRetries: number = 3,
  requestStartTime: number
): Promise<any> {
  let lastError: any = null;
  const generationStartTime = Date.now();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retrying content generation (attempt ${attempt + 1}/${maxRetries + 1})...`);
        // Exponential backoff: 1s, 2s, 4s
        const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      // Check if we're running out of time (leave 5s buffer)
      const elapsedTotal = Date.now() - requestStartTime;
      if (elapsedTotal > 55000) {
        throw new Error(`TIMEOUT: 请求已运行 ${Math.round(elapsedTotal/1000)}秒，接近超时限制`);
      }
      
      const result = await model.generateContent([prompt, ...fileParts]);
      const elapsed = Date.now() - generationStartTime;
      console.log(`Generation successful on attempt ${attempt + 1} (took ${Math.round(elapsed/1000)}s)`);
      return result;
    } catch (error: any) {
      lastError = error;
      const elapsed = Date.now() - generationStartTime;
      console.warn(`Generation attempt ${attempt + 1} failed after ${Math.round(elapsed/1000)}s:`, error.message);
      
      // Check if error is non-retryable
      const errorMessage = error.message || '';
      if (
        errorMessage.includes('TIMEOUT') ||
        errorMessage.includes('504') || 
        errorMessage.includes('Gateway Timeout') ||
        errorMessage.includes('API Key') ||
        errorMessage.includes('INVALID_ARGUMENT') ||
        errorMessage.includes('PERMISSION_DENIED')
      ) {
        // Non-retryable error, throw immediately
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(`内容生成失败（已重试 ${maxRetries} 次，总耗时 ${Math.round(elapsed/1000)}秒）。\n\n错误：${error.message}`);
      }
    }
  }
  
  throw lastError || new Error('内容生成失败：未知错误');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestStartTime = Date.now();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VUE_APP_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server API Key not configured" });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const fileManager = new GoogleAIFileManager(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

  try {
    console.log(`[${new Date().toISOString()}] Request started`);
    // Parse form data
    const form = new IncomingForm({
      uploadDir: os.tmpdir(),
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
    });

    const [fields, files] = await form.parse(req);
    const fileArray: FormidableFile[] = Array.isArray(files.files) 
      ? files.files 
      : (files.files ? [files.files] : []);

    if (fileArray.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    console.log(`Received ${fileArray.length} files for analysis...`);
    const uploadResponses = [];

    // Process files
    for (const file of fileArray) {
      const filePath = file.filepath;
      const originalName = file.originalFilename || 'unknown';
      const mimetype = file.mimetype || 'application/octet-stream';

      console.log(`Processing ${originalName} (${mimetype})...`);

      // Handle Word Documents
      if (
        mimetype === 'application/msword' ||
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        try {
          let textContent = '';
          const isDocx = originalName.toLowerCase().endsWith('.docx') || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

          if (isDocx) {
            const result = await mammoth.extractRawText({ path: filePath });
            textContent = result.value;
          } else {
            const extractor = new WordExtractor();
            const extracted = await extractor.extract(filePath);
            textContent = extracted.getBody();
          }

          if (!textContent) {
            throw new Error('No text content extracted from document');
          }

          const txtPath = filePath + '.txt';
          fs.writeFileSync(txtPath, textContent);

          try {
            const uploadResponse = await fileManager.uploadFile(txtPath, {
              mimeType: 'text/plain',
              displayName: originalName + '.txt',
            });

            console.log(`Uploaded converted text for ${originalName}`);
            uploadResponses.push(uploadResponse);

            // Clean up
            fs.unlinkSync(txtPath);
            fs.unlinkSync(filePath);
            continue;
          } catch (uploadError: any) {
            if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw uploadError;
          }
        } catch (conversionError) {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          throw new Error(`Failed to process Word document: ${originalName}`);
        }
      }

      // Standard upload
      try {
        const uploadResponse = await fileManager.uploadFile(filePath, {
          mimeType: mimetype,
          displayName: originalName,
        });

        console.log(`Uploaded ${originalName}`);
        uploadResponses.push(uploadResponse);
        fs.unlinkSync(filePath);
      } catch (uploadError: any) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const errorMessage = uploadError?.message || String(uploadError);
        if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout')) {
          throw new Error(`无法连接到 Google API 服务器。请检查 API Key 是否有效。\n\n原始错误: ${errorMessage}`);
        }
        throw uploadError;
      }
    }

    // Wait for processing (with dynamic timeout based on file size)
    // Files are uploaded, now wait for Gemini to process them
    console.log("Waiting for files to be processed...");
    
    // Dynamic timeout: base 15s + 2s per MB, max 30s
    const totalSizeBytes = fileArray.reduce((acc: number, f: FormidableFile) => acc + (f.size || 0), 0);
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const processingTimeout = Math.min(15000 + Math.ceil(totalSizeMB) * 2000, 30000);
    console.log(`Processing timeout: ${processingTimeout}ms for ${totalSizeMB.toFixed(2)}MB`);
    
    // Process files in parallel for faster completion
    const processingPromises = uploadResponses.map(async (response) => {
      try {
        await waitForFileActive(fileManager, response.file.name, processingTimeout);
        return { success: true, name: response.file.name };
      } catch (timeoutError: any) {
        // Check current state - might be ready despite timeout
        try {
          const currentFile = await fileManager.getFile(response.file.name);
          if (currentFile.state === "ACTIVE") {
            console.log(`File ${response.file.name} is ready despite timeout warning`);
            return { success: true, name: response.file.name };
          }
          return { success: false, name: response.file.name, state: currentFile.state, error: timeoutError };
        } catch (e) {
          return { success: false, name: response.file.name, error: timeoutError };
        }
      }
    });
    
    const processingResults = await Promise.all(processingPromises);
    const failedFiles = processingResults.filter(r => !r.success);
    
    if (failedFiles.length > 0) {
      const failedNames = failedFiles.map(f => f.name).join(', ');
      throw new Error(`文件处理超时：${failedNames} 仍在处理中。\n\n建议：\n1. 使用较小的文件（<10MB）\n2. 减少文件数量\n3. 稍后重试`);
    }
    
    console.log("All files ready.");

    // Generate content
    const fileParts = uploadResponses.map(response => ({
      fileData: {
        mimeType: response.file.mimeType,
        fileUri: response.file.uri,
      },
    }));

    const totalSize = fileArray.reduce((acc: number, file: FormidableFile) => {
      return acc + (file.size || 0);
    }, 0);
    const types = [...new Set(fileArray.map((file: FormidableFile) => file.mimetype || 'application/octet-stream'))];

    const fileStats = {
      totalSize,
      fileCount: fileArray.length,
      types
    };

    let preferences;
    try {
      const preferencesField = fields.preferences;
      const preferencesStr = Array.isArray(preferencesField) ? preferencesField[0] : preferencesField;
      if (preferencesStr && typeof preferencesStr === 'string') {
        preferences = JSON.parse(preferencesStr);
      }
    } catch (e) {
      console.warn("Failed to parse preferences:", e);
    }

    const promptTemplate = promptManager.getBestMatch({
      fileStats,
      preferences
    });

    const prompt = promptTemplate.generate({
      fileStats,
      preferences
    });

    // Generate content with retry mechanism
    // Files are already uploaded and processed, so we can retry generation without re-uploading
    console.log("Generating content...");
    
    // Calculate remaining time and adjust retries accordingly
    const elapsedSoFar = Date.now() - requestStartTime;
    const remainingTime = 55000 - elapsedSoFar; // Leave 5s buffer
    
    // Adjust max retries based on remaining time
    let maxRetries = 3;
    if (remainingTime < 20000) {
      maxRetries = 1; // Only 1 retry if less than 20s remaining
    } else if (remainingTime < 35000) {
      maxRetries = 2; // 2 retries if less than 35s remaining
    }
    
    console.log(`Remaining time: ${Math.round(remainingTime/1000)}s, max retries: ${maxRetries}`);
    
    const result = await generateContentWithRetry(model, prompt, fileParts, maxRetries, requestStartTime);
    
    const responseText = result.response.text();
    console.log("Generation complete.");

    // Parse JSON
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

    const totalTime = Date.now() - requestStartTime;
    console.log(`[${new Date().toISOString()}] Request completed in ${totalTime}ms`);
    res.json(parsedData);
  } catch (error: any) {
    const totalTime = Date.now() - requestStartTime;
    console.error(`[${new Date().toISOString()}] Error after ${totalTime}ms:`, error);
    console.error("Error stack:", error?.stack);
    
    // Provide more detailed error information
    let errorMessage = error?.message || String(error) || "Internal Server Error";
    
    // Check for timeout errors
    if (totalTime > 55000 || errorMessage.includes('TIMEOUT')) {
      errorMessage = `请求超时（耗时 ${Math.round(totalTime/1000)}秒）。\n\nVercel Serverless Functions 最大执行时间为 60 秒。\n\n建议：\n1. 使用较小的文件（<10MB）\n2. 减少文件数量\n3. 使用 PDF 或纯文本格式（处理更快）\n4. 稍后重试`;
    } else if (errorMessage.includes('promptManager') || errorMessage.includes('prompt')) {
      errorMessage = `配置错误：无法加载提示模板管理器。请检查 prompts 目录是否存在。\n\n原始错误: ${errorMessage}`;
    } else if (errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('API Key')) {
      errorMessage = `配置错误：Gemini API Key 未配置。请在 Vercel 环境变量中设置 GEMINI_API_KEY。\n\n原始错误: ${errorMessage}`;
    } else if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout')) {
      errorMessage = `网络错误：无法连接到 Google API 服务器。\n\n原始错误: ${errorMessage}`;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      elapsedTime: Math.round(totalTime/1000),
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

