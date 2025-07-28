import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

// 计算自刷新额度统计的时间范围（每天下午2点开始到次日下午1:59）
function getRefreshPeriodRange() {
  // 获取当前UTC时间
  const now = new Date();
  
  // 直接使用UTC时间加8小时得到上海时间
  const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  console.log('Dashboard API: Current UTC time:', now.toISOString());
  console.log('Dashboard API: Shanghai time:', shanghaiTime.toISOString());
  console.log('Dashboard API: Shanghai hour:', shanghaiTime.getUTCHours());
  
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
  
  console.log('Dashboard API: Refresh period range:', {
    start: startUTC.toISOString(),
    end: endUTC.toISOString()
  });
  
  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString()
  };
}

// 重试函数
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.log(`Dashboard API: Retry ${i + 1}/${maxRetries} failed:`, error);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('Dashboard API: Starting data fetch...');
    
    // 获取调用日志，包含关联的 Gemini Key 信息
    const logs = await retryOperation(async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          gemini_keys:gemini_key_id (
            id,
            key_suffix,
            api_key
          ),
          access_keys:access_key_id (
            id,
            comment
          )
        `)
        .order('timestamp', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('Dashboard API: Error fetching logs:', error);
        throw new Error(`Failed to fetch logs: ${error.message}`);
      }
      
      console.log('Dashboard API: Logs fetched successfully, count:', data?.length || 0);
      return data || [];
    });
    
    // 获取总调用次数统计
    const totalCalls = await retryOperation(async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id', { count: 'exact' });
      
      if (error) {
        console.error('Dashboard API: Error fetching total calls:', error);
        throw new Error(`Failed to fetch total calls: ${error.message}`);
      }
      
      console.log('Dashboard API: Total calls fetched successfully, count:', data?.length || 0);
      return data || [];
    });
    
    // 获取自刷新额度统计（当前周期内的调用次数）
    const refreshPeriod = getRefreshPeriodRange();
    console.log('Dashboard API: Refresh period range:', refreshPeriod);
    
    const refreshCalls = await retryOperation(async () => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id', { count: 'exact' })
        .gte('timestamp', refreshPeriod.start)
        .lte('timestamp', refreshPeriod.end);
      
      if (error) {
        console.error('Dashboard API: Error fetching refresh calls:', error);
        throw new Error(`Failed to fetch refresh calls: ${error.message}`);
      }
      
      console.log('Dashboard API: Refresh calls fetched successfully, count:', data?.length || 0);
      return data || [];
    });
    
    // 获取Gemini Keys统计
    const keyStats = await retryOperation(async () => {
      const { data, error } = await supabase
        .from('gemini_keys')
        .select('id, key_suffix, request_count, is_active, is_valid');
      
      if (error) {
        console.error('Dashboard API: Error fetching key stats:', error);
        throw new Error(`Failed to fetch key stats: ${error.message}`);
      }
      
      console.log('Dashboard API: Key stats fetched successfully, count:', data?.length || 0);
      return data || [];
    });
    
    const stats = {
      totalCalls: totalCalls?.length || 0,
      refreshPeriodCalls: refreshCalls?.length || 0,
      activeKeys: keyStats?.filter((k: any) => k.is_active && k.is_valid).length || 0,
      totalKeys: keyStats?.length || 0,
      keyUsage: keyStats || []
    };
    
    console.log('Dashboard API: Stats calculated successfully:', stats);
    
    const responseData = {
      logs: logs || [],
      stats
    };
    
    console.log('Dashboard API: Response prepared successfully');
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Dashboard API: Unexpected error:', error);
    console.error('Dashboard API: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // 返回更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = errorMessage.includes('fetch failed') || errorMessage.includes('timeout');
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: errorMessage,
      type: isNetworkError ? 'network_error' : 'database_error',
      timestamp: new Date().toISOString(),
      suggestion: isNetworkError 
        ? 'Network connection issue. Please check your internet connection and try again.'
        : 'Database query failed. Please try again later.'
    });
  }
}