// Job diário (especificação 4 e 5): cria partições do mês atual e dos próximos, recalcula
// todas as cadeias e registra o resultado. Cadeia quebrada = alerta crítico no log.
import type { BancoAuditoria } from '../banco/banco.js';

type Log = (linha: Record<string, unknown>) => void;

export interface ResumoVerificacao {
  particoes: string[];
  cadeias: number;
  quebradas: Array<{ cadeia: string; seqFalha: string | null; motivo: string | null }>;
}

export function mesesAFrente(agora: Date, quantos: number): Date[] {
  return Array.from(
    { length: quantos + 1 },
    (_, i) => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + i, 1)),
  );
}

export async function executarVerificacao(
  banco: Pick<BancoAuditoria, 'criarParticao' | 'cadeias' | 'verificarCadeia'>,
  log: Log,
  agora = new Date(),
): Promise<ResumoVerificacao> {
  const particoes: string[] = [];
  for (const mes of mesesAFrente(agora, 2)) particoes.push(await banco.criarParticao(mes));

  const quebradas: ResumoVerificacao['quebradas'] = [];
  const cadeias = await banco.cadeias();
  for (const cadeia of cadeias) {
    const r = await banco.verificarCadeia(cadeia);
    if (!r.ok) {
      quebradas.push({ cadeia, seqFalha: r.seq_falha, motivo: r.motivo });
      log({
        nivel: 'critical',
        evento: 'auditoria.cadeia_quebrada',
        cadeia,
        seqFalha: r.seq_falha,
        motivo: r.motivo,
      });
    }
  }
  log({
    nivel: quebradas.length ? 'critical' : 'info',
    evento: 'auditoria.verificacao',
    cadeias: cadeias.length,
    quebradas: quebradas.length,
  });
  return { particoes, cadeias: cadeias.length, quebradas };
}
