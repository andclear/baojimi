import { getDisguiseEnabled, generateDisguiseString } from './settings-manager';

// OpenAI 到 Gemini 的请求转换
export async function convertOpenAItoGemini(openaiRequest: any) {
  const { messages, model, stream = false, max_tokens, temperature } = openaiRequest;
  
  // 检查是否启用伪装信息功能
  const disguiseEnabled = await getDisguiseEnabled();
  
  // 找到第一条用户消息的索引
  const firstUserMessageIndex = messages.findIndex((m: any) => m.role === 'user');
  
  // 转换消息格式
  const contents = messages.map((msg: any, index: number) => {
    let content = msg.content;
    
    // 如果启用了伪装信息功能，在第一条用户消息中添加伪装字符串
    if (disguiseEnabled && msg.role === 'user' && index === firstUserMessageIndex) {
      const disguiseString = generateDisguiseString();
      content = `${content} [${disguiseString}]`;
      console.log(`[DISGUISE] Added disguise string to first user message: [${disguiseString}]`);
    }
    
    if (msg.role === 'system') {
      return {
        role: 'user',
        parts: [{ text: `System: ${content}` }]
      };
    } else if (msg.role === 'user') {
      return {
        role: 'user',
        parts: [{ text: content }]
      };
    } else if (msg.role === 'assistant') {
      return {
        role: 'model',
        parts: [{ text: content }]
      };
    }
    return null;
  }).filter(Boolean);
  
  // 构建 Gemini 请求
  const geminiRequest = {
    contents,
    generationConfig: {
      maxOutputTokens: max_tokens || 2048,
      temperature: temperature || 0.7,
    }
  };
  
  return geminiRequest;
}

// Gemini 流式响应转换为 OpenAI SSE 格式
export function convertGeminiStreamToOpenAI(chunk: any, model: string) {
  const choices = [{
    index: 0,
    delta: {
      content: chunk.text || ''
    },
    finish_reason: null
  }];
  
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices
  };
}

// 创建最终的完成响应
export function createCompletionResponse(content: string, model: string) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}