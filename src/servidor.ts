// Servidor HTTP interno (node:http, sem framework: são quatro rotas e menos dependência
// num serviço que guarda a prova de tudo). Sem porta publicada: só a rede interna alcança.
//
// Autenticação: token de serviço por produtor (Authorization: Bearer <token>). O serviço só
// conhece o sha256 de cada token e compara em tempo constante.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BancoAuditoria } from './banco/banco.js';
import { LOTE_MAXIMO, type Ingestor } from './ingestao/ingestor.js';

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Log = (linha: Record<string, unknown>) => void;
const logJson: Log = (l) => console.log(JSON.stringify({ hora: new Date().toISOString(), ...l }));

/** Produtor → sha256 (hex) do token. Formato da env: "escola-worker:abc…,escola-api:def…". */
export function lerTokens(env: string | undefined): Map<string, Buffer> {
  const mapa = new Map<string, Buffer>();
  for (const par of (env ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [produtor, hash] = par.split(':');
    if (!produtor || !hash || !/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error('AUDITORIA_TOKENS inválida: use produtor:sha256hex separados por vírgula.');
    }
    mapa.set(produtor, Buffer.from(hash, 'hex'));
  }
  return mapa;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function autenticar(req: IncomingMessage, tokens: Map<string, Buffer>): string | null {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) return null;
  const recebido = createHash('sha256').update(m[1]!).digest();
  let achado: string | null = null;
  for (const [produtor, esperado] of tokens) {
    if (timingSafeEqual(recebido, esperado)) achado = produtor;
  }
  return achado;
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(texto);
}

async function lerJson(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += (parte as Buffer).length;
    if (tamanho > TAMANHO_MAXIMO) throw new ErroHttp(413, 'corpo_grande_demais');
    partes.push(parte as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new ErroHttp(400, 'json_invalido');
  }
}

class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
  ) {
    super(codigo);
  }
}

function data(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ErroHttp(400, 'data_invalida');
  return d;
}

export interface DependenciasServidor {
  banco: Pick<BancoAuditoria, 'trilha' | 'ultimaVerificacao' | 'ping'>;
  ingestor: Pick<Ingestor, 'ingerirLote'>;
  tokens: Map<string, Buffer>;
  log?: Log;
}

export function criarServidor(d: DependenciasServidor): Server {
  const log = d.log ?? logJson;
  return createServer((req, res) => {
    void tratar(req, res).catch((erro: unknown) => {
      if (erro instanceof ErroHttp) return responder(res, erro.status, { erro: erro.codigo });
      // Nunca logar o corpo: pode ter dado pessoal cifrado ou não.
      log({
        nivel: 'error',
        evento: 'http.erro',
        erro: erro instanceof Error ? erro.name : 'Erro',
      });
      responder(res, 500, { erro: 'interno' });
    });
  });

  async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://interno');
    if (req.method === 'GET' && url.pathname === '/saude') {
      await d.banco.ping();
      return responder(res, 200, { ok: true });
    }

    const produtor = autenticar(req, d.tokens);
    if (!produtor) return responder(res, 401, { erro: 'nao_autenticado' });

    if (req.method === 'POST' && url.pathname === '/v1/eventos') {
      const corpo = (await lerJson(req)) as { eventos?: unknown };
      if (!Array.isArray(corpo?.eventos)) throw new ErroHttp(400, 'eventos_ausente');
      if (corpo.eventos.length > LOTE_MAXIMO) throw new ErroHttp(413, 'lote_grande_demais');
      const resultados = await d.ingestor.ingerirLote(produtor, corpo.eventos);
      const contagem = { aceito: 0, duplicado: 0, rejeitado: 0 };
      for (const r of resultados) contagem[r.status]++;
      log({
        nivel: contagem.rejeitado ? 'warn' : 'info',
        evento: 'ingestao.lote',
        produtor,
        ...contagem,
      });
      return responder(res, 200, { resultados });
    }

    if (req.method === 'GET' && url.pathname === '/v1/trilha') {
      const p = url.searchParams;
      const tenant = p.get('tenant_id');
      if (tenant === null || (tenant !== 'plataforma' && !UUID.test(tenant))) {
        throw new ErroHttp(400, 'tenant_id_invalido');
      }
      const entidade = p.get('entidade_id');
      if (entidade && !UUID.test(entidade)) throw new ErroHttp(400, 'entidade_id_invalido');
      const limite = Math.min(Math.max(Number(p.get('limite') ?? 100) || 100, 1), 500);
      const filtros: Parameters<BancoAuditoria['trilha']>[0] = {
        tenantId: tenant === 'plataforma' ? null : tenant,
        limite,
      };
      const codigo = p.get('codigo_evento');
      if (codigo) filtros.codigoEvento = codigo;
      if (entidade) filtros.entidadeId = entidade;
      const desde = data(p.get('desde'));
      if (desde) filtros.desde = desde;
      const ate = data(p.get('ate'));
      if (ate) filtros.ate = ate;
      return responder(res, 200, { registros: await d.banco.trilha(filtros) });
    }

    const m = /^\/v1\/cadeias\/([^/]+)\/verificacao$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const cadeia = decodeURIComponent(m[1]!);
      if (cadeia !== 'plataforma' && !UUID.test(cadeia)) throw new ErroHttp(400, 'cadeia_invalida');
      const v = await d.banco.ultimaVerificacao(cadeia);
      return v ? responder(res, 200, v) : responder(res, 404, { erro: 'sem_verificacao' });
    }

    responder(res, 404, { erro: 'nao_encontrado' });
  }
}
