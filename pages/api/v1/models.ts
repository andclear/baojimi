import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // 获取可用的 Gemini API Key
    const { data: geminiKeys, error } = await supabase
      .from('gemini_keys')
      .select('api_key')
      .eq('is_active', true)
      .limit(1);
    
    if (error || !geminiKeys || geminiKeys.length === 0) {
      // 没有可用的 Gemini API Key，返回空列表
      return res.status(200).json({
        object: 'list',
        data: []
      });
    }
    
    const apiKey = geminiKeys[0].api_key;
    
    // 调用 Google 官方 API 获取真实模型列表
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch models from Google API:', response.status, response.statusText);
      // API 调用失败，返回空列表
      return res.status(200).json({
        object: 'list',
        data: []
      });
    }
    
    const googleResponse = await response.json();
    
    // 转换 Google API 响应格式为 OpenAI 兼容格式
    const models = (googleResponse.models || [])
      .filter((model: any) => model.name && model.name.includes('gemini'))
      .map((model: any) => {
        // 提取模型名称，去掉 "models/" 前缀
        const modelId = model.name.replace('models/', '');
        
        return {
          id: modelId,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google',
          permission: [],
          root: modelId,
          parent: null
        };
      });
    
    return res.status(200).json({
      object: 'list',
      data: models
    });
    
  } catch (error) {
    console.error('Error fetching models:', error);
    // 发生错误时返回空列表
    return res.status(200).json({
      object: 'list',
      data: []
    });
  }
}