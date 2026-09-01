'use client';

/**
 * Exportação em CSV.
 *
 * Usa ponto e vírgula como separador e BOM no início: é o que faz o Excel em
 * português abrir o arquivo já com as colunas separadas e os acentos corretos.
 * Vírgula e UTF-8 puro resultam em tudo numa coluna só e em texto quebrado.
 */

function escapar(valor: string | number | null | undefined): string {
  const texto = String(valor ?? '');
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function baixarCsv(
  nomeArquivo: string,
  cabecalhos: string[],
  linhas: Array<Array<string | number | null | undefined>>,
): void {
  const conteudo = [cabecalhos, ...linhas]
    .map((linha) => linha.map(escapar).join(';'))
    .join('\r\n');

  const arquivo = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
