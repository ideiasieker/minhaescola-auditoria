# 05 — Projeto separado: `minhaescola-auditoria`

Repositório próprio, deploy próprio, banco próprio, na mesma VPS. Cumpre a seção 8 da spec (três camadas de log) para a trilha funcional e o log de segurança. O log técnico (diagnóstico) continua em cada aplicação.

## 1. Por que separado
- A trilha é a prova de que ninguém alterou nada — inclusive a própria Ieker. Ficar fora do banco de negócio impede que um bug ou credencial vazada da API apague ou reescreva o histórico.
- A API da escola **não tem credencial** do banco de auditoria. Só fala com o serviço por HTTP interno, e só consegue **acrescentar**.

## 2. Componentes

| Contêiner | Função | Rede |
|---|---|---|
| `auditoria-api` | NestJS mínimo: ingestão, leitura, verificação | rede `auditoria` + rede `escola` (para receber) |
| `auditoria-db` | PostgreSQL 17 próprio, volume próprio | só rede `auditoria` |
| `auditoria-verificador` | job agendado: verifica cadeias, cria partições, arquiva | rede `auditoria` |

Sem porta publicada. O Caddy da escola **não** encaminha nada para cá; a leitura pela escola passa pela API da escola (que repassa a requisição com o tenant resolvido).

## 3. Contrato de ingestão

`POST /v1/eventos` (lote de até 500), autenticado por **token de serviço** (um por produtor: `escola-api`, `escola-console`, `escola-worker`), enviado só pela rede interna.

```json
{
  "eventos": [{
    "evento_id": "0193…-uuid-v7",
    "ocorrido_em": "2026-11-10T14:03:22.123Z",
    "tenant_id": "uuid | null (plataforma)",
    "camada": "funcional | seguranca",
    "codigo_evento": "ACAD.NOTA.ALTERADA",
    "dominio": "academico",
    "ator": { "tipo": "usuario_escola | usuario_ieker | sistema | integracao", "id": "uuid", "papel_no_momento": "professor", "escopo": "turma:uuid" },
    "entidade": { "tipo": "nota", "id": "uuid" },
    "descricao": "Nota alterada de 6,0 para 7,5",
    "payload_anterior": { "...": "campos não pessoais em claro; pessoais cifrados" },
    "payload_posterior": {},
    "contexto": { "ip": "…", "user_agent": "…", "request_id": "…", "origem": "backoffice | pwa | app | console | api_publica | job", "sessao_impersonacao_id": null },
    "resultado": "sucesso | negado | erro",
    "justificativa": null
  }]
}
```

Regras:
- **Idempotente** por `evento_id`: reenvio responde `200` sem duplicar.
- Resposta por evento: `aceito | duplicado | rejeitado(motivo)`. O worker da escola só marca o outbox como entregue após `aceito`/`duplicado`.
- Validação do catálogo: `codigo_evento` precisa existir no catálogo (`docs/catalogo-eventos-auditoria.md`, versionado nos dois repositórios).
- **Proibido** no payload: texto de mensagem de chat e corpo de notificação (regra 8.4). O ingestor rejeita campos com nomes da lista negra (`conteudo`, `corpo`, `mensagem`, `texto`).
- `diff` é calculado pelo serviço de auditoria, não pelo produtor.

## 4. Encadeamento por hash (8.3)
- Uma cadeia por tenant (`cadeia = tenant_id`) e uma para a plataforma (`cadeia = 'plataforma'`).
- Na ingestão, dentro de uma transação: trava a cabeça da cadeia (`SELECT … FOR UPDATE` em `cadeia_cabeca`), atribui `seq = ultimo_seq + 1`, calcula `hash = sha256(hash_anterior || jsonb_canonico(registro))`, insere, atualiza a cabeça.
- A ordem da cadeia é a **ordem de chegada**, não `ocorrido_em` (eventos podem chegar fora de ordem pelo outbox). Os dois campos são guardados.
- Verificação: job diário recalcula as cadeias do dia; resultado gravado em `verificacao_cadeia`. Falha = alerta crítico.
- Âncora externa (recomendado): o hash da cabeça de cada cadeia é publicado diariamente na biblioteca do SharePoint com política de retenção (versões não podem ser apagadas). Isso prova que nem quem administra o servidor reescreveu a cadeia inteira.

## 5. Imutabilidade no banco
- Tabela `registro` particionada por mês (`ocorrido_em` de chegada).
- Role da aplicação: só `INSERT` e `SELECT`. Gatilho bloqueia `UPDATE`/`DELETE` para qualquer role.
- Partições com mais de 5 anos: exportadas (arquivo assinado, cifrado, no SharePoint) e só então removidas por procedimento manual com dupla autorização.

## 6. Dados pessoais e anonimização (lacuna L-LGPD-04)
- Campos pessoais do payload chegam **cifrados** pelo produtor com uma chave por titular (`chave_titular`, guardada no banco da escola, cifrada pela chave mestra).
- Anonimizar o titular = destruir a chave dele no banco da escola. O registro de auditoria continua íntegro (o hash é do texto cifrado), mas o dado pessoal fica ilegível para sempre.
- Ids (UUID) não são dado pessoal por si só e ficam em claro, para permitir consulta.

## 7. Leitura
- `GET /v1/trilha?tenant_id=…&filtros` — usado pela API da escola (que já checou a permissão `auditoria.trilha.ver` do usuário). A escola vê também os acessos de suporte da Ieker no próprio tenant (5.5).
- `GET /v1/trilha/consolidada` — só para o console, perfis Super Admin e Auditor.
- `GET /v1/cadeias/{cadeia}/verificacao` — estado da última verificação.
- `POST /v1/acessos-historico-chat` — registro de acesso ao histórico do chat (8.6) e alerta de volume anormal.

## 8. Falhas
- Auditoria fora do ar ⇒ a escola **continua funcionando**; eventos acumulam no outbox. Alerta se o outbox tiver evento com mais de 5 minutos sem entrega.
- Banco da auditoria tem backup próprio (pgBackRest, repositório separado sincronizado com o SharePoint).

## 9. Estrutura do repositório
```
minhaescola-auditoria/
  src/ingestao  src/leitura  src/cadeia  src/verificador
  db/migrations
  docs/catalogo-eventos-auditoria.md   (cópia sincronizada)
  compose.yaml   .github/workflows/
```
