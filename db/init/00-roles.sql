-- Roles do banco de auditoria. Roda UMA vez, como superusuário, na criação do banco.
-- Senhas abaixo são SOMENTE de desenvolvimento local. Produção define outras (tarefa 0.26).
--
--   auditoria_owner      dono dos objetos. NOLOGIN.
--   auditoria_migrador   login do migrador; vira auditoria_owner para criar objetos.
--   auditoria_app        serviço de ingestão e leitura. Só executa as funções e lê.
--   auditoria_verificador job diário: verifica cadeias e cria partições.
CREATE ROLE auditoria_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE auditoria_migrador LOGIN PASSWORD 'dev_auditoria_migrador'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE auditoria_owner;
CREATE ROLE auditoria_app LOGIN PASSWORD 'dev_auditoria_app'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE auditoria_verificador LOGIN PASSWORD 'dev_auditoria_verificador'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
