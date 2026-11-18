import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/** One browser client using the signed-in user's JWT. RLS decides what it can see. */
export const supabase = createClient(env.supabaseUrl || 'http://localhost:54321', env.anonKey || 'public-anon-key-placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
