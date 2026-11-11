import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { BancoAuditoria } from './banco/banco.js';
import { lerCatalogo } from './ingestao/catalogo.js';
import { Ingestor } from './ingestao/ingestor.js';
import { criarServidor, hashToken, lerTokens } from './servidor.js';
import { eventoEscola } from './teste/eventos.js';
import { executarVerificacao } from './verificador/verificador.js';

const urls = inject('bancoTeste');
const catalogo = lerCatalogo(readFileSync('docs/catalogo-eventos-auditoria.md', 'utf8'));
const TOKEN = 'token-de-teste-escola-worker';

let app: BancoAuditoria;
let verificador: BancoAuditoria;
let base: string;
let fechar: () => Promise<void>;

async function comAdmin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: urls.admin });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function enviar(eventos: unknown[], token = TOKEN) {
  const r = await fetch(`${base}/v1/eventos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ eventos }),
  });
  return { status: r.status, corpo: (await r.json()) as { resultados: Array<{ status: string }> } };
}

beforeAll(async () => {
  app = new BancoAuditoria(urls.app, 4);
  verificador = new BancoAuditoria(urls.verificador, 2);
  const servidor = criarServidor({
    banco: app,
    ingestor: new Ingestor(app, catalogo),
    tokens: lerTokens(`escola-worker:${hashToken(TOKEN)}`),
    log: () => {},
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  fechar = () => new Promise((r) => servidor.close(() => r()));
});

afterAll(async () => {
  await fechar();
  await app.encerrar();
  await verificador.encerrar();
});

describe('ingestão', () => {
  it('sem token válido: 401', async () => {
    expect((await enviar([], 'errado')).status).toBe(401);
  });

  it('aceita, deduplica por evento_id e rejeita o inválido, no mesmo lote', async () => {
    const tenant = randomUUID();
    const e1 = eventoEscola(tenant);
    const r = await enviar([e1, e1, eventoEscola(tenant, { codigo_evento: 'NAO.EXISTE.X' })]);
    expect(r.status).toBe(200);
    expect(r.corpo.resultados.map((x) => x.status)).toEqual(['aceito', 'duplicado', 'rejeitado']);
    expect((await enviar([e1])).corpo.resultados[0]!.status).toBe('duplicado');

    const trilha = await app.trilha({ tenantId: tenant, limite: 10 });
    expect(trilha).toHaveLength(1);
    expect(trilha[0]).toMatchObject({ cadeia: tenant, seq: '1' });
  });

  it('cada tenant tem sua cadeia, e a plataforma a dela', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await enviar([eventoEscola(a), eventoEscola(b), eventoEscola(a), eventoEscola(null)]);
    const seqA = (await app.trilha({ tenantId: a, limite: 10 })).map((l) => l.seq).sort();
    expect(seqA).toEqual(['1', '2']);
    expect((await app.trilha({ tenantId: b, limite: 10 })).map((l) => l.seq)).toEqual(['1']);
    const r = await fetch(`${base}/v1/trilha?tenant_id=${a}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(((await r.json()) as { registros: unknown[] }).registros).toHaveLength(2);
  });

  it('eventos concorrentes na mesma cadeia não pulam nem repetem seq', async () => {
    const tenant = randomUUID();
    const lotes = Array.from({ length: 5 }, () => [eventoEscola(tenant), eventoEscola(tenant)]);
    await Promise.all(lotes.map((l) => enviar(l)));
    const seqs = (await app.trilha({ tenantId: tenant, limite: 50 })).map((l) => Number(l.seq));
    expect(seqs.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect((await verificador.verificarCadeia(tenant)).ok).toBe(true);
  });
});

describe('imutabilidade', () => {
  it('a role da aplicação não insere, altera nem apaga direto', async () => {
    const c = new pg.Client({ connectionString: urls.app });
    await c.connect();
    try {
      await expect(c.query('UPDATE auditoria.registro SET produtor = $1', ['x'])).rejects.toThrow();
      await expect(c.query('DELETE FROM auditoria.registro')).rejects.toThrow();
      await expect(c.query('TRUNCATE auditoria.registro')).rejects.toThrow();
      await expect(
        c.query(`INSERT INTO auditoria.cadeia_cabeca VALUES ('x', 0, '\\x00')`),
      ).rejects.toThrow();
    } finally {
      await c.end();
    }
  });

  it('nem o dono das tabelas consegue alterar ou apagar (gatilho)', async () => {
    await comAdmin(async (c) => {
      await c.query('SET ROLE auditoria_owner');
      await expect(c.query(`UPDATE auditoria.registro SET produtor = 'x'`)).rejects.toThrow(
        /proibido/,
      );
      await expect(c.query('DELETE FROM auditoria.evento_recebido')).rejects.toThrow(/proibido/);
      await expect(c.query('TRUNCATE auditoria.registro')).rejects.toThrow(/proibido/);
    });
  });
});

describe('verificação da cadeia', () => {
  it('cadeia íntegra passa; adulteração por superusuário é achada no seq certo', async () => {
    const tenant = randomUUID();
    await enviar([eventoEscola(tenant), eventoEscola(tenant), eventoEscola(tenant)]);
    expect(await verificador.verificarCadeia(tenant)).toMatchObject({
      ok: true,
      total_registros: '3',
    });

    // Simula quem tem acesso total ao servidor: desliga os gatilhos e reescreve o seq 2.
    await comAdmin(async (c) => {
      await c.query(`SET session_replication_role = replica`);
      await c.query(
        `UPDATE auditoria.registro SET documento = jsonb_set(documento, '{descricao}', '"forjado"')
          WHERE cadeia = $1 AND seq = 2`,
        [tenant],
      );
    });
    expect(await verificador.verificarCadeia(tenant)).toMatchObject({
      ok: false,
      seq_falha: '2',
      motivo: 'hash_divergente',
    });

    const r = await fetch(`${base}/v1/cadeias/${tenant}/verificacao`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(await r.json()).toMatchObject({ ok: false, seq_falha: '2' });
  });

  it('registro apagado por superusuário vira seq faltando', async () => {
    const tenant = randomUUID();
    await enviar([eventoEscola(tenant), eventoEscola(tenant), eventoEscola(tenant)]);
    await comAdmin(async (c) => {
      await c.query(`SET session_replication_role = replica`);
      await c.query('DELETE FROM auditoria.registro WHERE cadeia = $1 AND seq = 3', [tenant]);
    });
    expect(await verificador.verificarCadeia(tenant)).toMatchObject({
      ok: false,
      motivo: 'cabeca_divergente',
    });
  });

  it('o job cria partições e aponta as cadeias quebradas', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const r = await executarVerificacao(verificador, (l) => logs.push(l));
    expect(r.particoes).toHaveLength(3);
    expect(r.quebradas.length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l) => l.evento === 'auditoria.cadeia_quebrada')).toBe(true);
    // Idempotente
    expect((await executarVerificacao(verificador, () => {})).particoes).toEqual(r.particoes);
  });
});
