
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;

        if (data.session) {
          router.replace('/');
          return;
        }

        setMessage(
          'Cadastro iniciado! Confira seu e-mail para confirmar a conta e depois entre.'
        );
      } else {
        // Tempo limite: rede que bloqueia o Supabase não pode travar o botão.
        const signIn = supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        const timeout = new Promise<{ error: Error }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                error: new Error(
                  'O servidor de login não respondeu. Verifique sua conexão com a internet e tente novamente.',
                ),
              }),
            15000,
          ),
        );

        const { error } = await Promise.race([signIn, timeout]);

        if (error) throw error;

        router.replace('/');
        return;
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro inesperado.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-8"
      >
        <h1 className="text-center text-3xl font-bold">Aetheria</h1>

        <p className="text-center text-slate-400">
          {isSignup ? 'Crie sua conta de aventureiro' : 'Entre na sua conta'}
        </p>

        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white"
            placeholder="voce@exemplo.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm">
            Senha (mínimo de 6 caracteres)
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white"
            placeholder="Sua senha"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 p-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading
            ? 'Aguarde...'
            : isSignup
              ? 'Criar conta'
              : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsSignup(!isSignup);
            setMessage('');
          }}
          className="w-full text-sm text-indigo-300 hover:text-indigo-200"
        >
          {isSignup
            ? 'Já tem uma conta? Entrar'
            : 'Ainda não tem conta? Cadastrar'}
        </button>

        {message && (
          <p role="status" className="break-words text-sm text-amber-300">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
