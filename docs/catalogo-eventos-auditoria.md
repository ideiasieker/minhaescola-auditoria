# Catálogo de eventos de auditoria

Tarefa 0.10 do plano de execução. Lacuna L-LGPD-05. Cobre os 12 domínios da seção 8.5 da especificação (119 eventos).

> **Status: rascunho.** Redigido pelo Haiku; aguarda revisão do Opus antes de virar fonte da validação.

## Regras

- **Formato do código:** `DOMINIO.RECURSO.ACAO`, em maiúsculas, com `_` quando o recurso tem mais de uma palavra (ex.: `FIN.NOTA_FISCAL.EMITIDA`).
- **Validação:** o `codigo_evento` enviado pelo outbox precisa existir neste catálogo. Código fora dele é rejeitado (ver `docs/05-projeto-auditoria.md`).
- **Sem conteúdo:** nenhum evento leva texto de mensagem de chat, corpo de notificação ou documento. O ingestor rejeita campos `conteudo`, `corpo`, `mensagem` e `texto` (regra 8.4).
- **Contexto mínimo de todo evento:** `tenant_id`, ator (usuário ou sistema), instante em UTC, identificador do objeto afetado. O `diff` é calculado pelo serviço de auditoria, não pelo produtor.
- **Idempotência:** cada evento tem `evento_id` (UUID v7), que é a chave de reenvio.
- **Canal de notificação:** eventos de push e entrega usam os estados "entregue, aberto, visualizado". Nunca "lido".

## 1. Autenticação e Acesso (8)

| Código                  | Dispara quando                                            |
| ----------------------- | --------------------------------------------------------- |
| `AUTH.LOGIN.SUCESSO`    | Login concluído                                           |
| `AUTH.LOGIN.FALHA`      | Tentativa de login recusada                               |
| `AUTH.LOGOUT`           | Encerramento de sessão pelo usuário                       |
| `AUTH.SENHA.ALTERADA`   | Troca de senha pelo próprio usuário                       |
| `AUTH.SENHA.REDEFINIDA` | Redefinição de senha por fluxo de recuperação             |
| `AUTH.MFA.ATIVADO`      | Segundo fator ativado                                     |
| `AUTH.MFA.DESATIVADO`   | Segundo fator desativado                                  |
| `AUTH.SESSAO.REVOGADA`  | Sessão encerrada por ação administrativa ou por segurança |

## 2. Usuários e Permissões (7)

| Código                   | Dispara quando                              |
| ------------------------ | ------------------------------------------- |
| `USR.USUARIO.CRIADO`     | Novo usuário cadastrado                     |
| `USR.USUARIO.ATUALIZADO` | Dados cadastrais do usuário alterados       |
| `USR.USUARIO.DESATIVADO` | Usuário desativado                          |
| `USR.PAPEL.CRIADO`       | Papel criado pela escola                    |
| `USR.PAPEL.ATRIBUIDO`    | Papel atribuído a um usuário                |
| `USR.PAPEL.REMOVIDO`     | Papel removido de um usuário                |
| `USR.PERMISSAO.ALTERADA` | Conjunto de permissões de um papel alterado |

## 3. Aluno e Matrícula (10)

| Código                           | Dispara quando                                          |
| -------------------------------- | ------------------------------------------------------- |
| `ALUNO.CADASTRO.CRIADO`          | Novo aluno cadastrado                                   |
| `ALUNO.CADASTRO.ATUALIZADO`      | Dados do aluno alterados                                |
| `ALUNO.CADASTRO.ARQUIVADO`       | Aluno desligado e arquivado                             |
| `ALUNO.RESPONSAVEL.VINCULADO`    | Responsável vinculado ao aluno                          |
| `ALUNO.RESPONSAVEL.DESVINCULADO` | Vínculo com responsável removido                        |
| `ALUNO.MATRICULA.CRIADA`         | Matrícula efetivada                                     |
| `ALUNO.MATRICULA.CANCELADA`      | Matrícula cancelada                                     |
| `ALUNO.MATRICULA.TRANSFERIDA`    | Aluno transferido de turma                              |
| `ALUNO.REMATRICULA.CONCLUIDA`    | Rematrícula do ano letivo concluída                     |
| `ALUNO.ANONIMIZADO`              | Identidade desvinculada após o desligamento (seção 9.4) |

## 4. Acadêmico (23)

