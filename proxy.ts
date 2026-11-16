/**
 * proxy.ts — Separação das versões 2D e Arena (Opção B).
 *
 * O mesmo repositório publica dois projetos Vercel, diferenciados pela
 * variável de ambiente APP_VARIANT:
 *
 *   - Sem APP_VARIANT (ou "2d"): projeto do jogo 2D. A rota /arena é
 *     redirecionada para o domínio da Arena (ARENA_URL).
 *   - APP_VARIANT="arena": projeto da Arena. A raiz "/" vira "/arena" e
 *     rotas do jogo 2D (ex.: /wiki) são redirecionadas para o domínio do 2D
 *     (GAME2D_URL). /login é local (sessão por domínio).
 *
 * ADITIVO: não altera nenhuma página existente — só separa o tráfego.
 */

import { NextResponse, type NextRequest } from 'next/server';

const GAME2D_URL = process.env.GAME2D_URL || 'https://aetheria-idle.vercel.app';
const ARENA_URL = process.env.ARENA_URL || 'https://aetheria-arena.vercel.app';

function redirectTo(request: NextRequest, base: string, path: string) {
  const baseNormalized = base.replace(/\/$/, '');
  return NextResponse.redirect(new URL(baseNormalized + path, request.url));
}

/** Projeto do jogo 2D (comportamento default). */
function handle2d(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/arena' || path.startsWith('/arena/')) {
    return redirectTo(request, ARENA_URL, path);
  }
  return NextResponse.next();
}

/** Projeto da Arena (APP_VARIANT=arena). */
function handleArena(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Login é local na Arena (a sessão fica em localStorage por domínio).
  if (path === '/login' || path.startsWith('/login/')) {
    return NextResponse.next();
  }

  if (path === '/arena' || path.startsWith('/arena/')) {
    return NextResponse.next();
  }

  // A raiz vira /arena (a arena é o jogo principal).
  if (path === '/') {
    return redirectTo(request, request.nextUrl.origin, '/arena');
  }

  // Rotas exclusivas do jogo 2D (ex.: /wiki) pertencem ao projeto do 2D.
  return redirectTo(request, GAME2D_URL, path);
}

export function proxy(request: NextRequest) {
  // No dev local rodamos tudo local (sem separação de domínios).
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  const variant = process.env.APP_VARIANT || '2d';
  return variant === 'arena' ? handleArena(request) : handle2d(request);
}

export const config = {
  // Ignora Next internals, favicon, modelos 3D e qualquer arquivo estático
  // (qualquer segmento com ponto, ex.: .glb, .css, .js de assets).
  matcher: '/((?!_next|favicon.ico|models|robots.txt|.*\\..*).*)',
};