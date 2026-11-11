import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventoEscola } from '../teste/eventos.js';
import { lerCatalogo } from './catalogo.js';
import { Ingestor } from './ingestor.js';
import { acharChaveProibida, calcularDiff, validarEvento } from './validacao.js';

const catalogo = lerCatalogo(readFileSync('docs/catalogo-eventos-auditoria.md', 'utf8'));
const tenant = '0193a000-0000-7000-8000-000000000001';

describe('catálogo', () => {
  it('lê os códigos das tabelas e ignora exemplos fora delas', () => {
    expect(catalogo.size).toBeGreaterThanOrEqual(100);
    expect(catalogo.has('AUTH.LOGIN.SUCESSO')).toBe(true);
    expect(catalogo.has('FIN.NOTA_FISCAL.EMITIDA')).toBe(
      lerCatalogo('| `FIN.NOTA_FISCAL.EMITIDA` | x |').has('FIN.NOTA_FISCAL.EMITIDA'),
    );
  });
});

describe('validarEvento', () => {
  it('aceita o evento no formato da escola', () => {
    expect(validarEvento(eventoEscola(tenant), catalogo).ok).toBe(true);
  });

  it('rejeita código fora do catálogo', () => {
    const r = validarEvento(eventoEscola(tenant, { codigo_evento: 'X.Y.Z' }), catalogo);
    expect(r).toMatchObject({ ok: false, motivo: 'codigo_fora_do_catalogo' });
  });

  it('rejeita formato inválido dizendo o campo, sem o valor', () => {
    const r = validarEvento(eventoEscola(tenant, { camada: 'outra' }), catalogo);
    expect(r).toMatchObject({ ok: false, motivo: 'formato_invalido:camada' });
  });

  it('rejeita chave proibida em qualquer nível, qualquer caixa', () => {
    const r = validarEvento(
      eventoEscola(tenant, { payload_posterior: { anexos: [{ Corpo: 'oi' }] } }),
      catalogo,
    );
    expect(r).toMatchObject({
      ok: false,
      motivo: 'chave_proibida:payload_posterior.anexos[0].Corpo',
    });
    expect(acharChaveProibida({ a: { b: 1 } })).toBeNull();
  });
});

describe('calcularDiff', () => {
  it('lista só as chaves que mudaram', () => {
    expect(calcularDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual(['b', 'c']);
    expect(calcularDiff(null, { a: 1 })).toBeNull();
  });
});

describe('Ingestor', () => {
  it('responde um status por evento, na ordem, sem gravar os rejeitados', async () => {
    const gravados: string[] = [];
    const ingestor = new Ingestor(
      {
        ingerir: async (_p, e) => {
          gravados.push(e.cadeia);
          return 'aceito';
        },
      },
      catalogo,
    );
    const r = await ingestor.ingerirLote('escola-worker', [
      eventoEscola(tenant),
      { lixo: true },
      eventoEscola(null),
    ]);
    expect(r.map((x) => x.status)).toEqual(['aceito', 'rejeitado', 'aceito']);
    expect(gravados).toEqual([tenant, 'plataforma']);
  });
});
