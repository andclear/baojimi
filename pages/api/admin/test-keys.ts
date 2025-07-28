import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 获取所有活跃的 Gemini Keys
    const { data: keys, error: keysError } = await supabase
      .from('gemini_keys')
      .select('id, api_key, key_suffix')
      .eq('is_active', true);

    if (keysError) {
      return res.status(500).json({ error: 'Failed to fetch keys' });
    }

    if (!keys || keys.length === 0) {
      return res.status(200).json({
        total: 0,
        success: 0,
        failed: 0,
        results: []
      });
    }

    const testResults = [];
    let successCount = 0;
    let failedCount = 0;

    // 并行测试所有 API Key
    const testPromises = keys.map(async (key) => {
      const startTime = Date.now();
      let success = false;
      let errorMessage = '';
      let statusCode = 500;

      try {
        // 使用 Gemini API 进行测试，应用安全策略
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key.api_key
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Hello, this is a test message.'
              }]
            }],
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ]
          })
        });

        statusCode = response.status;
        
        if (response.ok) {
          success = true;
          successCount++;
        } else {
          const errorData = await response.json().catch(() => ({}));
          errorMessage = errorData.error?.message || `HTTP ${response.status}`;
          failedCount++;
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Network error';
        failedCount++;
      }

      const duration = Date.now() - startTime;

      // 记录测试调用到日志
      try {
        await supabase
          .from('call_logs')
          .insert({
            timestamp: new Date().toISOString(),
            ip_address: '127.0.0.1', // 系统测试
            model_requested: 'gemini-2.0-flash',
            response_status_code: statusCode,
            duration_ms: duration,
            is_stream: false,
            error_message: success ? null : errorMessage,
            gemini_key_id: key.id,
            access_key_id: null // 系统测试，无访问密钥
          });

        // 更新密钥的请求计数
        const { data: currentKey } = await supabase
          .from('gemini_keys')
          .select('request_count')
          .eq('id', key.id)
          .single();

        await supabase
          .from('gemini_keys')
          .update({ 
            request_count: (currentKey?.request_count || 0) + 1,
            last_used_at: new Date().toISOString(),
            is_valid: success
          })
          .eq('id', key.id);
      } catch (logError) {
        console.error('Failed to log test result:', logError);
      }

      return {
        keyId: key.id,
        keySuffix: key.key_suffix,
        success,
        statusCode,
        duration,
        errorMessage
      };
    });

    // 等待所有测试完成
    const results = await Promise.all(testPromises);
    
    return res.status(200).json({
      total: keys.length,
      success: successCount,
      failed: failedCount,
      results
    });

  } catch (error) {
    console.error('Test keys error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}