import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getAllAvailableGeminiKeys, validateAccessKey, updateKeyUsage, markKeyAsInvalid } from '@/lib/key-manager';
import { logApiCall } from '@/lib/logging';
import { convertOpenAItoGemini, convertGeminiStreamToOpenAI } from '@/lib/converter';
import { getStreamingConfig } from '@/lib/settings-manager';
import { ApiError } from '@/lib/config';

// Edge Function配置
export const config = {
  runtime: 'edge',
};

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
  
  // 明确的客户端错误 - 不可重试
  if (errorCode === 401) {
    return false;
  }
  
  if (errorCode === 403 && !errorMessage.includes('API key') && !errorMessage.includes('API_KEY')) {
    return false;
  }
  
  return true;
}

// 真实流式传输实现
async function handleRealStream(
  keyId: string,
  apiKey: string,
  geminiRequest: any,
  model: string
): Promise<Response> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: model,
      safetySettings: SAFETY_SETTINGS
    });
    
    const result = await geminiModel.generateContentStream(geminiRequest);
    
    const encoder = new TextEncoder();
    let hasContent = false;
    let streamClosed = false;
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送初始连接确认
          controller.enqueue(encoder.encode(': connected\n\n'));
          
          let accumulatedText = '';
          const streamStartTime = Date.now();
          const maxStreamDuration = 25000; // 25秒超时保护
          
          try {
            for await (const chunk of result.stream) {
              if (streamClosed) break;
              
              // 检查是否超时
              if (Date.now() - streamStartTime > maxStreamDuration) {
                console.warn(`[EDGE] Key ${keyId}: Stream timeout after ${maxStreamDuration}ms`);
                break;
              }
              
              const text = chunk.text();
              if (text) {
                hasContent = true;
                accumulatedText += text;
                
                const openaiChunk = convertGeminiStreamToOpenAI({ text }, model);
                const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
            }
            
          } catch (streamError) {
            console.error(`[EDGE] Key ${keyId} stream processing error:`, streamError);
            // 不要在这里中断流，让它继续完成
          }
          
          // 检查是否有内容，如果没有内容才发送fallback
          if (!hasContent || !accumulatedText.trim()) {
            console.warn(`[EDGE] Key ${keyId}: Empty response from Gemini API`);
            const fallbackText = "抱歉，我无法生成回复。请稍后再试。";
            const fallbackChunk = convertGeminiStreamToOpenAI({ text: fallbackText }, model);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(fallbackChunk)}\n\n`));
          }
          
          if (!streamClosed) {
            // 发送结束标记
            const finishChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            streamClosed = true;
            controller.close();
          }
        } catch (error) {
          console.error(`[EDGE] Key ${keyId} stream error:`, error);
          
          if (!streamClosed) {
            try {
              const errorChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: 'error'
                }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              streamClosed = true;
            } catch (e) {
              console.error(`[EDGE] Key ${keyId} failed to send error chunk:`, e);
            }
            controller.error(error);
          }
        }
      },
      
      cancel() {
        streamClosed = true;
        console.log(`[EDGE] Key ${keyId} stream cancelled by client`);
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error(`[EDGE] Real stream failed for key ${keyId}:`, error);
    throw error;
  }
}

// 伪装流式传输实现
async function handleFakeStream(
  keyId: string,
  apiKey: string,
  geminiRequest: any,
  model: string
): Promise<Response> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: model,
      safetySettings: SAFETY_SETTINGS
    });
    
    // 先完整获取响应
    const result = await geminiModel.generateContent(geminiRequest);
    const response = await result.response;
    const fullText = response.text();
    
    // 检查响应是否为空
    if (!fullText || !fullText.trim()) {
      console.warn(`[EDGE] Key ${keyId}: Empty response from Gemini API in fake stream`);
      throw new Error('Empty response from Gemini API');
    }
    
    // 将完整文本分块模拟流式传输
    const encoder = new TextEncoder();
    let streamClosed = false;
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送初始连接确认
          controller.enqueue(encoder.encode(': connected\n\n'));
          
          // 简化分块策略：较大的分块，减少网络开销
          const chunkSize = Math.max(15, Math.floor(fullText.length / 15)); // 更大的分块
          let currentIndex = 0;
          
          // 使用 async/await 而不是 setTimeout，避免 Edge Function 超时问题
          while (currentIndex < fullText.length && !streamClosed) {
            let endIndex = Math.min(currentIndex + chunkSize, fullText.length);
            
            // 确保不在中文字符中间截断
            if (endIndex < fullText.length) {
              const char = fullText[endIndex];
              // 如果是中文字符或其他多字节字符，向前调整到安全位置
              if (char && char.charCodeAt(0) > 127) {
                // 向前找到空格或标点符号
                while (endIndex > currentIndex && 
                       fullText[endIndex] && 
                       fullText[endIndex].charCodeAt(0) > 127 && 
                       !/[\s\.,!?;:]/.test(fullText[endIndex])) {
                  endIndex--;
                }
                // 如果找到了合适的分割点，向前移动一位包含分隔符
                if (endIndex > currentIndex && /[\s\.,!?;:]/.test(fullText[endIndex])) {
                  endIndex++;
                }
              }
            }
            
            const chunkText = fullText.slice(currentIndex, endIndex);
            currentIndex = endIndex;
            
            if (chunkText.trim()) {
              const openaiChunk = convertGeminiStreamToOpenAI({ text: chunkText }, model);
              const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
            
            // 使用 Promise 而不是 setTimeout，更稳定
            if (currentIndex < fullText.length) {
              await new Promise(resolve => setTimeout(resolve, 50)); // 减少延迟
            }
          }
          
          if (!streamClosed) {
            // 发送结束标记
            const finishChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            streamClosed = true;
            controller.close();
          }
        } catch (error) {
          console.error(`[EDGE] Key ${keyId} fake stream error:`, error);
          if (!streamClosed) {
            try {
              const errorChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: 'error'
                }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              streamClosed = true;
            } catch (e) {
              console.error(`[EDGE] Key ${keyId} failed to send error chunk in fake stream:`, e);
            }
            controller.error(error);
          }
        }
      },
      
      cancel() {
        streamClosed = true;
        console.log(`[EDGE] Key ${keyId} fake stream cancelled by client`);
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error(`[EDGE] Fake stream failed for key ${keyId}:`, error);
    throw error;
  }
}

// 非流式传输实现
async function handleNonStream(
  keyId: string,
  apiKey: string,
  geminiRequest: any,
  model: string
): Promise<any> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: model,
      safetySettings: SAFETY_SETTINGS
    });
    
    const result = await geminiModel.generateContent(geminiRequest);
    const response = await result.response;
    const text = response.text();
    
    // 检查响应是否为空
    if (!text || !text.trim()) {
      console.warn(`[EDGE] Key ${keyId}: Empty response from Gemini API in non-stream`);
      throw new Error('Empty response from Gemini API');
    }
    
    return {
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
  } catch (error) {
    console.error(`[EDGE] Non-stream failed for key ${keyId}:`, error);
    throw error;
  }
}

export default async function handler(request: Request): Promise<Response> {
  const startTime = Date.now();
  let accessKeyId: string | null = null;
  let geminiKeyId: string | null = null;
  let requestBody: any = null;
  let responseStatusCode = 500;
  let errorMessage: string | null = null;
  
  // 获取IP地址
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            '127.0.0.1';
  
  try {
    // 步骤 1: 预检与认证
    if (request.method !== 'POST') {
      throw new ApiError(405, 'Method not allowed');
    }
    
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401);
    }
    
    const apiKey = authHeader.substring(7);
    accessKeyId = await validateAccessKey(apiKey);
    if (!accessKeyId) {
      throw new ApiError(401);
    }
    
    // 步骤 2: 解析请求体
    try {
      requestBody = await request.json();
    } catch (error) {
      throw new ApiError(400);
    }
    
    // 步骤 3: 获取流式传输配置
    const streamingConfig = await getStreamingConfig();
    
    // 步骤 4: 获取所有可用的 Gemini Keys 进行轮询
    const availableKeys = await getAllAvailableGeminiKeys();
    console.log(`[EDGE] Starting with ${availableKeys.length} available keys`);
    
    // 添加请求去重：为相同的请求内容添加随机性
    const model = requestBody.model || 'gemini-pro';
    const isStream = requestBody.stream || false;
    
    // 为请求添加时间戳和随机性，避免完全相同的请求
    const originalMessages = requestBody.messages || [];
    const enhancedMessages = [...originalMessages];
    
    // 在系统消息中添加微小的时间戳差异，避免缓存重复
    if (enhancedMessages.length > 0) {
      const lastMessage = enhancedMessages[enhancedMessages.length - 1];
      if (lastMessage.role === 'user') {
        // 在用户消息末尾添加不可见的时间戳
        lastMessage.content += `\n<!-- req_${Date.now()}_${Math.random().toString(36).substr(2, 9)} -->`;
      }
    }
    
    const geminiRequest = await convertOpenAItoGemini({
      ...requestBody,
      messages: enhancedMessages
    });
    
    let lastError: any = null;
    let triedKeys: string[] = [];
    
    // 随机打乱 keys 顺序，避免总是使用相同的 key
    const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);
    
    // 轮询所有可用的key
    for (const key of shuffledKeys) {
      const keyStartTime = Date.now();
      triedKeys.push(key.id);
      geminiKeyId = key.id;
      
      console.log(`[EDGE] Trying key ${key.id} (${triedKeys.length}/${availableKeys.length})`);
      
      // 无论成功还是失败，都更新 Key 使用统计
      updateKeyUsage(key.id).catch(console.error);
      
      try {
        let result: Response | any;
        
        if (isStream) {
          // 客户端请求流式传输
          if (streamingConfig.enabled && !streamingConfig.fake_stream_enabled) {
            // 真实流式传输模式
            console.log(`[EDGE] Using real stream mode for key ${key.id}`);
            result = await handleRealStream(key.id, key.api_key, geminiRequest, model);
          } else if (!streamingConfig.enabled && streamingConfig.fake_stream_enabled) {
            // 伪装流式传输模式
            console.log(`[EDGE] Using fake stream mode for key ${key.id}`);
            result = await handleFakeStream(key.id, key.api_key, geminiRequest, model);
          } else if (!streamingConfig.enabled && !streamingConfig.fake_stream_enabled) {
            // 流式传输被禁用，降级到非流式
            console.log(`[EDGE] Stream disabled, using non-stream mode for key ${key.id}`);
            result = await handleNonStream(key.id, key.api_key, geminiRequest, model);
          } else {
            // 配置冲突（两者都启用），优先使用真实流式
            console.log(`[EDGE] Config conflict detected, defaulting to real stream for key ${key.id}`);
            result = await handleRealStream(key.id, key.api_key, geminiRequest, model);
          }
        } else {
          // 客户端请求非流式传输
          console.log(`[EDGE] Using non-stream mode for key ${key.id}`);
          result = await handleNonStream(key.id, key.api_key, geminiRequest, model);
        }
        
        const keyDuration = Date.now() - keyStartTime;
        
        // 成功！记录成功日志
        console.log(`[EDGE] Key ${key.id} succeeded in ${keyDuration}ms!`);
        
        // 记录成功的API调用日志
        logApiCall({
          ip_address: ip,
          access_key_id: accessKeyId || undefined,
          gemini_key_id: key.id,
          model_requested: requestBody?.model,
          response_status_code: 200,
          duration_ms: keyDuration,
          is_stream: isStream,
          error_message: undefined,
        }).catch(console.error);
        
        responseStatusCode = 200;
        
        if (result instanceof Response) {
          // 流式响应
          return result;
        } else {
          // 非流式响应
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
      } catch (error) {
        // 失败，记录错误和失败日志
        lastError = error;
        const errorMsg = (error as any)?.message || (error as any)?.toString() || '';
        console.log(`[EDGE] Key ${key.id} failed: ${errorMsg}`);
        
        const keyDuration = Date.now() - keyStartTime;
        
        // 记录失败的API调用日志
        logApiCall({
          ip_address: ip,
          access_key_id: accessKeyId || undefined,
          gemini_key_id: key.id,
          model_requested: requestBody?.model,
          response_status_code: errorMsg.includes('quota') ? 429 : 
                               errorMsg.includes('API_KEY_INVALID') ? 401 : 
                               errorMsg.includes('Not Found') ? 404 : 500,
          duration_ms: keyDuration,
          is_stream: isStream,
          error_message: errorMsg,
        }).catch(console.error);
        
        // 检查是否为可重试的错误
        if (isRetryableError(error)) {
          console.log(`[EDGE] Key ${key.id} failed with retryable error, trying next key...`);
          
          // 如果是API key相关错误，标记为无效
          if (errorMsg.includes('API_KEY_INVALID') || 
              errorMsg.includes('Invalid API key') ||
              errorMsg.includes('API key not valid')) {
            markKeyAsInvalid(key.id, errorMsg).catch(console.error);
          }
          
          continue; // 尝试下一个key
        } else {
          // 非可重试错误，直接返回
          console.log(`[EDGE] Key ${key.id} failed with non-retryable error, stopping retry`);
          break;
        }
      }
    }
    
    // 所有key都失败了
    const totalDuration = Date.now() - startTime;
    console.log(`[EDGE] All ${triedKeys.length} keys failed in ${totalDuration}ms. Last error:`, lastError);
    
    let apiError: ApiError;
    if (lastError instanceof ApiError) {
      apiError = lastError;
    } else {
      // 根据最后的错误类型决定返回的错误码
      const errorMsg = (lastError as any)?.message || (lastError as any)?.toString() || '';
      if (errorMsg.includes('quota') || errorMsg.includes('QUOTA_EXCEEDED')) {
        apiError = new ApiError(429, 'All API keys have exceeded quota limits');
      } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('Invalid API key')) {
        apiError = new ApiError(401, 'All API keys are invalid');
      } else if (errorMsg.includes('Empty response')) {
        apiError = new ApiError(502, 'All API keys returned empty responses');
      } else {
        apiError = new ApiError(503, `All ${triedKeys.length} API keys failed. Last error: ${errorMsg}`);
      }
    }
    
    responseStatusCode = apiError.statusCode;
    errorMessage = apiError.message;
    
    return new Response(JSON.stringify(apiError.toJSON()), {
      status: apiError.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
  } catch (error) {
    console.error('[EDGE] API Error:', error);
    
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      apiError = new ApiError(500);
    }
    
    responseStatusCode = apiError.statusCode;
    errorMessage = apiError.message;
    
    return new Response(JSON.stringify(apiError.toJSON()), {
      status: apiError.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}