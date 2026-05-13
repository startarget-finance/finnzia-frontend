/**
 * Estrutura compatível com `PlanoContasGerencialComponent.importarLote`:
 * raízes com `children` ou itens legados `{ tipo, nome }`.
 * Inspiração: plano gerencial típico (receitas / despesas) de sistemas como o Bom Controle.
 */
export const PLANO_CONTAS_PADRAO_BOM_CONTROLE: unknown[] = [
  // —— Receitas (cada item = categoria raiz) ——
  { tipo: 'receita', nome: 'Ajuste de caixa' },
  { tipo: 'receita', nome: 'Aplicações financeiras' },
  { tipo: 'receita', nome: 'Aporte financeiro' },
  { tipo: 'receita', nome: 'Venda de produto' },
  { tipo: 'receita', nome: 'Venda de serviço' },
  // —— Despesas (árvore) ——
  { tipo: 'despesa', nome: 'Ajuste de caixa' },
  {
    tipo: 'despesa',
    nome: 'Despesas bancárias',
    children: [{ nome: 'Adm bancária' }, { nome: 'DOC' }],
  },
  {
    tipo: 'despesa',
    nome: 'Despesas de funcionamento',
    children: [
      { nome: 'Aluguel de imóveis' },
      { nome: 'Cartório' },
      { nome: 'Conta de água' },
      { nome: 'Correio' },
      { nome: 'Energia' },
      { nome: 'Internet' },
      { nome: 'Licença ou aluguel de softwares' },
      { nome: 'Limpeza' },
      { nome: 'Material de escritório' },
      { nome: 'Telefonia' },
    ],
  },
  {
    tipo: 'despesa',
    nome: 'Funcionário',
    children: [
      { nome: '13º salário' },
      { nome: 'Assistência médica' },
      { nome: 'Cursos e treinamentos' },
      { nome: 'Exames pré e demissionais' },
      { nome: 'FGTS' },
      { nome: 'Horas extras' },
      { nome: 'INSS' },
      { nome: 'Premiação' },
      { nome: 'Rescisões trabalhistas' },
      { nome: 'Salário' },
      { nome: 'Vale alimentação' },
      { nome: 'Vale transporte' },
    ],
  },
  { tipo: 'despesa', nome: 'Honorários advocatícios' },
  {
    tipo: 'despesa',
    nome: 'Impostos',
    children: [{ nome: 'Alvará' }, { nome: 'IPTU' }, { nome: 'PIS' }],
  },
  {
    tipo: 'despesa',
    nome: 'Investimentos',
    children: [
      { nome: 'Ações de marketing e publicidade' },
      { nome: 'Confraternizações' },
      { nome: 'Reformas' },
    ],
  },
];
