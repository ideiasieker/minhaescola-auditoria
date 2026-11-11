# minhaescola-auditoria

Trilha de auditoria funcional e log de segurança do Ieker Escola. Projeto separado, mesmo servidor, banco próprio.

Especificação: [docs/especificacao-auditoria.md](docs/especificacao-auditoria.md) (cópia de `minhaescola/docs/05-projeto-auditoria.md`).
Desenvolvimento: tarefa 0.9 (Opus) do plano em `minhaescola/docs/06-plano-de-execucao.md`.

## Como rodar
```
npm install
docker compose up -d
npm run db:migrate
npm run verificar      # cria as partições do mês; rode antes da primeira ingestão
npm start
npm test
npm run test:banco     # TESTE_ADMIN_DATABASE_URL = superusuário de um Postgres de teste
```

## O que existe (tarefa 0.9)
- `POST /v1/eventos`: lote de até 500, token por produtor, resposta por evento (`aceito`, `duplicado`, `rejeitado` com motivo). Valida catálogo e rejeita as chaves `conteudo`, `corpo`, `mensagem`, `texto` em qualquer nível. O `diff` é calculado aqui.
- Hash encadeado por cadeia (tenant ou `plataforma`), calculado no banco pela função `auditoria.ingerir`, na ordem de chegada.
- Imutabilidade: as roles de aplicação não têm INSERT/UPDATE/DELETE; gatilhos bloqueiam UPDATE, DELETE e TRUNCATE até para o dono.
- `npm run verificar` (diário): cria partições e recalcula todas as cadeias. Sai com código 2 se alguma quebrou.
- Leitura: `GET /v1/trilha?tenant_id=…` e `GET /v1/cadeias/{cadeia}/verificacao`.

## Desvios e pendências
- Servidor em `node:http` em vez de NestJS: quatro rotas, menos dependências num serviço que guarda a prova.
- Pendente: âncora diária no SharePoint, `GET /v1/trilha/consolidada` (console), `POST /v1/acessos-historico-chat`, tokens com escopo de leitura separado do de escrita, arquivamento de partições com mais de 5 anos.
