import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  // dev-time only diagnostic — avoid crashing SSR
  console.error('[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check .env.local');
}

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  { auth: { persistSession: true, detectSessionInUrl: true } },
);

export interface AuthProbe {
  user: User | null;
  error: Error | null;
  /** true quando o servidor de autenticação não respondeu a tempo. */
  timedOut: boolean;
}

/**
 * Verifica a sessão com **tempo limite**. Sem isso, uma rede que bloqueia
 * o Supabase (Wi-Fi corporativo, DNS, firewall) deixa a tela em
 * "carregando" para sempre. Com o timeout, caímos no login/erro de conexão.
 */
export async function getUserWithTimeout(timeoutMs = 20000): Promise<AuthProbe> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<AuthProbe>((resolve) => {
    timer = setTimeout(() => resolve({ user: null, error: null, timedOut: true }), timeoutMs);
  });

  try {
    return await Promise.race<AuthProbe>([
      supabase.auth.getUser().then(({ data, error }) => ({
        user: data.user ?? null,
        error: (error as Error | null) ?? null,
        timedOut: false,
      })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}