import { resolve } from 'node:path';
import { aplicarMigracoes } from './migrador.js';

const url = process.env.AUDITORIA_MIGRADOR_DATABASE_URL;
if (!url) throw new Error('AUDITORIA_MIGRADOR_DATABASE_URL não definida.');
const aplicadas = await aplicarMigracoes(url, resolve('db/migrations'));
console.log(JSON.stringify({ evento: 'migracao.concluida', aplicadas }));
