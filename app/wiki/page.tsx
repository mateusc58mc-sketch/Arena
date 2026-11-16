'use client';

import React from 'react';
import Link from 'next/link';

export default function WikiPage() {
  const racesList = [
    { name: 'Humano', bonus: 'Espírito Humano', desc: 'Versátil. Ganho extra de +10% de Ouro e XP ao caçar monstros na Torre.' },
    { name: 'Anão', bonus: 'Pele de Pedra', desc: 'Alta resistência física e redução no custo de recursos/ouro ao utilizar a Forja de Refino.' },
    { name: 'Elfo', bonus: 'Agilidade Ancestral', desc: 'Especialista em esquiva física, precisão e maior taxa de acerto Crítico.' },
    { name: 'Goblin', bonus: 'Mão de Midas', desc: 'Vantagens comerciais, descontos com NPCs e maior valor na venda de itens.' },
    { name: 'Orc', bonus: 'Fúria Bruta', desc: 'Poder de ataque físico e dano crítico corpo a corpo elevados.' },
    { name: 'Morto-vivo', bonus: 'Toque da Morte', desc: 'Regenera vida drenando uma percentagem do dano causado aos inimigos (Roubo de Vida).' },
    { name: 'Troll', bonus: 'Berserker', desc: 'Aumento massivo na Velocidade de Ataque (ASPD) quando a vida fica abaixo de 50%.' },
    { name: 'Tauren', bonus: 'Robustez Tauren', desc: 'Vida máxima (HP) colossal e resistência a danos físicos elevados.' },
    { name: 'Pandaren', bonus: 'Caminho Interno', desc: 'Elevada regeneração de Mana (MP) por segundo e maior eficácia ao consumir poções.' },
  ];

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-y-auto p-6 select-none">
      
      {/* Cabeçalho da Wiki */}
      <header className="max-w-4xl mx-auto w-full flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div>
          <span className="text-xs uppercase font-extrabold text-amber-500 tracking-widest">PROJECT AETHERIA</span>
          <h1 className="text-2xl font-extrabold text-slate-100">📖 BÍBLIA & WIKI DO JOGO</h1>
        </div>
        <Link 
          href="/"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all border border-slate-700"
        >
          ← Voltar para o Jogo
        </Link>
      </header>

      {/* Conteúdo Principal da Wiki */}
      <main className="max-w-4xl mx-auto w-full space-y-6">
        
        {/* Seção 1: Raças do Jogo */}
        <section className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">🧬 1. Raças & Bônus Passivos Raciais</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {racesList.map((race) => (
              <div key={race.name} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-400 block">{race.name}</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold block mb-1">Passiva: {race.bonus}</span>
                  <p className="text-[11px] text-slate-400 leading-tight">{race.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Seção 2: O Mundo & Torre */}
        <section className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-2">🏰 2. O Mundo: Torre de Aetheria (Infinita / Estilo SAO)</h2>
          <p className="text-xs text-slate-300 leading-relaxed mb-3">
            O universo do jogo baseia-se em andares escalonados. Cada andar possui um bioma único, monstros comuns e um **Chefe Guardião**.
          </p>
          <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
            <li>Derrotar o Guardião do Andar desbloqueia permanentemente o acesso ao próximo nível.</li>
            <li>O modo de caça contínua (*Idle*) permite acumular XP, Ouro e itens raros automaticamente.</li>
            <li><strong>Inventário:</strong> Limite máximo fixo de 2.000 unidades por conta/personagem.</li>
          </ul>
        </section>

        {/* Seção 3: Atributos Base (Ragnarök) */}
        <section className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-2">📊 3. Sistema de Atributos Base (Ragnarök Online)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-amber-300 block">FOR (Força)</span>
              <span className="text-[11px] text-slate-400">Aumenta o Dano Físico corpo a corpo.</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-amber-300 block">AGI (Agilidade)</span>
              <span className="text-[11px] text-slate-400">Aumenta a Velocidade de Ataque (ASPD) e a Esquiva física.</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-amber-300 block">VIT (Vitalidade)</span>
              <span className="text-[11px] text-slate-400">Aumenta o HP Máximo e a Defesa física/mágica.</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-amber-300 block">INT (Inteligência)</span>
              <span className="text-[11px] text-slate-400">Aumenta o Dano Mágico (ATQM) e o SP Máximo.</span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}