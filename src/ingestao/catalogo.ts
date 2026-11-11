// Catálogo de eventos (docs/catalogo-eventos-auditoria.md, cópia sincronizada do repositório
// da escola). Um código vale se aparece como primeira coluna de uma linha de tabela.
import { readFileSync } from 'node:fs';

const LINHA = /^\|\s*`([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)`\s*\|/;

export function lerCatalogo(markdown: string): ReadonlySet<string> {
  const codigos = new Set<string>();
  for (const linha of markdown.split(/\r?\n/)) {
    const m = LINHA.exec(linha);
    if (m) codigos.add(m[1]!);
  }
  return codigos;
}

export function carregarCatalogo(caminho: string): ReadonlySet<string> {
  const codigos = lerCatalogo(readFileSync(caminho, 'utf8'));
  if (codigos.size === 0) throw new Error(`Catálogo vazio em ${caminho}.`);
  return codigos;
}
