import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 清除所有调用日志
    const { error } = await supabase
      .from('call_logs')
      .delete()
      .neq('id', 0); // 删除所有记录

    if (error) {
      console.error('Error clearing logs:', error);
      return res.status(500).json({ error: 'Failed to clear logs' });
    }

    return res.status(200).json({ 
      success: true, 
      message: '所有日志已成功清除' 
    });

  } catch (error) {
    console.error('Error clearing logs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}