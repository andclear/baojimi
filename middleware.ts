import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // 检查是否是管理后台路径（除了登录页）
  if (request.nextUrl.pathname.startsWith('/admin') && 
      !request.nextUrl.pathname.startsWith('/admin/login')) {
    
    // 检查认证 cookie
    const authToken = request.cookies.get('auth-token');
    
    if (!authToken || authToken.value !== 'true') {
      // 重定向到登录页
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*'
};