| Código                          | Dispara quando                                   |
| ------------------------------- | ------------------------------------------------ |
| `ACAD.TURMA.CRIADA`             | Turma criada                                     |
| `ACAD.TURMA.ALTERADA`           | Dados da turma alterados                         |
| `ACAD.SEGMENTO.CRIADO`          | Segmento de ensino criado                        |
| `ACAD.SEGMENTO.ALTERADO`        | Segmento alterado, desativado ou reativado       |
| `ACAD.SERIE.CRIADA`             | Série criada                                     |
| `ACAD.SERIE.ALTERADA`           | Série alterada, desativada ou reativada          |
| `ACAD.TURNO.CRIADO`             | Turno criado                                     |
| `ACAD.TURNO.ALTERADO`           | Turno alterado, desativado ou reativado          |
| `ACAD.DISCIPLINA.CRIADA`        | Disciplina criada                                |
| `ACAD.ANO_LETIVO.CRIADO`        | Ano letivo criado                                |
| `ACAD.ANO_LETIVO.ALTERADO`      | Datas, divisão ou status do ano letivo alterados |
| `ACAD.DISCIPLINA.ALTERADA`      | Disciplina ou vínculo com turma alterado         |
| `ACAD.CALENDARIO.ALTERADO`      | Calendário escolar alterado                      |
| `ACAD.REGRA_AVALIACAO.ALTERADA` | Regra de avaliação alterada                      |
| `ACAD.NOTA.LANCADA`             | Nota lançada pela primeira vez                   |
| `ACAD.NOTA.ALTERADA`            | Nota já lançada foi corrigida                    |
| `ACAD.NOTA.EXCLUIDA`            | Nota removida                                    |
| `ACAD.FREQUENCIA.LANCADA`       | Frequência registrada                            |
| `ACAD.FREQUENCIA.ALTERADA`      | Frequência já registrada foi corrigida           |
| `ACAD.DIARIO.FECHADO`           | Diário de classe fechado                         |
| `ACAD.DIARIO.REABERTO`          | Diário de classe reaberto após fechamento        |
| `ACAD.OCORRENCIA.REGISTRADA`    | Ocorrência disciplinar ou pedagógica registrada  |
| `ACAD.PEI.ATUALIZADO`           | Plano Educacional Individualizado atualizado     |

## 5. Documentos e Arquivos (8)

| Código                    | Dispara quando                     |
| ------------------------- | ---------------------------------- |
| `DOC.ARQUIVO.ENVIADO`     | Arquivo enviado ao arquivo digital |
| `DOC.ARQUIVO.SUBSTITUIDO` | Nova versão de arquivo enviada     |
| `DOC.ARQUIVO.EXCLUIDO`    | Arquivo removido                   |
| `DOC.ARQUIVO.ACESSADO`    | Arquivo aberto por usuário         |
| `DOC.TEMPLATE.CRIADO`     | Modelo de documento criado         |
| `DOC.TEMPLATE.ALTERADO`   | Modelo de documento alterado       |
| `DOC.EMISSAO.REGISTRADA`  | Documento emitido pela secretaria  |
| `DOC.EMISSAO.CANCELADA`   | Emissão de documento cancelada     |

## 6. Financeiro (14)

| Código                      | Dispara quando                                      |
| --------------------------- | --------------------------------------------------- |
| `FIN.CONTRATO.CRIADO`       | Contrato de prestação de serviço criado             |
| `FIN.CONTRATO.ALTERADO`     | Contrato alterado                                   |
| `FIN.CONTRATO.ENCERRADO`    | Contrato encerrado                                  |
| `FIN.PLANO.ALTERADO`        | Plano de cobrança alterado                          |
| `FIN.COBRANCA.GERADA`       | Cobrança gerada                                     |
| `FIN.COBRANCA.CANCELADA`    | Cobrança cancelada                                  |
| `FIN.PAGAMENTO.CONFIRMADO`  | Pagamento confirmado pelo provedor                  |
| `FIN.PAGAMENTO.ESTORNADO`   | Pagamento estornado                                 |
| `FIN.BAIXA.MANUAL`          | Baixa feita manualmente pela tesouraria             |
| `FIN.DESCONTO.CONCEDIDO`    | Desconto concedido sobre cobrança                   |
| `FIN.NOTA_FISCAL.EMITIDA`   | Nota fiscal emitida                                 |
| `FIN.NOTA_FISCAL.CANCELADA` | Nota fiscal cancelada                               |
| `FIN.CONCILIACAO.EXECUTADA` | Conciliação de pagamentos executada                 |
| `FIN.CERTIFICADO.ALTERADO`  | Certificado digital da escola trocado ou atualizado |

## 7. Dados e Integrações (8)

| Código                        | Dispara quando                                         |
| ----------------------------- | ------------------------------------------------------ |
| `INT.INTEGRACAO.CONFIGURADA`  | Integração ativada para o tenant                       |
| `INT.INTEGRACAO.DESATIVADA`   | Integração desativada                                  |
| `INT.CREDENCIAL.ALTERADA`     | Credencial de integração alterada                      |
| `INT.CREDENCIAL.REVOGADA`     | Credencial de integração revogada                      |
| `INT.IMPORTACAO.EXECUTADA`    | Importação de dados concluída                          |
| `INT.EXPORTACAO.EXECUTADA`    | Exportação de dados concluída                          |
| `INT.EXPORTACAO_CENSO.GERADA` | Arquivo do censo escolar gerado                        |
| `INT.WEBHOOK.REJEITADO`       | Chamada recebida de integração rejeitada por validação |

## 8. Push e Rastreamento (8)

