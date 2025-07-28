import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getAllAvailableGeminiKeys, validateAccessKey, updateKeyUsage, markKeyAsInvalid } from '@/lib/key-manager';
import { logApiCall } from '@/lib/logging';
import { convertOpenAItoGemini, convertGeminiStreamToOpenAI } from '@/lib/converter';
import { getStreamingConfig } from '@/lib/settings-manager';
import { ApiError } from '@/lib/config';

// 正确的安全设置类型
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// 判断是否为可重试的错误
function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || error.toString();
  const errorCode = error.code || error.status;
  
  // 明确的客户端错误 - 不可重试（这些错误换key也不会成功）
  // 401 Unauthorized - 认证问题
  if (errorCode === 401) {
    return false;
  }
  
  // 403 Forbidden - 权限问题（但API key相关的除外）
  if (errorCode === 403 && !errorMessage.includes('API key') && !errorMessage.includes('API_KEY')) {
    return false;
  }
  
  // 其他所有错误都认为是可重试的，包括：
  // - API key 相关错误 (400, 401, 403)
  // - 配额相关错误 (429)
  // - 服务器错误 (500, 502, 503)
  // - 模型不存在错误 (400)
  // - 参数错误 (400) - 可能某些key支持不同的参数
  // - 网络错误
  // - 其他未知错误
  return true;
}

