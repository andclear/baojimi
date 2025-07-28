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
// 后端使用流式接收数据，但一次性返回完整结果给前端
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
    
    console.log(`[FAKE_STREAM] Key ${keyId} starting fake stream mode...`);
    
    // 创建响应流，立即返回给 Vercel
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log(`[FAKE_STREAM] Key ${keyId} created response stream, starting internal stream processing...`);
          
          // 在后端内部使用流式方式调用 Gemini API
          const result = await geminiModel.generateContentStream(geminiRequest);
          
          // 在后端拼接所有数据块，不立即发送给前端
          let fullText = '';
          let chunkCount = 0;
          
          console.log(`[FAKE_STREAM] Key ${keyId} receiving stream chunks from Gemini...`);
          
          // 接收并拼接所有流式数据块
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullText += text;
              chunkCount++;
              
              // 每10个块输出一次进度日志
              if (chunkCount % 10 === 0) {
                console.log(`[FAKE_STREAM] Key ${keyId} received ${chunkCount} chunks, current length: ${fullText.length}`);
              }
            }
          }
          
          console.log(`[FAKE_STREAM] Key ${keyId} completed stream reception. Total chunks: ${chunkCount}, final length: ${fullText.length}`);
          
          // 检查响应是否为空
          if (!fullText || fullText.trim().length === 0) {
            console.warn(`[FAKE_STREAM] Key ${keyId} returned empty response after stream processing`);
            throw new Error('Empty response from Gemini API');
          }
          
          // 创建完整的 OpenAI 格式响应
          const completeResponse = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: fullText
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0
            }
          };
          
          // 一次性将完整的拼接好的字符串推入响应流
          console.log(`[FAKE_STREAM] Key ${keyId} pushing complete response to stream...`);
          const responseData = JSON.stringify(completeResponse);
          controller.enqueue(encoder.encode(responseData));
          controller.close();
          
          console.log(`[FAKE_STREAM] Key ${keyId} fake stream completed successfully`);
          
        } catch (error) {
          console.error(`[FAKE_STREAM] Error in fake stream for key ${keyId}:`, error);
          
          // 发送错误响应
          const errorResponse = {
            error: {
              message: (error as any)?.message || 'Internal server error',
              type: 'api_error',
              code: 'internal_error'
            }
          };
          
          controller.enqueue(encoder.encode(JSON.stringify(errorResponse)));
          controller.error(error);
        }
      },
      
      cancel() {
        console.log(`[FAKE_STREAM] Stream cancelled for key ${keyId}`);
      }
    });
    
    // 返回 JSON 响应流，而不是 SSE 流
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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