// Migrador simples: aplica, em ordem, os .sql de db/migrations ainda não aplicados.
// Cada arquivo roda numa transação, como auditoria_owner. Migração aplicada nunca é editada:
// o checksum gravado acusa a edição.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

export async function aplicarMigracoes(url: string, pasta: string): Promise<string[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const aplicadas: string[] = [];
  try {
    await c.query('SET ROLE auditoria_owner');
    await c.query(`CREATE SCHEMA IF NOT EXISTS migracao`);
    await c.query(`CREATE TABLE IF NOT EXISTS migracao.aplicada (
      nome text PRIMARY KEY, checksum text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await c.query<{ nome: string; checksum: string }>(
      'SELECT nome, checksum FROM migracao.aplicada',
    );
    const feitas = new Map(rows.map((r) => [r.nome, r.checksum]));

    const arquivos = (await readdir(pasta)).filter((a) => a.endsWith('.sql')).sort();
    for (const nome of arquivos) {
      const sql = await readFile(join(pasta, nome), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const anterior = feitas.get(nome);
      if (anterior) {
        if (anterior !== checksum)
          throw new Error(`Migração ${nome} foi editada depois de aplicada.`);
        continue;
      }
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO migracao.aplicada (nome, checksum) VALUES ($1, $2)', [
          nome,
          checksum,
        ]);
        await c.query('COMMIT');
        aplicadas.push(nome);
      } catch (erro) {
        await c.query('ROLLBACK');
        throw erro;
      }
    }
    return aplicadas;
  } finally {
    await c.end();
  }
}
