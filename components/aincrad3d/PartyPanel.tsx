'use client';

/**
 * PartyPanel — painel de party/squad multiplayer (Fase P2).
 *
 * O jogador real entra em uma party identificada por um código de convite
 * de 6 caracteres. O limite de andar (max_floor) é o maior `tower_floor`
 * entre membros REAIS — bots de IA nunca entram em `party_members`, então
 * não interfere no limite. Recalculado automaticamente por trigger no banco.
 *
 * ADITIVO: componente novo; não altera combate nem o jogo original.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './Arena.module.css';

type PartyInfo = {
  id: string;
  inviteCode: string;
  leaderId: string;
  maxFloor: number;
};

type PartyMemberInfo = {
  characterId: string;
  name: string;
  className: string;
  race: string;
  level: number;
  towerFloor: number;
  statsSummary: string;
  isLeader: boolean;
};

type PartyPanelProps = {
  open: boolean;
  onClose: () => void;
  characterId: string;
  characterName: string;
  towerFloor: number;
};

// Alfabeto sem caracteres ambíguos (sem O/0, I/1, etc.).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export default function PartyPanel({
  open,
  onClose,
  characterId,
  characterName,
  towerFloor,
}: PartyPanelProps) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [party, setParty] = useState<PartyInfo | null>(null);
  const [members, setMembers] = useState<PartyMemberInfo[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const describeError = (error: { code?: string; message?: string }, fallback: string) => {
    if (error.code === '23505') return 'Você já está em uma party. Saia dela antes de trocar.';
    return `${fallback}${error.message ? `: ${error.message}` : ''}`;
  };

  const loadParty = useCallback(async () => {
    if (!characterId || characterId === 'demo') return;
    setLoading(true);
    try {
      // Roster completo via RPC (security definer): contorna o RLS de
      // characters, que filtrava o personagem de OUTROS jogadores.
      const { data, error } = await supabase.rpc('party_roster', {
        p_character_id: characterId,
      });
      if (error) throw error;

      const payload = (data ?? {}) as {
        party: { id: string; invite_code: string; leader_id: string; max_floor: number } | null;
        members:
          | Array<{
              character_id: string;
              name: string;
              class_name: string;
              race: string;
              level: number;
              tower_floor: number;
              str: number;
              agi: number;
              vit: number;
              int_stat: number;
              dex: number;
              luk: number;
              is_leader: boolean;
            }>
          | null;
      };

      if (!payload.party) {
        setParty(null);
        setMembers([]);
        return;
      }

      setParty({
        id: payload.party.id,
        inviteCode: payload.party.invite_code,
        leaderId: payload.party.leader_id,
        maxFloor: payload.party.max_floor ?? 1,
      });

      setMembers(
        (payload.members ?? []).map((row) => ({
          characterId: String(row.character_id),
          name: row.name ?? '?',
          className: row.class_name ?? '—',
          race: row.race ?? '',
          level: row.level ?? 1,
          towerFloor: row.tower_floor ?? 1,
          statsSummary: `FOR ${row.str ?? 0} · AGI ${row.agi ?? 0} · VIT ${row.vit ?? 0} · INT ${row.int_stat ?? 0} · DES ${row.dex ?? 0} · LUK ${row.luk ?? 0}`,
          isLeader: Boolean(row.is_leader),
        })),
      );
    } catch (error) {
      const err = error as { message?: string };
      setMessage(`Falha ao carregar a party${err.message ? `: ${err.message}` : ''}`);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (open) void loadParty();
  }, [open, loadParty]);

  // Realtime: alguém entrou/saiu → recarrega o painel de quem estiver aberto.
  useEffect(() => {
    if (!open || !party?.id) return;
    const channel = supabase
      .channel(`party-board-${party.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${party.id}`,
        },
        () => {
          void loadParty();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, party?.id, loadParty]);

  const handleCreate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Tenta até 5 códigos em caso de colisão de invite_code (raríssima).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateInviteCode();
        const { data: created, error } = await supabase
          .from('parties')
          .insert({ invite_code: code, leader_id: characterId })
          .select('id')
          .maybeSingle();

        if (error) {
          // Colisão de código: sorteia outro e tenta de novo.
          if (error.code === '23505') continue;
          throw error;
        }
        if (!created) continue;

        const { error: joinError } = await supabase
          .from('party_members')
          .insert({ party_id: created.id, character_id: characterId });
        if (joinError) throw joinError;

        setMessage(`Party criada! Convide com o código ${code}.`);
        break;
      }
      await loadParty();
    } catch (error) {
      const err = error as { code?: string; message?: string };
      setMessage(describeError(err, 'Falha ao criar a party'));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setMessage('Digite o código de 6 caracteres.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { data: target, error: findError } = await supabase
        .from('parties')
        .select('id')
        .eq('invite_code', code)
        .maybeSingle();
      if (findError) throw findError;
      if (!target) {
        setMessage('Código inválido ou party inexistente.');
        return;
      }

      const { error } = await supabase
        .from('party_members')
        .insert({ party_id: target.id, character_id: characterId });
      if (error) throw error;

      setJoinCode('');
      await loadParty();
    } catch (error) {
      const err = error as { code?: string; message?: string };
      setMessage(describeError(err, 'Falha ao entrar na party'));
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!party) return;
    setBusy(true);
    setMessage(null);
    try {
      if (party.leaderId === characterId) {
        // O líder encerrando desfaz a party (membros saem por cascade).
        const { error } = await supabase.from('parties').delete().eq('id', party.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('party_members')
          .delete()
          .eq('character_id', characterId);
        if (error) throw error;
      }
      setParty(null);
      setMembers([]);
      setMessage(party.leaderId === characterId ? 'Party encerrada.' : 'Você saiu da party.');
    } catch (error) {
      const err = error as { message?: string };
      setMessage(`Falha ao sair${err.message ? `: ${err.message}` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!party) return;
    try {
      await navigator.clipboard.writeText(party.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível: o código continua visível para copiar manualmente */
    }
  };

  if (!open) return null;

  const isLeader = party?.leaderId === characterId;

  return (
    <div className={styles.menuOverlay} onClick={onClose}>
      <div className={styles.menuPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.menuHeader}>
          <span className={styles.combatTitle}>PARTY / SQUAD</span>
          <button
            type="button"
            className={styles.menuClose}
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className={styles.menuBody}>
          {loading && <p className={styles.menuEmpty}>Carregando party…</p>}

          {!loading && !party && (
            <>
              <p style={{ margin: '0 0 12px', opacity: 0.8, fontSize: 13 }}>
                Crie uma party e jogue com outros aventureiros. O limite de andar da party é o
                andar mais alto entre os jogadores reais (bots não interferem).
              </p>
              <button
                type="button"
                style={{ ...panelButtonStyle, background: '#2d5f8a' }}
                disabled={busy}
                onClick={handleCreate}
              >
                {busy ? 'CRIANDO…' : '➕ CRIAR PARTY'}
              </button>
              <input
                value={joinCode}
                onChange={(event) => {
                  const clean = event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6);
                  setJoinCode(clean);
                }}
                onPaste={(event) => {
                  // Colar direto: normaliza o texto (igual ao código gerado).
                  const text = event.clipboardData.getData('text') ?? '';
                  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                  if (clean) {
                    event.preventDefault();
                    setJoinCode(clean);
                  }
                }}
                placeholder="CÓDIGO DA PARTY"
                maxLength={6}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Código de convite"
                style={codeInputStyle}
              />
              <button
                type="button"
                style={{ ...panelButtonStyle, background: '#2d7a4f', marginTop: 8 }}
                disabled={busy}
                onClick={handleJoin}
              >
                ENTRAR COM O CÓDIGO
              </button>
            </>
          )}

          {!loading && party && (
            <>
              <div style={codeBoxStyle}>
                <span style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1 }}>CÓDIGO DE CONVITE</span>
                <b style={{ fontSize: 24, letterSpacing: 4 }}>{party.inviteCode}</b>
                <button type="button" style={copyButtonStyle} onClick={handleCopy}>
                  {copied ? 'COPIADO ✓' : 'COPIAR'}
                </button>
              </div>

              <p style={{ margin: '8px 0 12px', opacity: 0.8, fontSize: 13 }}>
                🏰 Limite de andar da party:{' '}
                <b style={{ color: '#7ec8ff' }}>{members.reduce((acc, m) => Math.max(acc, m.towerFloor), 1)}</b>{' '}
                (maior andar dos jogadores reais)
              </p>

              <div style={memberListStyle}>
                {members.map((member) => (
                  <div key={member.characterId} style={memberRowStyle}>
                    <span style={{ fontSize: 18 }}>{member.isLeader ? '👑' : '🛡️'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                        {member.characterId === characterId ? ' (você)' : ''}
                      </b>
                      <em style={{ opacity: 0.7, fontSize: 12, fontStyle: 'normal' }}>
                        {member.className}
                        {member.race ? ` · ${member.race}` : ''} · Nv. {member.level} · Andar{' '}
                        {member.towerFloor}
                      </em>
                      <em
                        style={{
                          display: 'block',
                          opacity: 0.5,
                          fontSize: 10.5,
                          fontStyle: 'normal',
                          letterSpacing: 0.3,
                        }}
                      >
                        {member.statsSummary}
                      </em>
                    </span>
                  </div>
                ))}

                {members.length < 4 && (
                  <div style={{ ...memberRowStyle, opacity: 0.45 }}>
                    <span style={{ fontSize: 18 }}>🤖</span>
                    <span style={{ fontSize: 12 }}>
                      {4 - members.length} bot(s) de IA completam o squad no combate
                      (não contam para o limite de andar)
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                style={{ ...panelButtonStyle, background: '#8a2d2d', marginTop: 14 }}
                disabled={busy}
                onClick={handleLeave}
              >
                {isLeader ? '✖ ENCERRAR PARTY (líder)' : '➖ SAIR DA PARTY'}
              </button>
              {isLeader && (
                <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
                  Encerrar desfaz a party para todos os membros.
                </p>
              )}
            </>
          )}

          {message && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#ffcc66' }}>{message}</p>
          )}

          <p style={{ margin: '14px 0 0', opacity: 0.5, fontSize: 11 }}>
            {characterName} · Andar {towerFloor} · o progresso é compartilhado com todas as versões do jogo
          </p>
        </div>
      </div>
    </div>
  );
}

// Estilos locais (inline) — o módulo CSS da arena cobre o resto (overlay/painel).
const panelButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 13,
  color: '#fff',
  cursor: 'pointer',
};

const codeInputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 12,
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.3)',
  background: 'rgba(0,0,0,0.4)',
  color: '#fff',
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 4,
  textTransform: 'uppercase',
  textAlign: 'center',
  outline: 'none',
};

const codeBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '12px',
  borderRadius: 10,
  border: '1px dashed rgba(255,255,255,0.35)',
  background: 'rgba(0,0,0,0.25)',
};

const copyButtonStyle: CSSProperties = {
  padding: '4px 10px',
  marginTop: 4,
  borderRadius: 6,
  border: 'none',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const memberListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const memberRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  fontSize: 13,
};
