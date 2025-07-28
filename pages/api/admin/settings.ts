import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getStreamingConfig, 
  updateStreamingConfig, 
  StreamingConfig,
  getDisguiseEnabled,
  updateDisguiseEnabled 
} from '@/lib/settings-manager';
import { ApiError } from '@/lib/config';

// 扩展的配置接口，包含伪装信息设置
interface ExtendedConfig extends StreamingConfig {
  disguise_enabled: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // 获取流式传输配置和伪装信息设置
      const streamingConfig = await getStreamingConfig();
      const disguiseEnabled = await getDisguiseEnabled();
      
      const config: ExtendedConfig = {
        ...streamingConfig,
        disguise_enabled: disguiseEnabled
      };
      
      return res.status(200).json({
        success: true,
        data: config
      });
    } else if (req.method === 'PUT') {
      console.log('Settings PUT request received:', req.body);
      
      // 更新流式传输配置和伪装信息设置
      const { enabled, fake_stream_enabled, disguise_enabled } = req.body;

      console.log('Parsed values:', { enabled, fake_stream_enabled, disguise_enabled });

      // 验证输入
      if (typeof enabled !== 'boolean') {
        console.error('Validation error: enabled is not boolean:', typeof enabled, enabled);
        throw new ApiError(400, 'enabled must be a boolean');
      }

      if (typeof fake_stream_enabled !== 'boolean') {
        console.error('Validation error: fake_stream_enabled is not boolean:', typeof fake_stream_enabled, fake_stream_enabled);
        throw new ApiError(400, 'fake_stream_enabled must be a boolean');
      }

      if (typeof disguise_enabled !== 'boolean') {
        console.error('Validation error: disguise_enabled is not boolean:', typeof disguise_enabled, disguise_enabled);
        throw new ApiError(400, 'disguise_enabled must be a boolean');
      }

      // 验证互斥逻辑：enabled 和 fake_stream_enabled 不能同时为 true
      if (enabled && fake_stream_enabled) {
        console.error('Validation error: both enabled and fake_stream_enabled are true');
        throw new ApiError(400, '真实流式传输和伪装流式传输不能同时启用');
      }

      // 更新流式传输配置
      const streamingConfig: StreamingConfig = {
        enabled,
        fake_stream_enabled
      };

      console.log('Updating streaming config:', streamingConfig);
      const streamingSuccess = await updateStreamingConfig(streamingConfig);
      console.log('Streaming config update result:', streamingSuccess);
      
      console.log('Updating disguise enabled:', disguise_enabled);
      const disguiseSuccess = await updateDisguiseEnabled(disguise_enabled);
      console.log('Disguise enabled update result:', disguiseSuccess);
      
      if (!streamingSuccess || !disguiseSuccess) {
        console.error('Update failed - streaming:', streamingSuccess, 'disguise:', disguiseSuccess);
        throw new ApiError(500, 'Failed to update configuration');
      }

      const newConfig: ExtendedConfig = {
        ...streamingConfig,
        disguise_enabled
      };

      return res.status(200).json({
        success: true,
        message: 'Configuration updated successfully',
        data: newConfig
      });
    } else {
      throw new ApiError(405, 'Method not allowed');
    }
  } catch (error) {
    console.error('Settings API Error:', error);
    
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      apiError = new ApiError(500, 'Internal server error');
    }
    
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }
}