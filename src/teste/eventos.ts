import { randomUUID } from 'node:crypto';

/** Evento no formato que o worker da escola envia (registrarEvento + outbox). */
export function eventoEscola(tenantId: string | null, extra: Record<string, unknown> = {}) {
  return {
    evento_id: randomUUID(),
    ocorrido_em: new Date().toISOString(),
    tenant_id: tenantId,
    camada: 'funcional',
    codigo_evento: 'ACAD.SEGMENTO.CRIADO',
    dominio: 'academico',
    ator: { tipo: 'usuario_escola', id: randomUUID() },
    entidade: { tipo: 'segmento', id: randomUUID() },
    descricao: 'Segmento criado',
    payload_posterior: { nome: 'Fundamental I' },
    contexto: { ip: '10.0.0.1', user_agent: 'teste', request_id: 'r1', origem: 'backoffice' },
    resultado: 'sucesso',
    ...extra,
  };
}
