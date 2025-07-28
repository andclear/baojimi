import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // 获取所有调用密钥
    const { data, error } = await supabase
      .from('access_keys')
      .select('id, lpb_key, created_at, is_active')
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch access keys' });
    }
    
    // 获取每个密钥的调用次数
    const keysWithCount = await Promise.all((data || []).map(async (key) => {
      const { count } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('access_key_id', key.id);
      
      return {
        ...key,
        request_count: count || 0
      };
    }));
    
    return res.status(200).json({ keys: keysWithCount });
  }
  
  if (req.method === 'POST') {
    // 添加新的调用密钥
    const { lpb_key } = req.body;
    
    if (!lpb_key || !lpb_key.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid key format' });
    }
    
    const { data, error } = await supabase
      .from('access_keys')
      .insert([{
        lpb_key,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // unique constraint violation
        return res.status(400).json({ error: '密钥已存在' });
      }
      return res.status(500).json({ error: 'Failed to add access key' });
    }
    
    return res.status(201).json(data);
  }
  
  if (req.method === 'PUT') {
    // 更新调用密钥状态
    const { id, is_active } = req.body;
    
    const { data, error } = await supabase
      .from('access_keys')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to update access key' });
    }
    
    return res.status(200).json(data);
  }
  
  if (req.method === 'DELETE') {
    // 删除调用密钥
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Missing key ID' });
    }
    
    const { error } = await supabase
      .from('access_keys')
      .delete()
      .eq('id', id);
    
    if (error) {
      return res.status(500).json({ error: 'Failed to delete access key' });
    }
    
    return res.status(200).json({ success: true });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}