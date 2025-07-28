import { supabase } from './supabaseClient';

const MAX_LOG_COUNT = parseInt(process.env.MAX_LOG_COUNT || '300', 10);

interface LogData {
  ip_address?: string;
  access_key_id?: string;
  gemini_key_id?: string;
  model_requested?: string;
  response_status_code?: number;
  duration_ms?: number;
  is_stream?: boolean;
  error_message?: string;
}

export async function logApiCall(logData: LogData) {
  try {
    // 插入新日志
    await supabase
      .from('call_logs')
      .insert([{
        timestamp: new Date().toISOString(),
        ...logData
      }]);
    
    // 清理旧日志（保持最新的 MAX_LOG_COUNT 条）
    const { data: oldLogs } = await supabase
      .from('call_logs')
      .select('id')
      .order('timestamp', { ascending: false })
      .range(MAX_LOG_COUNT, MAX_LOG_COUNT + 100);
    
    if (oldLogs && oldLogs.length > 0) {
      const idsToDelete = oldLogs.map((log: any) => log.id);
      await supabase
        .from('call_logs')
        .delete()
        .in('id', idsToDelete);
    }
  } catch (error) {
    console.error('Error logging API call:', error);
  }
}