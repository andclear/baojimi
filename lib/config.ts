// 用于 Gemini 1.0和2.0 Pro 等模型
export const GEMINI_1_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

// 错误响应文案配置
export const ERROR_MESSAGES = {
  401: {
    type: 'invalid_api_key',
    message: '你这调用密钥不对，我很难帮你办事啊~'
  },
  429: {
    type: 'rate_limit_exceeded',
    message: '您已触发"激情调用"模式，请冷静。我们已为您启动强制冷却系统，稍后再试。'
  },
  500: {
    type: 'internal_error',
    message: '要么是你网络问题，要么是你发的请求有问题，反正Google不理你咯'
  },
  503: {
    type: 'no_available_keys',
    message: '弹尽粮绝！我们所有的Gemini Key都在休息或已被封印。等刷新额度吧！555~'
  },
  400: {
    type: 'invalid_request_body',
    message: '请求参数好像不太对劲，再看一眼，不行，AI真看不懂'
  },
  403: {
    type: 'gemini_api_key_invalid',
    message: '你提供的某个Gemini Key被Google封印了，它现在只是一串无用的字符。快去后台检查一下吧！'
  }
};

// API 错误类
export class ApiError extends Error {
  public statusCode: number;
  public type: string;

  constructor(statusCode: number, message?: string) {
    const errorConfig = ERROR_MESSAGES[statusCode as keyof typeof ERROR_MESSAGES];
    super(message || errorConfig?.message || 'Unknown error');
    this.statusCode = statusCode;
    this.type = errorConfig?.type || 'unknown_error';
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        type: this.type,
        code: this.statusCode.toString()
      }
    };
  }
}