import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

// 计算自刷新额度统计的时间范围（每天下午2点开始到次日下午1:59）
function getRefreshPeriodRange() {
  // 获取当前UTC时间
  const now = new Date();
  
  // 直接使用UTC时间加8小时得到上海时间
  const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  let startTime: Date;
  let endTime: Date;
  
  // 如果当前时间是下午2点之前，统计周期是昨天下午2点到今天下午1:59
  if (shanghaiTime.getUTCHours() < 14) {
    // 昨天下午2点（上海时间）
    startTime = new Date(shanghaiTime);
    startTime.setUTCDate(startTime.getUTCDate() - 1);
    startTime.setUTCHours(14, 0, 0, 0);
    
    // 今天下午1:59（上海时间）
    endTime = new Date(shanghaiTime);
    endTime.setUTCHours(13, 59, 59, 999);
  } else {
    // 如果当前时间是下午2点之后，统计周期是今天下午2点到明天下午1:59
    // 今天下午2点（上海时间）
    startTime = new Date(shanghaiTime);
    startTime.setUTCHours(14, 0, 0, 0);
    
    // 明天下午1:59（上海时间）
    endTime = new Date(shanghaiTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
    endTime.setUTCHours(13, 59, 59, 999);
  }
  
  // 转换回UTC时间用于数据库查询
  const startUTC = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
  const endUTC = new Date(endTime.getTime() - 8 * 60 * 60 * 1000);
  
  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString()
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { mode } = req.query;
    const isToday = mode === 'today';
    
    // 获取所有 Gemini Keys 及其统计信息
    const { data: keys, error: keysError } = await supabase
      .from('gemini_keys')
      .select('id, api_key, key_suffix, is_active, is_valid, request_count, last_used_at, created_at')
      .order('created_at', { ascending: false });
    
    if (keysError) {
      return res.status(500).json({ error: 'Failed to fetch keys' });
    }

    // 计算统计时间范围
    let timeRange: { start: string; end: string } | null = null;
    if (isToday) {
      timeRange = getRefreshPeriodRange();
    }

    // 为每个key获取详细统计
    const keysWithStats = await Promise.all((keys || []).map(async (key) => {
      let totalCallsQuery = supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('gemini_key_id', key.id);
      
      let successCallsQuery = supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('gemini_key_id', key.id)
        .eq('response_status_code', 200);
      
      let failedCallsQuery = supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('gemini_key_id', key.id)
        .neq('response_status_code', 200);

      // 如果是今日模式，添加时间过滤
      if (isToday && timeRange) {
        totalCallsQuery = totalCallsQuery.gte('timestamp', timeRange.start).lte('timestamp', timeRange.end);
        successCallsQuery = successCallsQuery.gte('timestamp', timeRange.start).lte('timestamp', timeRange.end);
        failedCallsQuery = failedCallsQuery.gte('timestamp', timeRange.start).lte('timestamp', timeRange.end);
      }

      // 执行查询
      const { count: totalCalls } = await totalCallsQuery;
      const { count: successCalls } = await successCallsQuery;
      const { count: failedCalls } = await failedCallsQuery;

      return {
         ...key,
         stats: {
           totalCalls: totalCalls || 0,
           successCalls: successCalls || 0,
           failedCalls: failedCalls || 0,
           successRate: (totalCalls || 0) > 0 ? (((successCalls || 0) / (totalCalls || 0)) * 100).toFixed(1) : '0.0'
         }
       };
    }));
    
    return res.status(200).json({ keys: keysWithStats });
  }
  
  if (req.method === 'POST') {
    // 添加新的 Gemini Key(s) - 支持批量添加
    const { keys, comment } = req.body;
    
    // 支持单个密钥或批量密钥
    const keyList = Array.isArray(keys) ? keys : [keys];
    
    if (!keyList.length) {
      return res.status(400).json({ error: 'No keys provided' });
    }
    
    // 验证所有密钥格式
    for (const key of keyList) {
      if (!key || !key.trim() || !key.startsWith('AIza')) {
        return res.status(400).json({ error: `Invalid API key format: ${key}` });
      }
    }
    
    // 准备插入数据
    const insertData = keyList.map(key => ({
      api_key: key.trim(),
      key_suffix: key.trim().slice(-4),
      is_active: true,
      is_valid: true,
      request_count: 0
    }));
    
    const { data, error } = await supabase
      .from('gemini_keys')
      .insert(insertData)
      .select();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to add keys' });
    }
    
    return res.status(201).json({ success: true, added: data.length });
  }
  
  if (req.method === 'PUT') {
    // 更新 Gemini Key 状态
    const { id, is_active } = req.body;
    
    const { data, error } = await supabase
      .from('gemini_keys')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to update key' });
    }
    
    return res.status(200).json(data);
  }
  
  if (req.method === 'DELETE') {
    // 删除 Gemini Key
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Missing key ID' });
    }
    
    const { error } = await supabase
      .from('gemini_keys')
      .delete()
      .eq('id', id);
    
    if (error) {
      return res.status(500).json({ error: 'Failed to delete key' });
    }
    
    return res.status(200).json({ success: true });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}