| Código                     | Dispara quando                        |
| -------------------------- | ------------------------------------- |
| `PUSH.TOKEN.REGISTRADO`    | Dispositivo registrado para push      |
| `PUSH.TOKEN.REVOGADO`      | Dispositivo removido ou inativado     |
| `PUSH.CAMPANHA.CRIADA`     | Campanha de notificação criada        |
| `PUSH.CAMPANHA.ENVIADA`    | Campanha disparada                    |
| `PUSH.CAMPANHA.CANCELADA`  | Campanha cancelada antes do envio     |
| `PUSH.ENTREGA.ENTREGUE`    | Notificação entregue ao dispositivo   |
| `PUSH.ENTREGA.ABERTA`      | Notificação aberta pelo destinatário  |
| `PUSH.ENTREGA.VISUALIZADA` | Notificação visualizada no aplicativo |

## 9. Documentos para Download (5)

| Código                           | Dispara quando                           |
| -------------------------------- | ---------------------------------------- |
| `DLOAD.DOCUMENTO.PUBLICADO`      | Documento disponibilizado para download  |
| `DLOAD.DOCUMENTO.REVOGADO`       | Disponibilização revogada antes do prazo |
| `DLOAD.DOCUMENTO.PRAZO_ALTERADO` | Prazo de disponibilização alterado       |
| `DLOAD.DOCUMENTO.BAIXADO`        | Download realizado pelo destinatário     |
| `DLOAD.DOCUMENTO.EXPIRADO`       | Prazo encerrado sem revogação manual     |

## 10. Atendimentos (8)

| Código                           | Dispara quando                              |
| -------------------------------- | ------------------------------------------- |
| `ATEND.SETOR.ALTERADO`           | Setor de atendimento criado ou alterado     |
| `ATEND.PROFISSIONAL.ALTERADO`    | Profissional vinculado ou alterado em setor |
| `ATEND.DISPONIBILIDADE.ALTERADA` | Grade de disponibilidade alterada           |
| `ATEND.SOLICITACAO.CRIADA`       | Solicitação de atendimento registrada       |
| `ATEND.SOLICITACAO.RESPONDIDA`   | Solicitação respondida pelo setor           |
| `ATEND.AGENDAMENTO.CRIADO`       | Atendimento agendado                        |
| `ATEND.AGENDAMENTO.CANCELADO`    | Atendimento cancelado                       |
| `ATEND.SLA.VIOLADO`              | Prazo de atendimento ultrapassado           |

## 11. Chat da Turma (10)

| Código                             | Dispara quando                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| `CHAT.TURMA.HABILITADO`            | Chat da turma ativado                                           |
| `CHAT.TURMA.DESABILITADO`          | Chat da turma desativado                                        |
| `CHAT.MENSAGEM.PUBLICADA`          | Mensagem publicada no canal (sem o conteúdo)                    |
| `CHAT.MENSAGEM.RETIDA`             | Mensagem retida pelo filtro pré-publicação                      |
| `CHAT.MENSAGEM.REJEITADA`          | Mensagem recusada pelo filtro pré-publicação                    |
| `CHAT.DENUNCIA.REGISTRADA`         | Denúncia de mensagem registrada                                 |
| `CHAT.MODERACAO.ACAO`              | Moderador ocultou ou removeu mensagem                           |
| `CHAT.ACESSO_HISTORICO.REGISTRADO` | Acesso ao histórico com justificativa (seção 8.6, sem conteúdo) |
| `CHAT.ALERTA.ACESSO_ANORMAL`       | Acesso sem justificativa válida ou volume anormal               |
| `CHAT.EXPURGO.EXECUTADO`           | Conteúdo expurgado após 120 dias do fim do ano letivo           |

## 12. Master Console (10)

| Código                            | Dispara quando                                |
| --------------------------------- | --------------------------------------------- |
| `MASTER.TENANT.CRIADO`            | Escola provisionada                           |
| `MASTER.TENANT.SUSPENSO`          | Acesso da escola suspenso                     |
| `MASTER.TENANT.REATIVADO`         | Acesso da escola reativado                    |
| `MASTER.TENANT.CANCELADO`         | Contrato da escola cancelado                  |
| `MASTER.TENANT.EXPORTADO`         | Exportação de dados de tenant cancelado       |
| `MASTER.ACESSO_SUPORTE.CONCEDIDO` | Acesso de suporte da Ieker concedido à escola |
| `MASTER.ACESSO_SUPORTE.REVOGADO`  | Acesso de suporte revogado                    |
| `MASTER.ACESSO_SUPORTE.USADO`     | Acesso de suporte utilizado dentro da escola  |
| `MASTER.FEATURE_FLAG.ALTERADA`    | Feature flag alterada para o tenant           |
| `MASTER.DOMINIO.ALTERADO`         | Hostname do tenant alterado                   |

---

**Total:** 119 eventos em 12 domínios (8 + 7 + 10 + 23 + 8 + 14 + 8 + 8 + 5 + 8 + 10 + 10). Os 9 eventos da estrutura acadêmica (segmento, série, turno, disciplina, ano letivo) entraram com a tarefa 0.24.