// 使用指定key进行API调用
async function callGeminiWithKey(
  keyId: string, 
  apiKey: string, 
  geminiRequest: any, 
  model: string, 
  isStream: boolean,
  res: NextApiResponse
): Promise<{ success: boolean; response?: any; error?: any }> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: model,
      safetySettings: SAFETY_SETTINGS
    });
    
    if (isStream) {
      // 流式响应
      const result = await geminiModel.generateContentStream(geminiRequest);
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          const openaiChunk = convertGeminiStreamToOpenAI({ text }, model);
          const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
          res.write(sseData);
        }
      }
      
      // 发送结束标记
      res.write('data: [DONE]\n\n');
      res.end();
      
      return { success: true };
    } else {
      // 非流式响应
      const result = await geminiModel.generateContent(geminiRequest);
      const response = await result.response;
      const text = response.text();
      
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      
      return { success: true, response: openaiResponse };
    }
  } catch (error) {
    console.error(`Key ${keyId} failed:`, error);
    return { success: false, error };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  let accessKeyId: string | null = null;
  let geminiKeyId: string | null = null;
  let requestBody: any = null;
  let responseStatusCode = 500;
  let errorMessage: string | null = null;
  
  // 获取IP地址
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || req.socket.remoteAddress || '127.0.0.1';
  
  try {
    // 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }
    
    // 步骤 1: 预检与认证
    if (req.method !== 'POST') {
      throw new ApiError(405, 'Method not allowed');
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401);
    }
    
    const apiKey = authHeader.substring(7);
    accessKeyId = await validateAccessKey(apiKey);
    if (!accessKeyId) {
      throw new ApiError(401);
    }
    
    // 步骤 2: 速率限制
    // 注意：这里简化了速率限制，在生产环境中可能需要更完整的实现
    
    // 步骤 3: 解析请求体
    try {
      requestBody = req.body;
    } catch (error) {
      throw new ApiError(400);
    }
    
    // 步骤 3.5: 检查流式传输配置
    const isStream = requestBody.stream || false;
    if (isStream) {
      const streamingConfig = await getStreamingConfig();
      
      if (streamingConfig.enabled) {
        // 如果启用了流式传输，重定向到Edge Function版本
        console.log(`[REDIRECT] Redirecting to Edge Function for streaming request`);
        
        // 构造完整的URL
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const edgeUrl = `${protocol}://${host}/api/v1/chat/completions-edge`;
        
        try {
          // 转发请求到Edge Function
          const response = await fetch(edgeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.authorization || '',
              'x-forwarded-for': ip,
            },
            body: JSON.stringify(requestBody),
          });
          
          // 如果是流式响应，直接转发流
          if (response.headers.get('content-type')?.includes('text/event-stream')) {
            res.writeHead(response.status, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'X-Accel-Buffering': 'no',
            });
            
            if (response.body) {
              const reader = response.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              } finally {
                reader.releaseLock();
              }
            }
            res.end();
            return;
          } else {
            // 非流式响应，直接返回JSON
            const result = await response.json();
            return res.status(response.status).json(result);
          }
        } catch (edgeError) {
          console.error('Edge Function redirect failed:', edgeError);
          // 如果Edge Function失败，继续使用当前的Serverless Function处理
          console.log(`[FALLBACK] Edge Function failed, falling back to Serverless Function`);
        }
      }
    }
    
    // 步骤 4: 获取所有可用的 Gemini Keys 进行轮询
    const availableKeys = await getAllAvailableGeminiKeys();
    console.log(`[POLLING] Starting with ${availableKeys.length} available keys`);
    
    const model = requestBody.model || 'gemini-pro';
    const geminiRequest = await convertOpenAItoGemini(requestBody);
    
    let lastError: any = null;
    let triedKeys: string[] = [];
    
    // 轮询所有可用的key
    for (const key of availableKeys) {
      const keyStartTime = Date.now();
      triedKeys.push(key.id);
      geminiKeyId = key.id;
      
      console.log(`[POLLING] Trying key ${key.id} (${triedKeys.length}/${availableKeys.length})`);
      
      // 无论成功还是失败，都更新 Key 使用统计
      updateKeyUsage(key.id).catch(console.error);
      
      const result = await callGeminiWithKey(
        key.id,
        key.api_key,
        geminiRequest,
        model,
        isStream,
        res
      );
      
      const keyDuration = Date.now() - keyStartTime;
      
      if (result.success) {
        // 成功！记录成功日志
        console.log(`[POLLING] Key ${key.id} succeeded!`);
        
        // 记录成功的API调用日志
        logApiCall({
          ip_address: ip || '127.0.0.1',
          access_key_id: accessKeyId || undefined,
          gemini_key_id: key.id,
          model_requested: requestBody?.model,
          response_status_code: 200,
          duration_ms: keyDuration,
          is_stream: requestBody?.stream || false,
          error_message: undefined,
        }).catch(console.error);
        
        responseStatusCode = 200;
        
        if (!isStream && result.response) {
          return res.status(200).json(result.response);
        }
        // 流式响应已经在 callGeminiWithKey 中处理完毕
        return;
      } else {
        // 失败，记录错误和失败日志
        lastError = result.error;
        const errorMsg = result.error?.message || result.error?.toString() || '';
        console.log(`[POLLING] Key ${key.id} failed: ${errorMsg}`);
        
        // 记录失败的API调用日志
        logApiCall({
          ip_address: ip || '127.0.0.1',
          access_key_id: accessKeyId || undefined,
          gemini_key_id: key.id,
          model_requested: requestBody?.model,
          response_status_code: errorMsg.includes('quota') ? 429 : 
                               errorMsg.includes('API_KEY_INVALID') ? 401 : 
                               errorMsg.includes('Not Found') ? 404 : 500,
          duration_ms: keyDuration,
          is_stream: requestBody?.stream || false,
          error_message: errorMsg,
        }).catch(console.error);
        
        // 检查是否为可重试的错误
        if (isRetryableError(result.error)) {
          console.log(`[POLLING] Key ${key.id} failed with retryable error, trying next key...`);
          
          // 如果是API key相关错误，标记为无效
          if (errorMsg.includes('API_KEY_INVALID') || 
              errorMsg.includes('Invalid API key') ||
              errorMsg.includes('API key not valid')) {
            markKeyAsInvalid(key.id, errorMsg).catch(console.error);
          }
          
          continue; // 尝试下一个key
        } else {
          // 非可重试错误，直接返回
          console.log(`[POLLING] Key ${key.id} failed with non-retryable error, stopping retry`);
          break;
        }
      }
    }
    
    // 所有key都失败了
    console.log(`[POLLING] All ${triedKeys.length} keys failed. Last error:`, lastError);
    
    let apiError: ApiError;
    if (lastError instanceof ApiError) {
      apiError = lastError;
    } else {
      // 根据最后的错误类型决定返回的错误码
      const errorMsg = lastError?.message || lastError?.toString() || '';
      if (errorMsg.includes('quota') || errorMsg.includes('QUOTA_EXCEEDED')) {
        apiError = new ApiError(429, 'All API keys have exceeded quota limits');
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('Invalid API key')) {
        apiError = new ApiError(401, 'All API keys are invalid');
      } else {
        apiError = new ApiError(503, `All ${triedKeys.length} API keys failed. Last error: ${errorMsg}`);
      }
    }
    
    responseStatusCode = apiError.statusCode;
    errorMessage = apiError.message;
    
    return res.status(apiError.statusCode).json(apiError.toJSON());
    
  } catch (error) {
    console.error('API Error:', error);
    
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      apiError = new ApiError(500);
    }
    
    responseStatusCode = apiError.statusCode;
    errorMessage = apiError.message;
    
    return res.status(apiError.statusCode).json(apiError.toJSON());
    
  } finally {
    // 轮询过程中已经为每次Key尝试记录了详细日志
    // 这里不需要再次记录
  }
}