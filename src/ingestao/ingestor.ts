// Ingestão de um lote: valida cada evento, grava os válidos (um por transação) e responde
// um status por evento, na ordem recebida.
import type { EventoParaGravar, StatusIngestao } from '../banco/banco.js';
import { cadeiaDo, calcularDiff, validarEvento } from './validacao.js';

export const LOTE_MAXIMO = 500;

export type ResultadoEvento =
  | { evento_id: string; status: StatusIngestao }
  | { evento_id: string | null; status: 'rejeitado'; motivo: string };

export interface Gravador {
  ingerir(produtor: string, e: EventoParaGravar): Promise<StatusIngestao>;
}

export class Ingestor {
  constructor(
    private readonly gravador: Gravador,
    private readonly catalogo: ReadonlySet<string>,
  ) {}

  async ingerirLote(produtor: string, eventos: readonly unknown[]): Promise<ResultadoEvento[]> {
    const resultados: ResultadoEvento[] = [];
    for (const bruto of eventos) {
      const v = validarEvento(bruto, this.catalogo);
      if (!v.ok) {
        resultados.push({ evento_id: v.eventoId, status: 'rejeitado', motivo: v.motivo });
        continue;
      }
      const e = v.evento;
      const documento = { ...e, diff: calcularDiff(e.payload_anterior, e.payload_posterior) };
      const status = await this.gravador.ingerir(produtor, {
        eventoId: e.evento_id.toLowerCase(),
        cadeia: cadeiaDo(e),
        documento,
      });
      resultados.push({ evento_id: e.evento_id, status });
    }
    return resultados;
  }
}
