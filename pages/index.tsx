import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { ArrowRight, Copy, Check } from 'lucide-react';

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    setIsLoaded(true);
    // 获取当前页面的域名
    if (typeof window !== 'undefined') {
      setApiUrl(`${window.location.origin}/api/v1`);
    }
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(apiUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <>
      <Head>
        <title>Baojimi - 智能API代理服务</title>
        <meta name="description" content="高效、安全、稳定的AI API代理服务" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>

        {/* 导航栏 */}
        <nav className="relative z-10 px-4 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
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
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">网络上最不专业的Gemini轮询</p>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="relative z-10 px-4 sm:px-6 py-8 sm:py-12">
          <div className="max-w-7xl mx-auto">
            {/* Hero Section */}
            <div className={`text-center mb-12 sm:mb-16 transform transition-all duration-1000 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>

              
              <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6 leading-tight">
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Baojimi
                </span>
                <br />
              </h1>
              
              <p className="text-base sm:text-xl md:text-2xl text-gray-600 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4">
                基于Vercel优化的轮询服务，由 老婆宝 构建
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center px-4">
                <a
                  href="/admin"
                  className="group relative w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold text-base sm:text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center justify-center space-x-2">
                    <span>开始使用</span>
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </a>
                
              </div>
            </div>

            {/* 调用地址 */}
            <div className={`max-w-4xl mx-auto mb-12 sm:mb-16 transform transition-all duration-1000 delay-200 ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-8 border border-gray-200/50 mx-4 sm:mx-0">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">调用地址</h2>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-xl border border-blue-200/50">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <code className="text-sm sm:text-lg font-mono text-blue-800 block mb-2 break-all">
                        {apiUrl || '/api/v1'}
                      </code>
                      <p className="text-xs sm:text-sm text-blue-600">OpenAI 兼容的 API 调用地址</p>
                    </div>
                    <button
                      onClick={copyToClipboard}
                      disabled={!apiUrl}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span className="text-sm">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span className="text-sm">复制</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* 页脚 */}
        <footer className="relative z-10 px-4 sm:px-6 py-6 sm:py-8 mt-12 sm:mt-16">
          <div className="max-w-7xl mx-auto text-center">
            <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
              <img 
                src="https://cdn.jsdelivr.net/gh/andclear/touxiang@main/assets/avatars/lpb.jpg" 
                alt="Baojimi Logo" 
                className="w-6 h-6 sm:w-8 sm:h-8 rounded-full ring-2 ring-white shadow-lg"
              />
              <span className="text-base sm:text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Baojimi
              </span>
            </div>
            <p className="text-sm sm:text-base text-gray-600 px-4">
              © 2025 Baojimi. 绝对不专业的gemini轮询服务系统
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}