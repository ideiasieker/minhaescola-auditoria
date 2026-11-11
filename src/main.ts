import { resolve } from 'node:path';
import { BancoAuditoria } from './banco/banco.js';
import { carregarCatalogo } from './ingestao/catalogo.js';
import { Ingestor } from './ingestao/ingestor.js';
import { criarServidor, lerTokens } from './servidor.js';

function obrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não definida.`);
  return v;
}

const banco = new BancoAuditoria(obrigatoria('AUDITORIA_DATABASE_URL'));
const catalogo = carregarCatalogo(resolve('docs/catalogo-eventos-auditoria.md'));
const tokens = lerTokens(obrigatoria('AUDITORIA_TOKENS'));
const porta = Number(process.env.PORTA ?? 3100);
const host = process.env.HOST ?? '0.0.0.0';

const servidor = criarServidor({ banco, ingestor: new Ingestor(banco, catalogo), tokens });
servidor.listen(porta, host, () => {
  console.log(
    JSON.stringify({ evento: 'servidor.iniciado', porta, eventosNoCatalogo: catalogo.size }),
  );
});

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    servidor.close(() => void banco.encerrar().then(() => process.exit(0)));
  });
}
