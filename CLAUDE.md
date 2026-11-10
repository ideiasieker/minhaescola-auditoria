# minhaescola-auditoria — instruções para agentes

Leia `docs/especificacao-auditoria.md`. Este serviço só ACRESCENTA registros: nunca escreva código que altere ou apague `registro`.
A ingestão é idempotente por `evento_id`. O hash encadeado é calculado aqui, por cadeia (tenant ou 'plataforma'), em ordem de chegada.
Nunca aceite payload com texto de chat ou corpo de notificação. Toda mudança nesta base é tarefa de Opus.
