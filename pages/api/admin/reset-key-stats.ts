import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 重置所有密钥的调用记录
    const { error: updateError } = await supabase
      .from('gemini_keys')
      .update({ 
        request_count: 0, 
        last_used_at: null 
      })
      .neq('id', 0); // 更新所有记录
    
    if (updateError) {
      throw updateError;
    }
    
    // 清除所有调用日志（可选，如果你想保留日志历史可以注释掉这部分）
    const { error: deleteError } = await supabase
      .from('call_logs')
      .delete()
      .neq('id', 0); // 删除所有记录
    
    if (deleteError) {
      console.warn('Warning: Failed to clear call logs:', deleteError);
      // 不抛出错误，因为主要目标是重置密钥统计
    }
    
    res.status(200).json({ 
      success: true, 
      message: '所有密钥统计数据已重置' 
    });
  } catch (error) {
    console.error('Reset key stats error:', error);
    res.status(500).json({ 
      error: '重置统计数据失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}