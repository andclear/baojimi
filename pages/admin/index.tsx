import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  Key, 
  Settings, 
  Activity, 
  Users, 
  BarChart3, 
  Clock, 
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Eye,
  EyeOff,
  CheckCircle,
  Trash2,
  AlertCircle,
  ChevronDown
} from 'lucide-react';

interface DashboardStats {
  totalCalls: number;
  refreshPeriodCalls: number;
  activeKeys: number;
  totalKeys: number;
  keyUsage: any[];
}

interface LogEntry {
  id: number;
  timestamp: string;
  ip_address: string;
  model_requested: string;
  response_status_code: number;
  duration_ms: number;
  is_stream: boolean;
  error_message?: string;
  gemini_keys?: {
    id: string;
    key_suffix: string;
    api_key: string;
  };
  access_keys?: {
    id: string;
    comment: string;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(() => null as DashboardStats | null);
  const [logs, setLogs] = useState(() => [] as LogEntry[]);
  const [loading, setLoading] = useState(() => true);
  const [error, setError] = useState(() => null as string | null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState(() => null as LogEntry | null);
  const [showModal, setShowModal] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(20); // 每页显示20条日志
  const [showAllErrors, setShowAllErrors] = useState(false); // 错误信息折叠状态
  const [lastCallCount, setLastCallCount] = useState(0); // 记录上次的调用总数
  const [checkInterval, setCheckInterval] = useState<NodeJS.Timeout | null>(null); // 检查间隔

  useEffect(() => {
    setIsLoaded(true);
    fetchDashboardData();
    
    // 设置轻量级检查机制，只检查调用总数是否有变化
    if (autoRefresh) {
      const interval = setInterval(async () => {
        await checkForNewCalls();
      }, 10000); // 每10秒检查一次是否有新调用
      setCheckInterval(interval);
    }
    
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [autoRefresh]);

  // 轻量级检查是否有新的 API 调用
  const checkForNewCalls = async () => {
    try {
      const response = await fetch('/api/admin/call-count', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const currentCallCount = data.totalCalls;
        
        // 如果调用总数有变化，则刷新完整数据
        if (lastCallCount > 0 && currentCallCount > lastCallCount) {
          console.log('Frontend: New API calls detected, refreshing dashboard data...');
          await fetchDashboardData();
        }
        
        setLastCallCount(currentCallCount);
      }
    } catch (error) {
      console.error('Frontend: Failed to check for new calls:', error);
      // 检查失败时不做任何操作，避免频繁错误
    }
  };

  const fetchDashboardData = async () => {
    try {
      setError(null);
      console.log('Frontend: Starting dashboard data fetch...');
      
      const response = await fetch('/api/admin/dashboard', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      console.log('Frontend: Response received, status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Frontend: API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Frontend: Data parsed successfully:', { 
        statsExists: !!data.stats, 
        logsCount: data.logs?.length || 0 
      });
      
      // 确保数据结构正确
      if (data.stats) {
        setStats(data.stats);
        // 更新调用计数记录
        setLastCallCount(data.stats.totalCalls || 0);
        console.log('Frontend: Stats updated, total calls:', data.stats.totalCalls);
      }
      if (data.logs) {
        setLogs(data.logs);
        console.log('Frontend: Logs updated');
      }
    } catch (error) {
      console.error('Frontend: Failed to fetch dashboard data:', error);
      console.error('Frontend: Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      setError('数据加载失败，请检查网络连接或稍后重试');
      // 保持默认值，不更新 stats 和 logs
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-50';
    if (status >= 400 && status < 500) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const openLogDetails = (log: LogEntry) => {
    setSelectedLog(log);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedLog(null);
  };

  const clearAllLogs = async () => {
    setClearingLogs(true);
    setShowClearConfirm(false);
    
    try {
      const response = await fetch('/api/admin/clear-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('清除日志失败');
      }

      const result = await response.json();
      
      // 清除成功后刷新数据
      await fetchDashboardData();
      
      // 显示成功消息
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
      
    } catch (error: any) {
      console.error('Error clearing logs:', error);
      setError(error.message || '清除日志失败');
    } finally {
      setClearingLogs(false);
    }
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
        <title>管理后台 - Baojimi</title>
        <meta name="description" content="Baojimi API代理服务管理后台" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
                <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm sm:text-base hidden sm:block">
                  返回首页
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* 页面标题 */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">仪表盘</h1>
            <p className="text-gray-600 text-sm sm:text-lg">监控和管理您的API代理服务</p>
          </div>
            
          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-red-400">⚠️</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                  <button
                    onClick={fetchDashboardData}
                    className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                  >
                    重新加载
                  </button>
                </div>
              </div>
            </div>
          )}
            
          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                {
                  title: '总调用次数',
                  value: formatNumber(stats.totalCalls),
                  icon: <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />,
                  gradient: 'from-blue-500 to-cyan-500',
                  bgGradient: 'from-blue-50 to-cyan-50'
                },
                {
                  title: '自刷新额度起调用次数',
                  value: formatNumber(stats.refreshPeriodCalls),
                  subtitle: '每日14:00-次日13:59',
                  icon: <Clock className="w-5 h-5 sm:w-6 sm:h-6" />,
                  gradient: 'from-orange-500 to-red-500',
                  bgGradient: 'from-orange-50 to-red-50'
                },
                {
                  title: '可用密钥',
                  value: stats.activeKeys.toString(),
                  icon: <Key className="w-5 h-5 sm:w-6 sm:h-6" />,
                  gradient: 'from-green-500 to-emerald-500',
                  bgGradient: 'from-green-50 to-emerald-50'
                },
                {
                  title: '总密钥数',
                  value: stats.totalKeys.toString(),
                  icon: <Shield className="w-5 h-5 sm:w-6 sm:h-6" />,
                  gradient: 'from-purple-500 to-pink-500',
                  bgGradient: 'from-purple-50 to-pink-50'
                }
              ].map((stat, index) => (
                <div
                  key={index}
                  className={`bg-gradient-to-br ${stat.bgGradient} rounded-xl p-3 sm:p-4 shadow-md border border-white/50`}
                >
                  <div className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-r ${stat.gradient} text-white mb-2 sm:mb-3 shadow-md`}>
                    {stat.icon}
                  </div>
                  <h3 className="text-xs font-medium text-gray-600 mb-1">{stat.title}</h3>
                  {stat.subtitle && (
                    <p className="text-xs text-gray-500 mb-1 hidden sm:block">{stat.subtitle}</p>
                  )}
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* 快捷操作 */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">快捷操作</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {[
                {
                  title: 'Gemini Keys 管理',
                  description: '管理和配置 Gemini API Key',
                  href: '/admin/gemini-keys',
                  icon: <Settings className="w-5 h-5" />,
                  bgColor: 'bg-blue-100',
                  iconColor: 'bg-blue-600',
                  textColor: 'text-blue-700'
                },
                {
                  title: '管理调用密钥',
                  description: '就是你的API调用密钥',
                  href: '/admin/access-keys',
                  icon: <Key className="w-5 h-5" />,
                  bgColor: 'bg-green-100',
                  iconColor: 'bg-green-600',
                  textColor: 'text-green-700'
                },
                {
                  title: '系统设置',
                  description: '也不知道成没成的设置',
                  href: '/admin/settings',
                  icon: <Settings className="w-5 h-5" />,
                  bgColor: 'bg-purple-100',
                  iconColor: 'bg-purple-600',
                  textColor: 'text-purple-700'
                }
              ].map((action, index) => (
                <Link
                  key={index}
                  href={action.href}
                  className={`${action.bgColor} rounded-lg p-3 sm:p-4 border border-gray-300 hover:shadow-lg transition-all duration-200 hover:scale-105`}
                >
                  <div className="flex items-start space-x-2 sm:space-x-3">
                    <div className={`${action.iconColor} text-white p-1.5 sm:p-2 rounded-lg shadow-md`}>
                      {action.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                        {action.title}
                      </h3>
                      <p className="text-gray-700 text-xs sm:text-sm mb-2">
                        {action.description}
                      </p>
                      <div className={`flex items-center text-xs sm:text-sm font-medium ${action.textColor}`}>
                        <span>立即访问</span>
                        <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* 最近调用日志 */}
          <div className="mb-6 sm:mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-indigo-600 text-white">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-gray-900">最近调用日志</h2>
                      <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">最新的API调用记录，隔断时间记得清理一下</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    {/* 清除日志按钮 */}
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={clearingLogs || logs.length === 0}
                      className="inline-flex items-center px-2 sm:px-3 py-1.5 sm:py-2 border border-red-300 shadow-sm text-xs sm:text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      {clearingLogs ? '清除中...' : '清除日志'}
                    </button>
                    {/* 自动刷新开关 */}
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm text-gray-600">智能刷新</span>
                      <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`relative inline-flex h-5 w-9 sm:h-6 sm:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                          autoRefresh ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}
                        title={autoRefresh ? '已启用智能刷新：检测到新调用时自动刷新' : '已禁用自动刷新'}
                      >
                        <span
                          className={`inline-block h-3 w-3 sm:h-4 sm:w-4 transform rounded-full bg-white transition-transform ${
                            autoRefresh ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      {autoRefresh && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full hidden sm:inline">
                          仅在有新调用时刷新
                        </span>
                      )}
                    </div>
                    {/* 手动刷新按钮 */}
                    <button
                      onClick={fetchDashboardData}
                      className="inline-flex items-center px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 shadow-sm text-xs sm:text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                    >
                      <Activity className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      刷新
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                {logs.length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <Activity className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                    <p className="text-sm sm:text-base text-gray-500">暂无调用记录</p>
                  </div>
                ) : (
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">模型</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP地址</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">响应时间</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">类型</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        const startIndex = (currentPage - 1) * logsPerPage;
                        const endIndex = startIndex + logsPerPage;
                        const currentLogs = logs.slice(startIndex, endIndex);
                        
                        return currentLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                            <div className="sm:hidden">
                              {new Date(log.timestamp).toLocaleString('zh-CN', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                            <div className="hidden sm:block">
                              {new Date(log.timestamp).toLocaleString('zh-CN')}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 font-mono hidden sm:table-cell">
                            {log.model_requested || 'gemini-pro'}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 font-mono">
                            <div className="sm:hidden">
                              {log.ip_address.split('.').slice(-2).join('.')}
                            </div>
                            <div className="hidden sm:block">
                              {log.ip_address}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.response_status_code)}`}>
                              {log.response_status_code}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 hidden lg:table-cell">
                            {(log.duration_ms / 1000).toFixed(2)}s
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden md:table-cell">
                            <span className={`inline-flex items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.is_stream ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {log.is_stream ? '流式' : '非流式'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                            <button
                              onClick={() => openLogDetails(log)}
                              className="inline-flex items-center px-2 sm:px-3 py-1 border border-transparent text-xs font-medium rounded-md text-indigo-600 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">详情</span>
                            </button>
                          </td>
                        </tr>
                      ));
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* 分页组件 */}
              {logs.length > logsPerPage && (
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
                    <div className="text-xs sm:text-sm text-gray-700">
                      显示第 {((currentPage - 1) * logsPerPage) + 1} - {Math.min(currentPage * logsPerPage, logs.length)} 条，
                      共 {logs.length} 条日志
                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium ${
                          currentPage === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="sm:hidden">上页</span>
                        <span className="hidden sm:inline">上一页</span>
                      </button>
                      
                      {/* 页码显示 */}
                      <div className="flex items-center space-x-1">
                        {(() => {
                          const totalPages = Math.ceil(logs.length / logsPerPage);
                          const pages = [];
                          const maxVisiblePages = 5;
                          
                          let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                          let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                          
                          if (endPage - startPage + 1 < maxVisiblePages) {
                            startPage = Math.max(1, endPage - maxVisiblePages + 1);
                          }
                          
                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium ${
                                  i === currentPage
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {i}
                              </button>
                            );
                          }
                          
                          return pages;
                        })()}
                      </div>
                      
                      <button
                        onClick={() => setCurrentPage(Math.min(Math.ceil(logs.length / logsPerPage), currentPage + 1))}
                        disabled={currentPage === Math.ceil(logs.length / logsPerPage)}
                        className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium ${
                          currentPage === Math.ceil(logs.length / logsPerPage)
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="sm:hidden">下页</span>
                        <span className="hidden sm:inline">下一页</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {logs.some(log => log.error_message) && (
                <div className="px-6 py-4 bg-red-50 border-t border-red-200">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-red-800 hover:text-red-900 transition-colors duration-200">
                      <span className="flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        错误信息 ({logs.filter(log => log.error_message).length} 条)
                      </span>
                      <ChevronDown className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const errorLogs = logs.filter(log => log.error_message).slice(0, 10);
                        return errorLogs.map((log) => (
                          <div key={log.id} className="bg-white rounded-lg p-3 border border-red-200">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-xs text-red-500 mb-1">
                                  {new Date(log.timestamp).toLocaleString('zh-CN')}
                                </div>
                                <div className="text-sm text-red-700 break-words">
                                  {log.error_message}
                                </div>
                              </div>
                              <button
                                onClick={() => openLogDetails(log)}
                                className="ml-3 text-xs text-red-600 hover:text-red-800 underline flex-shrink-0"
                              >
                                查看详情
                              </button>
                            </div>
                          </div>
                        ));
                      })()}
                      {logs.filter(log => log.error_message).length > 10 && (
                        <div className="text-xs text-red-500 text-center py-2">
                          仅显示最新的10条错误信息
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* 详情弹窗 */}
        {showModal && selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">调用详情</h3>
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">调用时间</label>
                    <p className="text-sm text-gray-900">{new Date(selectedLog.timestamp).toLocaleString('zh-CN')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IP地址</label>
                    <p className="text-sm text-gray-900 font-mono">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">请求模型</label>
                    <p className="text-sm text-gray-900 font-mono">{selectedLog.model_requested || 'gemini-pro'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">响应时间</label>
                    <p className="text-sm text-gray-900">{(selectedLog.duration_ms / 1000).toFixed(2)}s</p>
                  </div>
                </div>

                {/* 状态信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">响应状态</label>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedLog.response_status_code)}`}>
                      {selectedLog.response_status_code}
                      {selectedLog.response_status_code >= 200 && selectedLog.response_status_code < 300 ? ' (成功)' : ' (失败)'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">调用类型</label>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      selectedLog.is_stream ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedLog.is_stream ? '流式调用' : '非流式调用'}
                    </span>
                  </div>
                </div>

                {/* Gemini Key 信息 */}
                {selectedLog.gemini_keys && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">使用的 Gemini Key</label>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Key ID: {selectedLog.gemini_keys.id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">完整 API Key:</p>
                          <p className="text-sm text-gray-900 font-mono break-all bg-white p-2 rounded border">
                            {selectedLog.gemini_keys.api_key}
                          </p>
                        </div>
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-sm">已使用</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 错误信息 */}
                {selectedLog.error_message && (
                  <div>
                    <label className="block text-sm font-medium text-red-700 mb-2">错误详情</label>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800 whitespace-pre-wrap">{selectedLog.error_message}</p>
                    </div>
                  </div>
                )}

                {/* 成功提示 */}
                {selectedLog.response_status_code >= 200 && selectedLog.response_status_code < 300 && !selectedLog.error_message && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                      <p className="text-sm text-green-800 font-medium">调用成功完成</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200">
                <button
                  onClick={closeModal}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 清除日志确认模态框 */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">确认清除日志</h3>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <Trash2 className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-900">
                      确定要清除所有调用日志吗？
                    </p>
                    <p className="text-sm text-red-600 mt-1">
                      此操作不可撤销，将删除所有历史调用记录。
                    </p>
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-yellow-400">⚠️</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-800">
                        当前共有 <span className="font-semibold">{logs.length}</span> 条日志记录将被删除
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex space-x-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
                >
                  取消
                </button>
                <button
                  onClick={clearAllLogs}
                  disabled={clearingLogs}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearingLogs ? '清除中...' : '确认清除'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 成功消息提示 */}
        {showSuccessMessage && (
          <div className="fixed top-4 right-4 z-50">
            <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 max-w-sm">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    所有日志已成功清除
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    页面将自动刷新数据
                  </p>
                </div>
                <div className="ml-4">
                  <button
                    onClick={() => setShowSuccessMessage(false)}
                    className="text-green-400 hover:text-green-600 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}