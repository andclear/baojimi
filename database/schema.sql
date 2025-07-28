-- Baojimi 数据库 Schema
-- 在 Supabase Console 的 SQL Editor 中执行此脚本

-- Table 1: access_keys - 项目访问密钥 (sk-xxxx)
CREATE TABLE public.access_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  lpb_key text NOT NULL UNIQUE, -- 存储明文密钥
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

COMMENT ON COLUMN public.access_keys.lpb_key IS '存储 sk-xxxx 密钥的明文，用于验证';

-- Table 2: gemini_keys - Google Gemini API Key
CREATE TABLE public.gemini_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  api_key text NOT NULL, -- 存储原始的 Gemini API Key
  key_suffix character varying(4) NOT NULL, -- Key 的最后四位，用于安全显示
  is_active boolean DEFAULT true NOT NULL, -- 是否参与负载均衡
  is_valid boolean DEFAULT true NOT NULL, -- 健康检查是否通过
  request_count bigint DEFAULT 0 NOT NULL, -- 该 Key 的总调用次数
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.gemini_keys.api_key IS '存储原始的 Google Gemini API Key，请务必确保数据库访问安全';

-- Table 3: call_logs - API 调用日志
CREATE TABLE public.call_logs (
  id bigserial NOT NULL PRIMARY KEY,
  timestamp timestamp with time zone DEFAULT now() NOT NULL,
  ip_address text,
  access_key_id uuid REFERENCES public.access_keys(id) ON DELETE SET NULL,
  gemini_key_id uuid REFERENCES public.gemini_keys(id) ON DELETE SET NULL,
  model_requested text,
  response_status_code integer,
  duration_ms integer, -- 请求耗时(毫秒)
  is_stream boolean,
  error_message text
);

-- 创建索引以提高查询性能
CREATE INDEX idx_call_logs_timestamp ON public.call_logs(timestamp DESC);

-- Function 1: increment_key_request_count - 原子化更新调用次数
CREATE OR REPLACE FUNCTION increment_key_request_count(key_id uuid)
RETURNS void AS $$
  UPDATE public.gemini_keys
  SET
    request_count = request_count + 1,
    last_used_at = now()
  WHERE id = key_id;
$$ LANGUAGE sql;

-- Table 4: system_settings - 系统设置
CREATE TABLE public.system_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  setting_key text NOT NULL UNIQUE, -- 设置项的键名
  setting_value text NOT NULL, -- 设置项的值（JSON格式）
  description text, -- 设置项描述
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.system_settings IS '系统设置表，存储各种配置参数';
COMMENT ON COLUMN public.system_settings.setting_key IS '设置项的唯一键名';
COMMENT ON COLUMN public.system_settings.setting_value IS '设置项的值，使用JSON格式存储复杂数据';

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_system_settings_updated_at 
    BEFORE UPDATE ON public.system_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认的系统设置
INSERT INTO public.system_settings (setting_key, setting_value, description) 
VALUES 
  (
    'streaming_config',
    '{"enabled": true, "fake_stream_enabled": false}',
    '流式传输配置：enabled-是否启用真实流式传输，fake_stream_enabled-是否启用伪装流式传输（两者互斥）'
  ),
  (
    'disguise_enabled',
    'true',
    '是否启用伪装信息功能，在请求中添加随机字符串'
  )
ON CONFLICT (setting_key) DO NOTHING;

-- 插入默认的访问密钥（如果设置了 DEFAULT_ACCESS_KEY 环境变量）
-- 注意：这里使用明文存储，实际部署时会通过应用程序逻辑插入
INSERT INTO public.access_keys (lpb_key, is_active) 
VALUES (
  'sk-laopobao12345', 
  true
) ON CONFLICT (lpb_key) DO NOTHING;