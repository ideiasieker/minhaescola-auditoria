// globalSetup dos testes de banco: cria roles (se faltarem) e um banco descartável,
// aplica as migrações e apaga tudo no fim.
// TESTE_ADMIN_DATABASE_URL = superusuário do Postgres.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { aplicarMigracoes } from '../banco/migrador.js';

export interface BancoTeste {
  admin: string;
  app: string;
  verificador: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    bancoTeste: BancoTeste;
  }
}

const ADMIN =
  process.env.TESTE_ADMIN_DATABASE_URL ??
  'postgres://postgres:dev_postgres@localhost:5432/postgres';

function url(banco: string, role?: string): string {
  const u = new URL(ADMIN);
  if (role) {
    u.username = role;
    u.password = `dev_${role}`;
  }
  u.pathname = `/${banco}`;
  return u.toString();
}

async function admin<T>(conexao: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: conexao });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export default async function preparar(projeto: TestProject): Promise<() => Promise<void>> {
  const nome = `aud_teste_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  await admin(ADMIN, async (c) => {
    const { rows } = await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'auditoria_owner'");
    if (rows.length === 0) await c.query(readFileSync(resolve('db/init/00-roles.sql'), 'utf8'));
    await c.query(`CREATE DATABASE ${nome}`);
    await c.query(`GRANT CREATE, CONNECT ON DATABASE ${nome} TO auditoria_owner`);
  });
  await admin(url(nome), (c) => c.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC'));
  await aplicarMigracoes(url(nome, 'auditoria_migrador'), resolve('db/migrations'));

  projeto.provide('bancoTeste', {
    admin: url(nome),
    app: url(nome, 'auditoria_app'),
    verificador: url(nome, 'auditoria_verificador'),
  });

  return async () => {
    await admin(ADMIN, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  };
}
