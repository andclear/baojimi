import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // 只查询调用总数，不获取详细数据
    const { count, error } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Call count API: Error fetching call count:', error);
      throw new Error(`Failed to fetch call count: ${error.message}`);
    }
    
    return res.status(200).json({ 
      totalCalls: count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Call count API: Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return res.status(500).json({ 
      error: 'Failed to fetch call count',
      details: errorMessage
    });
  }
}