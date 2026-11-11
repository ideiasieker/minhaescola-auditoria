// Uso: AUDITORIA_VERIFICADOR_DATABASE_URL=... npm run verificar  (agendado 1x por dia).
// Sai com código 2 se alguma cadeia estiver quebrada, para o agendador alertar.
import { BancoAuditoria } from '../banco/banco.js';
import { executarVerificacao } from './verificador.js';

const url = process.env.AUDITORIA_VERIFICADOR_DATABASE_URL;
if (!url) throw new Error('AUDITORIA_VERIFICADOR_DATABASE_URL não definida.');
const banco = new BancoAuditoria(url, 2);
try {
  const r = await executarVerificacao(banco, (l) =>
    console.log(JSON.stringify({ hora: new Date().toISOString(), ...l })),
  );
  process.exitCode = r.quebradas.length ? 2 : 0;
} finally {
  await banco.encerrar();
}
