export interface DadosFinanceiros {
  receitas: number;
  despesas: number;
  lucro: number;
  contratosAtivos: number;
  contratosPendentes: number;
  contratosVencidos: number;
  margemBruta: number;
  margemLiquida: number;
  roi: number;
  receitaMensal: Array<{mes: string, valor: number}>;
  despesasPorCategoria: Array<{categoria: string, valor: number}>;
  indicadores: {
    crescimentoReceita: number;
    eficienciaOperacional: number;
    satisfacaoCliente: number;
    produtividade: number;
  };
}
