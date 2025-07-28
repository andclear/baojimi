import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Key, 
  Activity, 
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Upload,
  Download,
  Settings,
  Play,
  Loader
} from 'lucide-react';

interface GeminiKey {
  id: number;
  api_key: string;
  key_suffix: string;
  request_count: number;
  is_active: boolean;
  is_valid: boolean;
  created_at: string;
  last_used_at: string | null;
  stats?: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    successRate: string;
  };
}

export default function GeminiKeysManagement() {
  const [keys, setKeys] = useState(() => [] as GeminiKey[]);
  const [loading, setLoading] = useState(() => true);
  const [error, setError] = useState(() => null as string | null);
  const [newKeys, setNewKeys] = useState(() => '');
  const [adding, setAdding] = useState(() => false);
  const [visibleKeys, setVisibleKeys] = useState(() => new Set<number>());
  const [isLoaded, setIsLoaded] = useState(false);
  const [testing, setTesting] = useState(() => false);
  const [testResult, setTestResult] = useState(() => null as { total: number; success: number; failed: number } | null);
  const [showExportModal, setShowExportModal] = useState(() => false);
  const [showResetConfirm, setShowResetConfirm] = useState(() => false);
  const [resetting, setResetting] = useState(() => false);
  const [statsMode, setStatsMode] = useState<'all' | 'today'>('all');
  const [showStatsTooltip, setShowStatsTooltip] = useState(() => false);

  useEffect(() => {
    setIsLoaded(true);
    fetchKeys();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      fetchKeys();
    }
  }, [statsMode]);

  const fetchKeys = async () => {
    try {
      setError(null);
      const url = `/api/admin/gemini-keys${statsMode === 'today' ? '?mode=today' : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to fetch keys:', error);
      setError('获取密钥列表失败');
    } finally {
      setLoading(false);
    }
  };

  const addKeys = async () => {
    if (!newKeys.trim()) return;
    
    setAdding(true);
    try {
      // 按行分割密钥，过滤空行
      const keyList = newKeys.split('\n')
        .map(key => key.trim())
        .filter(key => key.length > 0);
      
      if (keyList.length === 0) {
        throw new Error('请输入至少一个有效的密钥');
      }
      
      const response = await fetch('/api/admin/gemini-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keyList })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add keys');
      }
      
      const result = await response.json();
      setNewKeys('');
      await fetchKeys();
      setError(null);
      // 显示成功消息
      alert(`成功添加 ${result.added} 个密钥`);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setAdding(false);
    }
  };

  const toggleKeyStatus = async (id: number, isActive: boolean) => {
    try {
      const response = await fetch('/api/admin/gemini-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !isActive })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update key status');
      }
      
      await fetchKeys();
    } catch (error) {
      setError('更新密钥状态失败');
    }
  };

  const deleteKey = async (id: number) => {
    if (!confirm('确定要删除这个密钥吗？')) return;
    
    try {
      const response = await fetch('/api/admin/gemini-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete key');
      }
      
      await fetchKeys();
    } catch (error) {
      setError('删除密钥失败');
    }
  };

  const toggleKeyVisibility = (keyId: number) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId);
    } else {
      newVisibleKeys.add(keyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const testAllKeys = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/test-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('测试请求失败');
      }
      
      const result = await response.json();
      setTestResult({
        total: result.total,
        success: result.success,
        failed: result.failed
      });
      
      // 刷新密钥列表以更新统计数据
      await fetchKeys();
      
    } catch (error: any) {
      setError(error.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const resetAllStats = async () => {
    setResetting(true);
    setShowResetConfirm(false);
    
    try {
      const response = await fetch('/api/admin/reset-key-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('重置统计失败');
      }
      
      const result = await response.json();
      
      // 刷新密钥列表以更新统计数据
      await fetchKeys();
      
      // 显示成功消息
      alert(`成功重置了 ${result.affected} 个密钥的调用记录`);
      
    } catch (error: any) {
      setError(error.message || '重置统计失败');
    } finally {
      setResetting(false);
    }
  };

  const exportKeys = (format: 'comma' | 'newline') => {
    if (keys.length === 0) {
      setError('没有可导出的密钥');
      return;
    }

    // 获取所有API Keys
    const apiKeys = keys.map(key => key.api_key);
    
    // 根据格式生成内容
    const content = format === 'comma' 
      ? apiKeys.join(',')
      : apiKeys.join('\n');
    
    // 生成文件名
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const filename = `keys_${year}${month}${day}.txt`;
    
    // 创建并下载文件
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setShowExportModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg font-medium text-gray-700">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Gemini Keys 管理 - 管理后台</title>
        <meta name="description" content="管理 Gemini API 密钥" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 导航栏 */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex justify-between h-14 sm:h-16">
              <div className="flex items-center">
                <Link href="/admin" className="flex items-center space-x-1 sm:space-x-2 text-gray-700 hover:text-gray-900">
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-medium text-sm sm:text-base">返回仪表盘</span>
                </Link>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link href="/" className="text-gray-600 hover:text-gray-900 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 rounded-lg hover:bg-gray-100">
                  返回首页
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          {/* 页面标题 */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Gemini Keys 管理</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600">在这里添加或者删除你的密钥</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">错误</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 批量添加新密钥 */}
          <div className={`mb-6 sm:mb-8 transform transition-all duration-1000 delay-200 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200/50">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">批量添加 Gemini API Keys</h2>
                    <p className="text-xs sm:text-sm text-gray-600">输入官方Gemini API Key (以 AIza 开头)，支持批量添加，每行一个！</p>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4">
                  <textarea
                    value={newKeys}
                    onChange={(e) => setNewKeys(e.target.value)}
                    placeholder={`AIzaxxxx
AIzaxxxx
AIzaxxxx`}
                    rows={6}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 font-mono text-xs sm:text-sm"
                  />
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <span className="text-xs sm:text-sm text-gray-500 flex items-center space-x-2">
                      <Key className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>{newKeys.split('\n').filter(key => key.trim().length > 0).length} 个密钥待添加</span>
                    </span>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                      <button
                        onClick={() => setShowExportModal(true)}
                        disabled={keys.length === 0}
                        className="group relative px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden text-sm"
                      >
                        <span className="relative z-10 flex items-center justify-center space-x-2">
                          <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">导出所有API Keys</span>
                          <span className="sm:hidden">导出Keys</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </button>
                      <button
                        onClick={addKeys}
                        disabled={adding || !newKeys.trim()}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
                      >
                        <Upload className="w-3 h-3 sm:w-4 sm:h-4 inline mr-2" />
                        {adding ? '添加中...' : '批量添加'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 密钥列表 */}
          <div className={`transform transition-all duration-1000 delay-300 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
                      <Key className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-gray-900">密钥列表</h2>

                      <p className="text-sm text-gray-600">共 {keys.length} 个密钥，{keys.filter(k => k.is_active && k.is_valid).length} 个活跃</p>
                    </div>
                  </div>
                  
                  {/* 统计模式开关和按钮区域 */}
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    {/* 统计模式开关 */}
                    <div className="relative">
                      <div className="flex items-center space-x-2 sm:space-x-3 bg-gray-50 rounded-lg sm:rounded-xl p-1">
                        <button
                          onClick={() => setStatsMode('all')}
                          className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                            statsMode === 'all'
                              ? 'bg-white text-indigo-600 shadow-md'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          统计所有
                        </button>
                        <button
                          onClick={() => {
                            setStatsMode('today');
                            setShowStatsTooltip(true);
                            setTimeout(() => setShowStatsTooltip(false), 3000);
                          }}
                          className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 ${
                            statsMode === 'today'
                              ? 'bg-white text-indigo-600 shadow-md'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          统计当日
                        </button>
                      </div>
                      
                      {/* 浮动提示 */}
                      {showStatsTooltip && (
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-10">
                          <div className="bg-blue-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                            该功能只统计下午2点开始的调用次数
                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-600 rotate-45"></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {testResult && (
                      <div className="text-xs sm:text-sm bg-gray-50 rounded-lg px-3 sm:px-4 py-2 border">
                        <span className="text-gray-600">测试结果：</span>
                        <span className="font-medium text-gray-900">共测试 {testResult.total} 个key，</span>
                        <span className="text-green-600 font-medium">成功 {testResult.success} 个，</span>
                        <span className="text-red-600 font-medium">失败 {testResult.failed} 个</span>
                      </div>
                    )}
                    
                    {/* 按钮组 */}
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                      {/* 重置统计按钮 */}
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        disabled={resetting || keys.length === 0}
                        className="group relative px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden text-sm"
                      >
                        <span className="relative z-10 flex items-center justify-center space-x-2">
                          <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">重置统计</span>
                          <span className="sm:hidden">重置</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-600 to-gray-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </button>
                      
                      <button
                        onClick={testAllKeys}
                        disabled={testing || keys.filter(k => k.is_active).length === 0}
                        className="group relative px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden text-sm"
                      >
                        <span className="relative z-10 flex items-center justify-center space-x-2">
                          {testing ? (
                            <Loader className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 sm:w-4 sm:h-4" />
                          )}
                          <span>{testing ? '测试中...' : '一键测试'}</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200/50">
                {keys.map((key) => (
                  <div key={key.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-gray-50/50 transition-colors duration-200">
                    {/* 移动端卡片布局 */}
                    <div className="block sm:hidden">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                key.is_active && key.is_valid 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {key.is_active && key.is_valid ? (
                                  <>
                                    <CheckCircle className="w-2 h-2 mr-1" />
                                    活跃
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-2 h-2 mr-1" />
                                    停用
                                  </>
                                )}
                              </span>
                              <div className="flex items-center space-x-1">
                                <Activity className="w-3 h-3 text-blue-500" />
                                <span className="text-xs text-gray-600">{key.request_count}次</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 mb-2">
                              <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border truncate flex-1">
                                {visibleKeys.has(key.id) ? key.api_key : `...${key.key_suffix}`}
                              </code>
                              <button
                                onClick={() => toggleKeyVisibility(key.id)}
                                className="text-gray-400 hover:text-gray-600 p-1"
                              >
                                {visibleKeys.has(key.id) ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <div className="text-xs text-gray-500">
                              创建时间: {new Date(key.created_at).toLocaleString('zh-CN', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col space-y-1 ml-2">
                            <button
                              onClick={() => toggleKeyStatus(key.id, key.is_active)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                                key.is_active
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {key.is_active ? '停用' : '启用'}
                            </button>
                            <button
                              onClick={() => deleteKey(key.id)}
                              className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all duration-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {/* 统计信息 */}
                        {key.stats && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg px-2 py-1">
                              <div className="text-xs text-blue-600 font-medium">总调用</div>
                              <div className="text-sm font-bold text-blue-800">{key.stats.totalCalls}</div>
                            </div>
                            <div className="bg-green-50 rounded-lg px-2 py-1">
                              <div className="text-xs text-green-600 font-medium">成功</div>
                              <div className="text-sm font-bold text-green-800">{key.stats.successCalls}</div>
                            </div>
                            <div className="bg-red-50 rounded-lg px-2 py-1">
                              <div className="text-xs text-red-600 font-medium">失败</div>
                              <div className="text-sm font-bold text-red-800">{key.stats.failedCalls}</div>
                            </div>
                            <div className="bg-purple-50 rounded-lg px-2 py-1">
                              <div className="text-xs text-purple-600 font-medium">成功率</div>
                              <div className="text-sm font-bold text-purple-800">{key.stats.successRate}%</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 桌面端表格布局 */}
                    <div className="hidden sm:flex items-center justify-between">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="flex-shrink-0">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            key.is_active && key.is_valid 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {key.is_active && key.is_valid ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                活跃
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 mr-1" />
                                停用
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <code className="text-sm font-mono bg-gray-100 px-3 py-1 rounded-lg">
                              {visibleKeys.has(key.id) ? key.api_key : `...${key.key_suffix}`}
                            </code>
                            <button
                              onClick={() => toggleKeyVisibility(key.id)}
                              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                              title={visibleKeys.has(key.id) ? '隐藏密钥' : '显示密钥'}
                            >
                              {visibleKeys.has(key.id) ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <div className="text-sm text-gray-500 mt-1 flex items-center space-x-4">
                            <div className="flex items-center space-x-1">
                              <Activity className="w-4 h-4 text-blue-500" />
                              <span>使用次数: {key.request_count}</span>
                            </div>
                            <span className="hidden lg:inline">创建时间: {new Date(key.created_at).toLocaleString('zh-CN')}</span>
                          </div>
                          {/* 统计信息 */}
                          {key.stats && (
                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="bg-blue-50 rounded-lg px-3 py-2">
                                <div className="text-xs text-blue-600 font-medium">总调用</div>
                                <div className="text-sm font-bold text-blue-800">{key.stats.totalCalls}</div>
                              </div>
                              <div className="bg-green-50 rounded-lg px-3 py-2">
                                <div className="text-xs text-green-600 font-medium">成功</div>
                                <div className="text-sm font-bold text-green-800">{key.stats.successCalls}</div>
                              </div>
                              <div className="bg-red-50 rounded-lg px-3 py-2">
                                <div className="text-xs text-red-600 font-medium">失败</div>
                                <div className="text-sm font-bold text-red-800">{key.stats.failedCalls}</div>
                              </div>
                              <div className="bg-purple-50 rounded-lg px-3 py-2">
                                <div className="text-xs text-purple-600 font-medium">成功率</div>
                                <div className="text-sm font-bold text-purple-800">{key.stats.successRate}%</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => toggleKeyStatus(key.id, key.is_active)}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                            key.is_active
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-md'
                              : 'bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-md'
                          }`}
                        >
                          {key.is_active ? '停用' : '启用'}
                        </button>
                        <button
                          onClick={() => deleteKey(key.id)}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-xl transition-all duration-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {keys.length === 0 && (
                  <div className="text-center py-8 sm:py-12">
                    <Key className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-base sm:text-lg">暂无 Gemini API Keys</p>
                    <p className="text-gray-400 text-xs sm:text-sm">添加您的第一个 Gemini API 密钥</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* 重置确认模态框 */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/50 p-6 max-w-md w-full mx-4 transform transition-all duration-300">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-white shadow-lg mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">重置所有统计数据</h3>
              <p className="text-gray-600 text-sm">此操作将清除所有密钥的调用记录和统计数据</p>
              <p className="text-red-500 text-xs mt-2 font-medium">⚠️ 此操作不可撤销</p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-300"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await resetAllStats();
                  setShowResetConfirm(false);
                }}
                disabled={resetting}
                className="flex-1 group relative px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center space-x-2">
                  {resetting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>重置中...</span>
                    </>
                  ) : (
                    <>
                      <Settings className="w-4 h-4" />
                      <span>确认重置</span>
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出模态框 */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/50 p-6 max-w-md w-full mx-4 transform transition-all duration-300">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg mb-4">
                <Download className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">导出 API Keys</h3>
              <p className="text-gray-600 text-sm">选择导出格式，将下载为 keys_年月日.txt 文件</p>
              <p className="text-gray-500 text-xs mt-1">共 {keys.length} 个密钥</p>
            </div>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => exportKeys('comma')}
                className="w-full group relative px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center space-x-2">
                  <span>使用 "," 分隔每个key</span>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
              
              <button
                onClick={() => exportKeys('newline')}
                className="w-full group relative px-6 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center space-x-2">
                  <span>每个key单独一行</span>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
            
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-300"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}