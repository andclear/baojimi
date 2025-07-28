import { supabase } from './supabaseClient';

// 流式传输配置接口
export interface StreamingConfig {
  enabled: boolean;
  fake_stream_enabled: boolean;
}

// 系统设置接口
export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 获取系统设置
 * @param settingKey 设置键名
 * @returns 设置值（已解析的JSON对象）
 */
export async function getSystemSetting<T = any>(settingKey: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', settingKey)
      .single();

    if (error) {
      console.error(`Failed to get system setting ${settingKey}:`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    return JSON.parse(data.setting_value);
  } catch (error) {
    console.error(`Error parsing system setting ${settingKey}:`, error);
    return null;
  }
}

/**
 * 更新系统设置
 * @param settingKey 设置键名
 * @param settingValue 设置值（将被JSON序列化）
 * @param description 可选的描述
 * @returns 是否成功
 */
export async function updateSystemSetting(
  settingKey: string,
  settingValue: any,
  description?: string
): Promise<boolean> {
  try {
    console.log(`[SETTINGS] Updating setting: ${settingKey}`, settingValue);
    
    const updateData: any = {
      setting_value: JSON.stringify(settingValue),
      updated_at: new Date().toISOString(),
    };

    if (description !== undefined) {
      updateData.description = description;
    }

    console.log(`[SETTINGS] Update data for ${settingKey}:`, updateData);

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        setting_key: settingKey,
        ...updateData,
      }, {
        onConflict: 'setting_key'
      });

    if (error) {
      console.error(`[SETTINGS] Failed to update system setting ${settingKey}:`, error);
      console.error(`[SETTINGS] Error details:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return false;
    }

    console.log(`[SETTINGS] Successfully updated setting: ${settingKey}`);
    return true;
  } catch (error) {
    console.error(`[SETTINGS] Error updating system setting ${settingKey}:`, error);
    return false;
  }
}

/**
 * 获取流式传输配置
 * @returns 流式传输配置
 */
export async function getStreamingConfig(): Promise<StreamingConfig> {
  const config = await getSystemSetting<StreamingConfig>('streaming_config');
  
  // 返回默认配置如果获取失败
  return config || {
    enabled: true,
    fake_stream_enabled: false,
  };
}

/**
 * 更新流式传输配置
 * @param config 新的流式传输配置
 * @returns 是否成功
 */
export async function updateStreamingConfig(config: StreamingConfig): Promise<boolean> {
  return updateSystemSetting(
    'streaming_config',
    config,
    '流式传输配置：enabled-是否启用真实流式传输，fake_stream_enabled-是否启用伪装流式传输（两者互斥）'
  );
}

/**
 * 获取所有系统设置
 * @returns 所有系统设置列表
 */
export async function getAllSystemSettings(): Promise<SystemSetting[]> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('setting_key');

    if (error) {
      console.error('Failed to get all system settings:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting all system settings:', error);
    return [];
  }
}

/**
 * 获取伪装信息设置
 * @returns 是否启用伪装信息功能
 */
export async function getDisguiseEnabled(): Promise<boolean> {
  try {
    console.log('[DISGUISE] Checking disguise enabled setting...');
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'disguise_enabled')
      .single();

    if (error) {
      console.error('[DISGUISE] 获取伪装信息设置失败:', error);
      console.log('[DISGUISE] Using default value: true');
      return true; // 默认启用
    }

    const enabled = data?.setting_value === 'true';
    console.log(`[DISGUISE] Retrieved setting value: ${data?.setting_value}, enabled: ${enabled}`);
    return enabled;
  } catch (error) {
    console.error('[DISGUISE] 获取伪装信息设置异常:', error);
    console.log('[DISGUISE] Using default value: true');
    return true; // 默认启用
  }
}

/**
 * 更新伪装信息设置
 * @param enabled 是否启用伪装信息功能
 * @returns 是否成功
 */
export async function updateDisguiseEnabled(enabled: boolean): Promise<boolean> {
  try {
    console.log('[DISGUISE] Updating disguise enabled setting:', enabled);
    
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        setting_key: 'disguise_enabled',
        setting_value: enabled.toString(),
        description: '是否启用伪装信息功能，在请求中添加随机字符串',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'setting_key'
      });

    if (error) {
      console.error('[DISGUISE] 更新伪装信息设置失败:', error);
      return false;
    }

    console.log('[DISGUISE] Successfully updated disguise enabled setting');
    return true;
  } catch (error) {
    console.error('[DISGUISE] 更新伪装信息设置异常:', error);
    return false;
  }
}

/**
 * 生成6位随机伪装字符串
 */
export function generateDisguiseString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}