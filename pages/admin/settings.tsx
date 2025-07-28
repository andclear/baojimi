import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Settings, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface StreamingConfig {
  enabled: boolean;
  fake_stream_enabled: boolean;
  disguise_enabled: boolean;
}

export default function SystemSettings() {
  const [config, setConfig] = useState<StreamingConfig>({
    enabled: true,
    fake_stream_enabled: false,
    disguise_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      if (response.ok) {
        const result = await response.json();
        setConfig(result.data);
      } else {
        setMessage({ type: 'error', text: '加载配置失败' });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage({ type: 'error', text: '加载配置时发生错误' });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: '配置保存成功' });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || '保存配置失败' });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: '保存配置时发生错误' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfigChange = (key: keyof StreamingConfig, value: any) => {
    setConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      
      // 实现互斥逻辑：启用流式传输和启用伪装流式传输只能二选一
      if (key === 'enabled' && value === true) {
        newConfig.fake_stream_enabled = false;
      } else if (key === 'fake_stream_enabled' && value === true) {
        newConfig.enabled = false;
      }
      
      return newConfig;
    });
    setMessage(null); // 清除之前的消息
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>系统设置 - 管理后台</title>
          <meta name="description" content="系统设置和配置" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-gray-600">加载中...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>系统设置 - 管理后台</title>
        <meta name="description" content="系统设置和配置" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 导航栏 */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link href="/admin" className="flex items-center space-x-2 text-gray-700 hover:text-gray-900">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="font-medium">返回仪表盘</span>
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                <Link href="/" className="text-gray-600 hover:text-gray-900">
                  返回首页
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 页面标题 */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
                <p className="mt-2 text-gray-600">大部分是实验性功能</p>
              </div>
            </div>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* 流式传输设置 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">流式传输设置</h2>
              <p className="text-sm text-gray-600 mt-1">
                配置API响应的流式传输模式。
              </p>
            </div>

            <div className="px-6 py-6 space-y-6">
              {/* 启用流式传输 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">启用流式传输</label>
                  <p className="text-sm text-gray-500">真流式传输，数据实时推送</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* 启用伪装流式传输 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">启用伪装流式传输</label>
                  <p className="text-sm text-gray-500">只和gemini模拟流式交互，用户端是完全的非流式。逗逗gemini的呀</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.fake_stream_enabled}
                    onChange={(e) => handleConfigChange('fake_stream_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* 互斥提示 */}
              {config.enabled && config.fake_stream_enabled && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    ⚠️ 注意：真实流式传输和伪装流式传输不能同时启用，请选择其中一种模式。
                  </p>
                </div>
              )}

              {/* 启用伪装信息 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">启用伪装信息</label>
                  <p className="text-sm text-gray-500">发送给Gemini的消息中添加6位随机字符串，酒馆开，其他关。</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.disguise_enabled}
                    onChange={(e) => handleConfigChange('disguise_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* 说明信息 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">配置说明</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li> 因为Vercel本身的限制，所以流式传输不生效很正常！会自动降级到非流式。</li>
                </ul>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    保存设置
                  </>
                )}
              </button>
            </div>
          </div>
        </main>

        {/* 页脚 */}
        <footer className="bg-white border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center">
              <p className="text-gray-500 text-sm">
                © 2024 Baojimi. 保留所有权利。
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}