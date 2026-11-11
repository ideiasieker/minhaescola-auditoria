// Único ponto que fala com o Postgres. Escrita só pelas funções do banco (ingerir,
// verificar_cadeia, criar_particao); nada aqui faz UPDATE ou DELETE.
import pg from 'pg';

export type StatusIngestao = 'aceito' | 'duplicado';

export interface EventoParaGravar {
  eventoId: string;
  cadeia: string;
  documento: Record<string, unknown>;
}

export interface LinhaTrilha {
  cadeia: string;
  seq: string;
  recebido_em: Date;
  documento: Record<string, unknown>;
  hash: string;
}

export interface ResultadoVerificacao {
  ok: boolean;
  total_registros: string;
  seq_falha: string | null;
  motivo: string | null;
}

export interface FiltrosTrilha {
  tenantId: string | null;
  codigoEvento?: string;
  entidadeId?: string;
  desde?: Date;
  ate?: Date;
  limite: number;
}

export class BancoAuditoria {
  private readonly pool: pg.Pool;

  constructor(url: string, max = 10) {
    this.pool = new pg.Pool({ connectionString: url, max });
  }

  /** Grava cada evento na sua própria transação: um evento ruim não derruba o lote. */
  async ingerir(produtor: string, e: EventoParaGravar): Promise<StatusIngestao> {
    const { rows } = await this.pool.query<{ status: StatusIngestao }>(
      'SELECT auditoria.ingerir($1, $2, $3, $4) AS status',
      [e.eventoId, e.cadeia, produtor, JSON.stringify(e.documento)],
    );
    return rows[0]!.status;
  }

  async trilha(f: FiltrosTrilha): Promise<LinhaTrilha[]> {
    const cond: string[] = [];
    const args: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      args.push(v);
      cond.push(sql.replace('?', `$${args.length}`));
    };
    if (f.tenantId === null) cond.push('tenant_id IS NULL');
    else add('tenant_id = ?', f.tenantId);
    if (f.codigoEvento) add('codigo_evento = ?', f.codigoEvento);
    if (f.entidadeId) add(`documento -> 'entidade' ->> 'id' = ?`, f.entidadeId);
    if (f.desde) add('recebido_em >= ?', f.desde);
    if (f.ate) add('recebido_em < ?', f.ate);
    args.push(f.limite);
    const { rows } = await this.pool.query<LinhaTrilha>(
      `SELECT cadeia, seq::text, recebido_em, documento, encode(hash, 'hex') AS hash
         FROM auditoria.registro WHERE ${cond.join(' AND ')}
        ORDER BY recebido_em DESC, seq DESC LIMIT $${args.length}`,
      args,
    );
    return rows;
  }

  async ultimaVerificacao(cadeia: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool.query(
      `SELECT cadeia, verificado_em, ok, total_registros::text, seq_falha::text, motivo
         FROM auditoria.verificacao_cadeia WHERE cadeia = $1
        ORDER BY verificado_em DESC, id DESC LIMIT 1`,
      [cadeia],
    );
    return rows[0] ?? null;
  }

  async cadeias(): Promise<string[]> {
    const { rows } = await this.pool.query<{ cadeia: string }>(
      'SELECT cadeia FROM auditoria.cadeia_cabeca ORDER BY cadeia',
    );
    return rows.map((r) => r.cadeia);
  }

  async verificarCadeia(cadeia: string): Promise<ResultadoVerificacao> {
    const { rows } = await this.pool.query<ResultadoVerificacao>(
      'SELECT ok, total_registros::text, seq_falha::text, motivo FROM auditoria.verificar_cadeia($1)',
      [cadeia],
    );
    return rows[0]!;
  }

  async criarParticao(mes: Date): Promise<string> {
    const { rows } = await this.pool.query<{ nome: string }>(
      'SELECT auditoria.criar_particao($1::date) AS nome',
      [mes.toISOString().slice(0, 10)],
    );
    return rows[0]!.nome;
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  encerrar(): Promise<void> {
    return this.pool.end();
  }
}
