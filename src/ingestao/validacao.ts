// Validação de um evento recebido (especificação, seção 3).
// Nada aqui lança: cada evento vira "válido" ou "rejeitado(motivo)".
import { z } from 'zod';

/** Chaves proibidas em qualquer nível do payload (regra 8.4: chat e notificação). */
export const CHAVES_PROIBIDAS = new Set(['conteudo', 'corpo', 'mensagem', 'texto']);

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const objeto = z.record(z.string(), z.unknown());

export const esquemaEvento = z.object({
  evento_id: uuid,
  ocorrido_em: z.iso.datetime({ offset: true }),
  tenant_id: uuid.nullable(),
  camada: z.enum(['funcional', 'seguranca']),
  codigo_evento: z.string().max(100),
  dominio: z.string().min(1).max(50),
  ator: z.object({
    tipo: z.enum(['usuario_escola', 'usuario_ieker', 'sistema', 'integracao']),
    id: uuid.nullable(),
    papel_no_momento: z.string().max(50).nullable().optional(),
    escopo: z.string().max(200).nullable().optional(),
  }),
  entidade: z.object({ tipo: z.string().min(1).max(50), id: uuid.nullable() }),
  descricao: z.string().max(500).nullable().optional(),
  payload_anterior: objeto.nullable().optional(),
  payload_posterior: objeto.nullable().optional(),
  contexto: objeto.nullable().optional(),
  resultado: z.enum(['sucesso', 'negado', 'erro']),
  justificativa: z.string().max(1000).nullable().optional(),
});

export type EventoAuditoria = z.infer<typeof esquemaEvento>;

export type Validacao =
  { ok: true; evento: EventoAuditoria } | { ok: false; eventoId: string | null; motivo: string };

/** Caminho da primeira chave proibida encontrada, ou null. */
export function acharChaveProibida(valor: unknown, caminho = ''): string | null {
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i++) {
      const r = acharChaveProibida(valor[i], `${caminho}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      const aqui = caminho ? `${caminho}.${k}` : k;
      if (CHAVES_PROIBIDAS.has(k.toLowerCase())) return aqui;
      const r = acharChaveProibida(v, aqui);
      if (r) return r;
    }
  }
  return null;
}

export function validarEvento(bruto: unknown, catalogo: ReadonlySet<string>): Validacao {
  const id =
    bruto &&
    typeof bruto === 'object' &&
    typeof (bruto as { evento_id?: unknown }).evento_id === 'string'
      ? (bruto as { evento_id: string }).evento_id
      : null;
  const r = esquemaEvento.safeParse(bruto);
  if (!r.success) {
    const campo = r.error.issues[0]?.path.join('.') || 'evento';
    return { ok: false, eventoId: id, motivo: `formato_invalido:${campo}` };
  }
  if (!catalogo.has(r.data.codigo_evento)) {
    return { ok: false, eventoId: id, motivo: 'codigo_fora_do_catalogo' };
  }
  const proibida = acharChaveProibida(bruto);
  if (proibida) return { ok: false, eventoId: id, motivo: `chave_proibida:${proibida}` };
  return { ok: true, evento: r.data };
}

/** Diff calculado aqui, não pelo produtor: chaves que mudaram entre anterior e posterior. */
export function calcularDiff(
  anterior: Record<string, unknown> | null | undefined,
  posterior: Record<string, unknown> | null | undefined,
): string[] | null {
  if (!anterior || !posterior) return null;
  const chaves = new Set([...Object.keys(anterior), ...Object.keys(posterior)]);
  return [...chaves]
    .filter((k) => JSON.stringify(anterior[k]) !== JSON.stringify(posterior[k]))
    .sort();
}

/** Cadeia do evento: o tenant ou 'plataforma'. */
export function cadeiaDo(evento: EventoAuditoria): string {
  return evento.tenant_id ?? 'plataforma';
}
