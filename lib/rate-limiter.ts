import { kv } from '@vercel/kv';
import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest } from 'next/server';
import { ApiError } from './config';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(
    parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '30', 10), 
    '60 s'
  ),
  analytics: true,
  prefix: 'ratelimit_baojimi',
});

export async function checkRateLimit(req: NextRequest) {
  const ip = req.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    throw new ApiError(429);
  }
}