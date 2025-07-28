import { supabase } from './supabaseClient';
import { kv } from '@vercel/kv';
import { ApiError } from './config';
import crypto from 'crypto';

const CACHE_KEY = 'gemini_keys_cache';
const CACHE_TTL = 300; // 5 minutes

interface GeminiKey {
  id: string;
  api_key: string;
}

// 从数据库获取可用的 Gemini Keys
async function fetchKeysFromDb(): Promise<GeminiKey[]> {
  const { data, error } = await supabase
    .from('gemini_keys')
    .select('id, api_key')
    .eq('is_active', true)
    .eq('is_valid', true);
  
  if (error) {
    console.error('Failed to fetch keys from database:', error);
    return [];
  }
  
  return data || [];
}

// 获取所有可用的 Gemini Keys（用于轮询）
export async function getAllAvailableGeminiKeys(): Promise<GeminiKey[]> {
  try {
    let keys: GeminiKey[];
    
    // 在开发环境中跳过缓存，直接从数据库获取
    if (process.env.NODE_ENV === 'development') {
      keys = await fetchKeysFromDb();
    } else {
      // 生产环境使用缓存
      try {
        const cachedKeys = await kv.get<GeminiKey[]>(CACHE_KEY);
        
        if (cachedKeys && cachedKeys.length > 0) {
          keys = cachedKeys;
        } else {
          // 缓存未命中，从数据库获取
          keys = await fetchKeysFromDb();
          if (keys.length > 0) {
            // 更新缓存
            await kv.setex(CACHE_KEY, CACHE_TTL, keys);
          }
        }
      } catch (cacheError) {
        console.warn('Cache error, falling back to database:', cacheError);
        keys = await fetchKeysFromDb();
      }
    }
    
    if (keys.length === 0) {
      throw new ApiError(503);
    }
    
    return keys;
    
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error getting available Gemini keys:', error);
    throw new ApiError(500);
  }
}

// 获取可用的 Gemini Key（带缓存）- 保持向后兼容
export async function getAvailableGeminiKey(): Promise<{ keyId: string; apiKey: string }> {
  const keys = await getAllAvailableGeminiKeys();
  
  // 简单轮询选择
  const randomIndex = Math.floor(Math.random() * keys.length);
  const selectedKey = keys[randomIndex];
  return {
    keyId: selectedKey.id,
    apiKey: selectedKey.api_key
  };
}

// 标记key为无效
export async function markKeyAsInvalid(keyId: string, errorMessage?: string) {
  try {
    await supabase
      .from('gemini_keys')
      .update({ 
        is_valid: false,
        last_used_at: new Date().toISOString()
      })
      .eq('id', keyId);
    
    console.log(`Marked key ${keyId} as invalid: ${errorMessage || 'Unknown error'}`);
    
    // 清除缓存，强制下次重新获取
    if (process.env.NODE_ENV !== 'development') {
      try {
        await kv.del(CACHE_KEY);
      } catch (cacheError) {
        console.warn('Failed to clear cache:', cacheError);
      }
    }
  } catch (error) {
    console.error('Error marking key as invalid:', error);
  }
}

// 验证项目访问密钥
export async function validateAccessKey(apiKey: string): Promise<string | null> {
  if (!apiKey || !apiKey.startsWith('sk-')) {
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('access_keys')
      .select('id')
      .eq('lpb_key', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data.id;
  } catch (error) {
    console.error('Error validating access key:', error);
    return null;
  }
}

// 更新 Gemini Key 使用统计
export async function updateKeyUsage(keyId: string) {
  try {
    await supabase.rpc('increment_key_request_count', { key_id: keyId });
  } catch (error) {
    console.error('Error updating key usage:', error);
  }
}