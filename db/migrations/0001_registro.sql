-- Trilha de auditoria (tarefa 0.9, docs/especificacao-auditoria.md seções 4 e 5).
-- Só acrescenta. Ninguém altera nem apaga `registro` ou `evento_recebido`: os gatilhos
-- bloqueiam para qualquer role (o dono inclusive). As roles de aplicação não têm INSERT
-- direto: escrevem só pela função `ingerir`, que calcula o hash encadeado.

CREATE SCHEMA auditoria AUTHORIZATION auditoria_owner;
REVOKE ALL ON SCHEMA auditoria FROM PUBLIC;
GRANT USAGE ON SCHEMA auditoria TO auditoria_app, auditoria_verificador;

-- Cabeça de cada cadeia: tenant_id (texto) ou 'plataforma'.
CREATE TABLE auditoria.cadeia_cabeca (
  cadeia        text PRIMARY KEY,
  ultimo_seq    bigint NOT NULL,
  ultimo_hash   bytea NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Idempotência por evento_id. Tabela à parte porque a PK de `registro` precisa conter a
-- coluna da partição.
CREATE TABLE auditoria.evento_recebido (
  evento_id   uuid PRIMARY KEY,
  cadeia      text NOT NULL,
  seq         bigint NOT NULL,
  recebido_em timestamptz NOT NULL
);

CREATE TABLE auditoria.registro (
  cadeia        text NOT NULL,
  seq           bigint NOT NULL,
  recebido_em   timestamptz NOT NULL,
  evento_id     uuid NOT NULL,
  produtor      text NOT NULL,
  ocorrido_em   timestamptz NOT NULL,
  tenant_id     uuid,
  camada        text NOT NULL CHECK (camada IN ('funcional', 'seguranca')),
  codigo_evento text NOT NULL,
  dominio       text NOT NULL,
  documento     jsonb NOT NULL,
  hash_anterior bytea NOT NULL,
  hash          bytea NOT NULL,
  PRIMARY KEY (cadeia, seq, recebido_em)
) PARTITION BY RANGE (recebido_em);

-- Rede de segurança: o verificador cria as partições mensais com antecedência.
CREATE TABLE auditoria.registro_padrao PARTITION OF auditoria.registro DEFAULT;

CREATE INDEX registro_tenant_idx ON auditoria.registro (tenant_id, recebido_em DESC);
CREATE INDEX registro_entidade_idx ON auditoria.registro ((documento -> 'entidade' ->> 'id'));

CREATE TABLE auditoria.verificacao_cadeia (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cadeia          text NOT NULL,
  verificado_em   timestamptz NOT NULL DEFAULT now(),
  ok              boolean NOT NULL,
  total_registros bigint NOT NULL,
  seq_falha       bigint,
  motivo          text
);
CREATE INDEX verificacao_cadeia_idx ON auditoria.verificacao_cadeia (cadeia, verificado_em DESC);

-- Imutabilidade --------------------------------------------------------------------------
CREATE FUNCTION auditoria.bloquear_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria: % proibido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER registro_imutavel BEFORE UPDATE OR DELETE ON auditoria.registro
  FOR EACH ROW EXECUTE FUNCTION auditoria.bloquear_alteracao();
CREATE TRIGGER registro_sem_truncate BEFORE TRUNCATE ON auditoria.registro
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria.bloquear_alteracao();
CREATE TRIGGER registro_padrao_sem_truncate BEFORE TRUNCATE ON auditoria.registro_padrao
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria.bloquear_alteracao();
CREATE TRIGGER evento_recebido_imutavel BEFORE UPDATE OR DELETE ON auditoria.evento_recebido
  FOR EACH ROW EXECUTE FUNCTION auditoria.bloquear_alteracao();
CREATE TRIGGER evento_recebido_sem_truncate BEFORE TRUNCATE ON auditoria.evento_recebido
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria.bloquear_alteracao();
CREATE TRIGGER verificacao_imutavel BEFORE UPDATE OR DELETE ON auditoria.verificacao_cadeia
  FOR EACH ROW EXECUTE FUNCTION auditoria.bloquear_alteracao();

-- Hash -----------------------------------------------------------------------------------
-- Texto canônico = jsonb::text (chaves ordenadas pelo próprio Postgres), com fuso UTC fixo.
-- O hash cobre cadeia, seq e recebido_em além do documento: mover um registro de lugar
-- também quebra a cadeia.
CREATE FUNCTION auditoria.calcular_hash(
  p_hash_anterior bytea, p_cadeia text, p_seq bigint, p_recebido_em timestamptz, p_documento jsonb
) RETURNS bytea
LANGUAGE sql IMMUTABLE SET "TimeZone" = 'UTC' AS $$
  SELECT sha256(p_hash_anterior || convert_to(
    jsonb_build_object(
      'cadeia', p_cadeia, 'seq', p_seq, 'recebido_em', p_recebido_em, 'documento', p_documento
    )::text, 'UTF8'))
$$;

-- Ingestão: um evento por chamada, dentro da transação de quem chama.
-- Devolve 'aceito' ou 'duplicado'.
CREATE FUNCTION auditoria.ingerir(
  p_evento_id uuid, p_cadeia text, p_produtor text, p_documento jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auditoria, pg_temp SET "TimeZone" = 'UTC' AS $$
DECLARE
  v_seq    bigint;
  v_ant    bytea;
  v_agora  timestamptz := clock_timestamp();
  v_hash   bytea;
BEGIN
  IF EXISTS (SELECT 1 FROM auditoria.evento_recebido WHERE evento_id = p_evento_id) THEN
    RETURN 'duplicado';
  END IF;

  INSERT INTO auditoria.cadeia_cabeca (cadeia, ultimo_seq, ultimo_hash)
  VALUES (p_cadeia, 0, '\x0000000000000000000000000000000000000000000000000000000000000000')
  ON CONFLICT (cadeia) DO NOTHING;

  -- Trava a cabeça: a ordem da cadeia é a ordem de chegada.
  SELECT ultimo_seq + 1, ultimo_hash INTO v_seq, v_ant
    FROM auditoria.cadeia_cabeca WHERE cadeia = p_cadeia FOR UPDATE;

  -- Com a cabeça travada, um reenvio concorrente do mesmo evento esbarra na PK.
  INSERT INTO auditoria.evento_recebido (evento_id, cadeia, seq, recebido_em)
  VALUES (p_evento_id, p_cadeia, v_seq, v_agora)
  ON CONFLICT (evento_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'duplicado';
  END IF;

  v_hash := auditoria.calcular_hash(v_ant, p_cadeia, v_seq, v_agora, p_documento);

  INSERT INTO auditoria.registro (
    cadeia, seq, recebido_em, evento_id, produtor, ocorrido_em, tenant_id, camada,
    codigo_evento, dominio, documento, hash_anterior, hash
  ) VALUES (
    p_cadeia, v_seq, v_agora, p_evento_id, p_produtor,
    (p_documento ->> 'ocorrido_em')::timestamptz,
    (p_documento ->> 'tenant_id')::uuid,
    p_documento ->> 'camada',
    p_documento ->> 'codigo_evento',
    p_documento ->> 'dominio',
    p_documento, v_ant, v_hash
  );

  UPDATE auditoria.cadeia_cabeca
     SET ultimo_seq = v_seq, ultimo_hash = v_hash, atualizado_em = v_agora
   WHERE cadeia = p_cadeia;
  RETURN 'aceito';
END $$;

-- Verificação: recalcula a cadeia inteira em ordem de seq e grava o resultado.
CREATE FUNCTION auditoria.verificar_cadeia(p_cadeia text)
RETURNS TABLE (ok boolean, total_registros bigint, seq_falha bigint, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auditoria, pg_temp SET "TimeZone" = 'UTC' AS $$
DECLARE
  r        record;
  v_ant    bytea := '\x0000000000000000000000000000000000000000000000000000000000000000';
  v_esper  bigint := 1;
  v_total  bigint := 0;
  v_ok     boolean := true;
  v_falha  bigint;
  v_motivo text;
  v_cabeca record;
BEGIN
  FOR r IN SELECT * FROM auditoria.registro WHERE cadeia = p_cadeia ORDER BY seq LOOP
    v_total := v_total + 1;
    IF r.seq <> v_esper THEN
      v_ok := false; v_falha := v_esper; v_motivo := 'seq_faltando'; EXIT;
    END IF;
    IF r.hash_anterior <> v_ant THEN
      v_ok := false; v_falha := r.seq; v_motivo := 'hash_anterior_divergente'; EXIT;
    END IF;
    IF auditoria.calcular_hash(v_ant, r.cadeia, r.seq, r.recebido_em, r.documento) <> r.hash THEN
      v_ok := false; v_falha := r.seq; v_motivo := 'hash_divergente'; EXIT;
    END IF;
    v_ant := r.hash;
    v_esper := v_esper + 1;
  END LOOP;

  IF v_ok THEN
    SELECT * INTO v_cabeca FROM auditoria.cadeia_cabeca WHERE cadeia = p_cadeia;
    IF FOUND AND (v_cabeca.ultimo_seq <> v_total OR v_cabeca.ultimo_hash <> v_ant) THEN
      v_ok := false; v_falha := v_total + 1; v_motivo := 'cabeca_divergente';
    END IF;
  END IF;

  INSERT INTO auditoria.verificacao_cadeia (cadeia, ok, total_registros, seq_falha, motivo)
  VALUES (p_cadeia, v_ok, v_total, v_falha, v_motivo);
  RETURN QUERY SELECT v_ok, v_total, v_falha, v_motivo;
END $$;

-- Partição mensal [mes, mes + 1 mês). Idempotente.
CREATE FUNCTION auditoria.criar_particao(p_mes date) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auditoria, pg_temp SET "TimeZone" = 'UTC' AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_nome   text := format('registro_%s', to_char(v_inicio, 'YYYY_MM'));
BEGIN
  -- Mês que já tem linhas na partição padrão fica nela: mover seria apagar, e aqui nada se
  -- apaga. Por isso o verificador roda no deploy, antes da primeira ingestão do mês.
  IF to_regclass('auditoria.' || v_nome) IS NULL AND EXISTS (
    SELECT 1 FROM auditoria.registro_padrao
     WHERE recebido_em >= v_inicio AND recebido_em < v_inicio + interval '1 month'
  ) THEN
    RETURN 'registro_padrao';
  END IF;
  IF to_regclass('auditoria.' || v_nome) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE auditoria.%I PARTITION OF auditoria.registro FOR VALUES FROM (%L) TO (%L)',
      v_nome, v_inicio::timestamptz, (v_inicio + interval '1 month')::timestamptz);
    EXECUTE format(
      'CREATE TRIGGER sem_truncate BEFORE TRUNCATE ON auditoria.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION auditoria.bloquear_alteracao()', v_nome);
  END IF;
  RETURN v_nome;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA auditoria FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auditoria FROM PUBLIC;
GRANT SELECT ON auditoria.registro, auditoria.registro_padrao, auditoria.cadeia_cabeca, auditoria.verificacao_cadeia
  TO auditoria_app, auditoria_verificador;
GRANT EXECUTE ON FUNCTION auditoria.ingerir(uuid, text, text, jsonb) TO auditoria_app;
GRANT EXECUTE ON FUNCTION auditoria.verificar_cadeia(text) TO auditoria_verificador;
GRANT EXECUTE ON FUNCTION auditoria.criar_particao(date) TO auditoria_verificador;
