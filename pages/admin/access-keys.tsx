import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Key, 
  Activity, 
  AlertCircle,
  CheckCircle,
  Shield,
  Clock,
  Settings,
  Info,
  Shuffle,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';

interface AccessKey {
  id: string;
  lpb_key: string;
  created_at: string;
  is_active: boolean;
  request_count: number;
}

export default function AccessKeysPage() {
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsLoaded(true);
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const response = await fetch('/api/admin/access-keys');
      if (response.ok) {
        const data = await response.json();
        setKeys(data.keys || []);
      } else {
        setError('获取调用密钥列表失败');
      }
    } catch (error) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 生成随机密钥
  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'sk-';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewKey(result);
  };

  const addKey = async () => {
    if (!newKey.trim()) return;

    try {
      const response = await fetch('/api/admin/access-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lpb_key: newKey.trim() }),
      });

      if (response.ok) {
        setNewKey('');
        fetchKeys();
      } else {
        const errorData = await response.json();
        setError(errorData.error || '添加调用密钥失败');
      }
    } catch (error) {
      setError('网络错误');
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('确定要删除这个调用密钥吗？')) return;

    try {
      const response = await fetch('/api/admin/access-keys', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        fetchKeys();
      } else {
        setError('删除调用密钥失败');
      }
    } catch (error) {
      setError('网络错误');
    }
  };

  // 复制密钥到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 可以添加一个临时的成功提示
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 切换密钥可见性
  const toggleKeyVisibility = (keyId: string) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId);
    } else {
      newVisibleKeys.add(keyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  // 格式化密钥显示
  const formatKey = (key: string, keyId: string) => {
    if (!key) return ''; // 添加空值检查
    if (visibleKeys.has(keyId)) {
      return key;
    }
    return `${key.substring(0, 3)}${'*'.repeat(key.length - 7)}${key.substring(key.length - 4)}`;
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
        <title>管理调用密钥 - 管理后台</title>
        <meta name="description" content="管理用户访问密钥和权限" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 导航栏 */}
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <img 
                  src="https://cdn.jsdelivr.net/gh/andclear/touxiang@main/assets/avatars/lpb.jpg" 
                  alt="Baojimi Logo" 
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full ring-2 ring-white shadow-lg"
                />
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Baojimi
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">也管不了啥的管理后台</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link href="/admin" className="text-gray-600 hover:text-gray-900 text-sm sm:text-base">
                  仪表盘
                </Link>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/admin/logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      if (response.ok) {
                        window.location.href = '/';
                      }
                    } catch (error) {
                      console.error('退出登录失败:', error);
                    }
                  }}
                  className="text-gray-600 hover:text-gray-900 font-medium text-sm sm:text-base"
                >
                  退出
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* 页面标题 */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">调用密钥管理</h1>
            <p className="text-gray-600 text-sm sm:text-lg">管理API调用密钥，控制访问权限</p>
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

          {/* 安全提示 */}
          <div className="mb-6 sm:mb-8 bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400" />
              </div>
              <div className="ml-2 sm:ml-3">
                <h3 className="text-xs sm:text-sm font-medium text-yellow-800">安全提示</h3>
                <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-yellow-700">
                  <p>请妥善保管您的调用密钥，不要在公开场所分享。建议定期更换密钥以确保安全。</p>
                  <p className="hidden sm:block">这里的密钥就是你的轮询调用密钥，和调用地址一起就能和AI交互啦。</p>
                </div>
              </div>
            </div>
          </div>

          {/* 添加密钥区域 */}
          <div className={`mb-6 sm:mb-8 transform transition-all duration-1000 delay-200 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200/50">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">添加新密钥</h2>
                    <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">创建新的 API 调用密钥</p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0">
                    <div className="flex-1">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        调用密钥（sk-开头，16位字符）
                      </label>
                      <input
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="输入 API Key 或点击随机生成"
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-sm"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <button
                        onClick={generateRandomKey}
                        className="px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center space-x-2 text-sm"
                      >
                        <Shuffle className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>随机生成</span>
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={addKey}
                    disabled={!newKey.trim()}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg sm:rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 inline mr-2" />
                    添加密钥
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 密钥列表 */}
          <div className={`transform transition-all duration-1000 delay-300 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200/50">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
                    <Key className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">密钥列表</h2>
                    <p className="text-xs sm:text-sm text-gray-600">共 {keys.length} 个密钥，{keys.filter(k => k.is_active).length} 个活跃</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                {keys.length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <Key className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                    <p className="text-gray-500 text-base sm:text-lg">暂无调用密钥</p>
                    <p className="text-gray-400 text-xs sm:text-sm">添加您的第一个 API 调用密钥</p>
                  </div>
                ) : (
                  <>
                    <div className="block sm:hidden">
                      {/* 移动端卡片布局 */}
                      <div className="space-y-3 p-4">
                        {keys.map((key) => (
                          <div key={key.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <code className="text-xs font-mono bg-white px-2 py-1 rounded border truncate">
                                    {formatKey(key.lpb_key, key.id)}
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
                                  <button
                                    onClick={() => copyToClipboard(key.lpb_key)}
                                    className="text-gray-400 hover:text-gray-600 p-1"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex items-center space-x-3 text-xs text-gray-600">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    key.is_active 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {key.is_active ? (
                                      <>
                                        <CheckCircle className="w-2 h-2 mr-1" />
                                        活跃
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="w-2 h-2 mr-1" />
                                        禁用
                                      </>
                                    )}
                                  </span>
                                  <span className="flex items-center">
                                    <Activity className="w-3 h-3 text-blue-500 mr-1" />
                                    {key.request_count || 0}次
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteKey(key.id)}
                                className="text-red-600 hover:text-red-800 p-1 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-xs text-gray-500">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(key.created_at).toLocaleString('zh-CN', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <table className="min-w-full hidden sm:table">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-4 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">调用密钥</th>
                          <th className="px-4 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                          <th className="px-4 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">调用次数</th>
                          <th className="px-4 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">创建时间</th>
                          <th className="px-4 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200/50">
                        {keys.map((key) => (
                          <tr key={key.id} className="hover:bg-gray-50/50 transition-colors duration-200">
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2 sm:space-x-3">
                                <code className="text-xs sm:text-sm font-mono bg-gray-100 px-2 sm:px-3 py-1 rounded-lg">
                                  {formatKey(key.lpb_key, key.id)}
                                </code>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => toggleKeyVisibility(key.id)}
                                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded"
                                    title={visibleKeys.has(key.id) ? "隐藏密钥" : "显示密钥"}
                                  >
                                    {visibleKeys.has(key.id) ? (
                                      <EyeOff className="w-3 h-3 sm:w-4 sm:h-4" />
                                    ) : (
                                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(key.lpb_key)}
                                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded"
                                    title="复制密钥"
                                  >
                                    <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                key.is_active 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {key.is_active ? (
                                  <>
                                    <CheckCircle className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                    活跃
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                                    禁用
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                              <div className="flex items-center space-x-1">
                                <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
                                <span>{key.request_count || 0}</span>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 hidden lg:table-cell">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                <span>{new Date(key.created_at).toLocaleString('zh-CN')}</span>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                              <button
                                onClick={() => deleteKey(key.id)}
                                className="text-red-600 hover:text-red-800 transition-colors duration-200 p-1 sm:p-2 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}