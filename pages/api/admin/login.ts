import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { password } = req.body;
  
  if (!password || password !== process.env.PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  // 设置认证 cookie
  res.setHeader('Set-Cookie', [
    'auth-token=true; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict'
  ]);
  
  return res.status(200).json({ success: true });
}