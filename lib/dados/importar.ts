'use client';

/**
 * Leitura de CSV para importar bases de contatos.
 *
 * Arquivo exportado de agenda de celular, Google Contatos ou planilha vem em
 * formatos diferentes: separador vírgula ou ponto e vírgula, campos entre
 * aspas, BOM no início. O leitor abaixo trata isso sem depender de biblioteca.
 */

export type Tabela = { cabecalhos: string[]; linhas: string[][] };

/** Descobre o separador pela primeira linha: vence o que aparecer mais. */
function separador(primeiraLinha: string): string {
  const candidatos = [';', ',', '\t'];
  return candidatos
    .map((sep) => ({ sep, quantos: primeiraLinha.split(sep).length }))
    .sort((a, b) => b.quantos - a.quantos)[0].sep;
}

export function lerCsv(texto: string): Tabela {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sep = separador(limpo.split('\n')[0] ?? '');

  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let entreAspas = false;

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];

    if (entreAspas) {
      if (c === '"') {
        // Aspas duplicadas dentro do campo representam uma aspa literal.
        if (limpo[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') entreAspas = true;
    else if (c === sep) {
      linha.push(campo.trim());
      campo = '';
    } else if (c === '\n') {
      linha.push(campo.trim());
      if (linha.some((valor) => valor !== '')) linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }

  linha.push(campo.trim());
  if (linha.some((valor) => valor !== '')) linhas.push(linha);

  const [cabecalhos = [], ...resto] = linhas;
  return { cabecalhos, linhas: resto };
}

export type Mapeamento = {
  nome: number;
  sobrenome: number;
  telefone: number;
  email: number;
  interesse: number;
};

/** -1 significa "nenhuma coluna". */
export const SEM_COLUNA = -1;

const PADROES: Array<[keyof Mapeamento, RegExp]> = [
  ['sobrenome', /sobrenome|last\s*name|surname/i],
  ['nome', /nome\s*completo|full\s*name|^nome$|first\s*name|^name$|contato|display/i],
  ['telefone', /telefone|celular|whatsapp|phone|mobile|fone|n[uú]mero/i],
  ['email', /e-?mail/i],
  ['interesse', /interesse|procedimento|servi[çc]o|observa|notes?/i],
];

/** Chuta o mapeamento pelos nomes das colunas, para o usuário só conferir. */
export function adivinharMapeamento(cabecalhos: string[]): Mapeamento {
  const achar = (padrao: RegExp) => cabecalhos.findIndex((c) => padrao.test(c));

  const mapa: Mapeamento = {
    nome: SEM_COLUNA,
    sobrenome: SEM_COLUNA,
    telefone: SEM_COLUNA,
    email: SEM_COLUNA,
    interesse: SEM_COLUNA,
  };

  for (const [campo, padrao] of PADROES) {
    const indice = achar(padrao);
    if (indice >= 0) mapa[campo] = indice;
  }

  // Sem cabeçalho reconhecível, tenta pelo conteúdo: coluna com muitos
  // dígitos é telefone; coluna com arroba é e-mail.
  return mapa;
}

/** Completa o que o cabeçalho não revelou, olhando os próprios valores. */
export function refinarPeloConteudo(tabela: Tabela, mapa: Mapeamento): Mapeamento {
  const amostra = tabela.linhas.slice(0, 25);
  const resultado = { ...mapa };

  if (resultado.telefone === SEM_COLUNA) {
    resultado.telefone = tabela.cabecalhos.findIndex((_, coluna) => {
      const valores = amostra.map((l) => l[coluna] ?? '').filter(Boolean);
      if (valores.length < 2) return false;
      return valores.every((v) => v.replace(/\D/g, '').length >= 10);
    });
  }

  if (resultado.email === SEM_COLUNA) {
    resultado.email = tabela.cabecalhos.findIndex((_, coluna) =>
      amostra.filter((l) => (l[coluna] ?? '').includes('@')).length >= 2,
    );
  }

  // Nome: a primeira coluna que sobra e parece texto de pessoa — tem letras,
  // não tem arroba e a maioria dos valores tem espaço (nome e sobrenome).
  if (resultado.nome === SEM_COLUNA) {
    resultado.nome = tabela.cabecalhos.findIndex((_, coluna) => {
      if (coluna === resultado.telefone || coluna === resultado.email) return false;
      const valores = amostra.map((l) => l[coluna] ?? '').filter(Boolean);
      if (valores.length < 2) return false;
      const parecem = valores.filter(
        (v) => /\p{L}/u.test(v) && !v.includes('@') && v.replace(/\D/g, '').length < 6,
      );
      return parecem.length / valores.length >= 0.8 && parecem.some((v) => v.includes(' '));
    });
  }

  return resultado;
}
