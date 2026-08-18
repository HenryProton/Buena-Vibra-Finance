import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const request = getRequest();
  const token = request?.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!url || !key || !token) throw new Error('Unauthorized');

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error('Unauthorized');

  return next({
    context: {
      supabase: client,
      userId: data.user.id,
      claims: { sub: data.user.id, email: data.user.email },
    },
  });
});
