import { NextPageContext } from 'next'
import Head from 'next/head'
import Link from 'next/link'

interface ErrorProps {
  statusCode?: number
  hasGetInitialPropsRun?: boolean
  err?: Error
}

function Error({ statusCode, hasGetInitialPropsRun, err }: ErrorProps) {
  return (
    <>
      <Head>
        <title>
          {statusCode
            ? `${statusCode} - 服务器错误`
            : '客户端错误'}
        </title>
      </Head>
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-gray-900 mb-4">
                {statusCode || '错误'}
              </h1>
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                {statusCode
                  ? statusCode === 404
                    ? '页面未找到'
                    : statusCode === 500
                    ? '服务器内部错误'
                    : '服务器错误'
                  : '客户端错误'}
              </h2>
              <p className="text-gray-600 mb-8">
                {statusCode === 404
                  ? '抱歉，您访问的页面不存在。'
                  : '抱歉，服务器遇到了一些问题。'}
              </p>
              <div className="space-y-4">
                <Link
                  href="/"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  返回首页
                </Link>
                <Link
                  href="/admin"
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  管理后台
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error