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
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送初始连接确认
          controller.enqueue(encoder.encode(': connected\n\n'));
          
          try {
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                const openaiChunk = convertGeminiStreamToOpenAI({ text }, model);
                const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
            }
          } catch (streamError) {
            console.error('Stream processing error:', streamError);
            // 流处理错误，但不中断连接，发送错误信息
            const errorMessage = (streamError as any)?.message || 'Stream processing error';
            const errorChunk = convertGeminiStreamToOpenAI({ text: `\n\n[Error: ${errorMessage}]` }, model);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
          }
          
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
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
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
          controller.error(error);
        }
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
    console.error(`Real stream failed for key ${keyId}:`, error);
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
    
    // 将完整文本分块模拟流式传输
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // 发送初始连接确认
        controller.enqueue(encoder.encode(': connected\n\n'));
        
        // 按字符分块，而不是按词分块，这样更平滑
        const chunkSize = 3; // 每次发送3个字符
        let currentIndex = 0;
        
        const sendChunk = () => {
          if (currentIndex < fullText.length) {
            const chunkText = fullText.slice(currentIndex, currentIndex + chunkSize);
            currentIndex += chunkSize;
            
            if (chunkText) {
              const openaiChunk = convertGeminiStreamToOpenAI({ text: chunkText }, model);
              const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
            
            // 模拟延迟，让流式效果更自然
            setTimeout(sendChunk, 30);
          } else {
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
            controller.close();
          }
        };
        
        // 稍微延迟开始，模拟真实的响应时间
        setTimeout(sendChunk, 100);
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
    console.error(`Fake stream failed for key ${keyId}:`, error);
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
    console.error(`Non-stream failed for key ${keyId}:`, error);
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
    
    const model = requestBody.model || 'gemini-pro';
    const isStream = requestBody.stream || false;
    const geminiRequest = await convertOpenAItoGemini(requestBody);
    
    let lastError: any = null;
    let triedKeys: string[] = [];
    
    // 轮询所有可用的key
    for (const key of availableKeys) {
      const keyStartTime = Date.now();
      triedKeys.push(key.id);
      geminiKeyId = key.id;
      
      console.log(`[EDGE] Trying key ${key.id} (${triedKeys.length}/${availableKeys.length})`);
      
      // 无论成功还是失败，都更新 Key 使用统计
      updateKeyUsage(key.id).catch(console.error);
      
      try {
        let result: Response | any;
        
        if (isStream && streamingConfig.enabled) {
          // 流式传输模式
          if (streamingConfig.enabled && !streamingConfig.fake_stream_enabled) {
            try {
              result = await handleRealStream(key.id, key.api_key, geminiRequest, model);
            } catch (error) {
              // 如果真实流式传输失败且启用了伪装流式，则降级
              if (streamingConfig.fake_stream_enabled) {
                console.log(`[EDGE] Real stream failed for key ${key.id}, falling back to fake stream`);
                result = await handleFakeStream(key.id, key.api_key, geminiRequest, model);
              } else {
                throw error;
              }
            }
          } else {
            // 伪装流式传输
            result = await handleFakeStream(key.id, key.api_key, geminiRequest, model);
          }
        } else if (isStream && streamingConfig.fake_stream_enabled) {
          // 仅启用伪装流式传输
          result = await handleFakeStream(key.id, key.api_key, geminiRequest, model);
        } else {
          // 非流式传输
          result = await handleNonStream(key.id, key.api_key, geminiRequest, model);
        }
        
        const keyDuration = Date.now() - keyStartTime;
        
        // 成功！记录成功日志
        console.log(`[EDGE] Key ${key.id} succeeded!`);
        
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
    console.log(`[EDGE] All ${triedKeys.length} keys failed. Last error:`, lastError);
    
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
    console.error('Edge API Error:', error);
    
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