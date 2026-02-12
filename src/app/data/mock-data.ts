export interface Contrato {
  id: string;
  titulo: string;
  cliente: string;
  valor: number;
  dataVencimento: string;
  status: 'pendente' | 'em_dia' | 'vencido' | 'pago' | 'cancelado';
  descricao: string;
  conteudo: string;
  whatsapp: string;
  dadosCliente?: DadosCliente;
  servico?: string;
  inicioContrato?: string;
  inicioRecorrencia?: string;
  valorContrato?: number;
  valorRecorrencia?: number;
  formaPagamento?: string;
  tipoPagamento?: 'UNICO' | 'RECORRENTE';
  cobrancas?: Array<{
    id: number;
    valor: number;
    dataVencimento: string;
    dataPagamento?: string;
    status: 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH_UNDONE' | 
            'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' |
            'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS';
    linkPagamento?: string;
    codigoBarras?: string;
    numeroParcela?: number;
    asaasPaymentId?: string;
  }>;
  categoria?: 'em-dia' | 'pendente' | 'em-atraso' | 'inadimplente';
}

export interface DadosCliente {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  enderecoCompleto: string;
  cep: string;
  celularFinanceiro: string;
  emailFinanceiro: string;
  responsavel: string;
  cpf: string;
  plano: string;
  descricaoNegociacao: string;
  valorRecorrencia: string;
  dataVenda: string;
  dataPrimeiraParcelaRecorrencia: string;
}

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

export const CONTRATOS_MOCK: Contrato[] = [
  // 5 Contratos EM DIA (em dia e não vencidos)
  {
    id: '1',
    titulo: 'Contrato de Desenvolvimento de Sistema ERP',
    cliente: 'Tech Solutions S.A.',
    valor: 45000,
    dataVencimento: '2026-02-20',
    status: 'em_dia',
    descricao: 'Desenvolvimento completo de sistema ERP customizado',
    conteudo: `CONTRATO DE DESENVOLVIMENTO DE SOFTWARE ERP

CONTRATANTE: Tech Solutions S.A.
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Desenvolvimento de sistema ERP completo para gestão empresarial, incluindo módulos de vendas, compras, estoque e financeiro.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor total de R$ 45.000,00 (quarenta e cinco mil reais), dividido em 6 parcelas de R$ 7.500,00.

CLÁUSULA 3 - DO PRAZO
Prazo de desenvolvimento: 6 meses, com entregas parciais a cada 30 dias.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Sistema web responsivo, compatível com principais navegadores, integração com APIs de terceiros.

CLÁUSULA 5 - DO SUPORTE
Suporte técnico por 12 meses após a entrega final.`,
    whatsapp: '5548988281035'
  },
  {
    id: '2',
    titulo: 'Contrato de Consultoria em Compliance LGPD',
    cliente: 'E-commerce Digital Ltda',
    valor: 18000,
    dataVencimento: '2026-01-25',
    status: 'em_dia',
    descricao: 'Adequação completa à LGPD e implementação de controles de privacidade',
    conteudo: `CONTRATO DE CONSULTORIA EM COMPLIANCE LGPD

CONTRATANTE: E-commerce Digital Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Adequação completa da empresa à Lei Geral de Proteção de Dados (LGPD), incluindo mapeamento de dados, implementação de controles e treinamento.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 18.000,00 (dezoito mil reais), pagamento em 3 parcelas de R$ 6.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 75 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Mapeamento de dados pessoais, política de privacidade, termos de uso e relatório de adequação.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Todas as informações sensíveis serão tratadas com absoluto sigilo.`,
    whatsapp: '5548988281035'
  },
  {
    id: '3',
    titulo: 'Contrato de Integração de Sistemas Bancários',
    cliente: 'Fintech Brasil Ltda',
    valor: 35000,
    dataVencimento: '2026-02-15',
    status: 'em_dia',
    descricao: 'Integração completa com APIs bancárias e desenvolvimento de soluções financeiras',
    conteudo: `CONTRATO DE INTEGRAÇÃO DE SISTEMAS BANCÁRIOS

CONTRATANTE: Fintech Brasil Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Desenvolvimento e integração de soluções financeiras com APIs bancárias, incluindo PIX, TED, DOC e conciliação automática.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor total de R$ 35.000,00 (trinta e cinco mil reais), dividido em 5 parcelas de R$ 7.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de desenvolvimento: 120 dias úteis.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Sistema seguro, compatível com regulamentações do Banco Central e certificações de segurança.

CLÁUSULA 5 - DO SUPORTE
Suporte técnico por 24 meses após a entrega.`,
    whatsapp: '5548988281035'
  },
  {
    id: '4',
    titulo: 'Contrato de Consultoria em Fusões e Aquisições',
    cliente: 'Holding Empresarial Ltda',
    valor: 50000,
    dataVencimento: '2026-03-20',
    status: 'em_dia',
    descricao: 'Consultoria especializada em processo de fusão empresarial',
    conteudo: `CONTRATO DE CONSULTORIA EM FUSÕES E AQUISIÇÕES

CONTRATANTE: Holding Empresarial Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Consultoria especializada em processo de fusão empresarial, incluindo due diligence, avaliação e estruturação do negócio.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 50.000,00 (cinquenta mil reais), dividido em 6 parcelas de R$ 8.333,33.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 150 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Due diligence financeira, avaliação de empresas, estruturação do negócio e relatório executivo.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Todas as informações estratégicas serão mantidas em sigilo absoluto.`,
    whatsapp: '5548988281035'
  },
  {
    id: '5',
    titulo: 'Contrato de Implementação de Sistema de Gestão',
    cliente: 'Indústria Moderna S.A.',
    valor: 22000,
    dataVencimento: '2026-01-30',
    status: 'em_dia',
    descricao: 'Implementação de sistema de gestão integrado para indústria',
    conteudo: `CONTRATO DE IMPLEMENTAÇÃO DE SISTEMA DE GESTÃO

CONTRATANTE: Indústria Moderna S.A.
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Implementação de sistema de gestão integrado para controle de produção, estoque e vendas.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 22.000,00 (vinte e dois mil reais), dividido em 4 parcelas de R$ 5.500,00.

CLÁUSULA 3 - DO PRAZO
Prazo de implementação: 90 dias úteis.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Sistema web responsivo com integração a equipamentos industriais.

CLÁUSULA 5 - DO TREINAMENTO
Treinamento completo da equipe operacional.`,
    whatsapp: '5548988281035'
  },

  // 5 Contratos PENDENTES
  {
    id: '6',
    titulo: 'Contrato de Prestação de Serviços - Consultoria Financeira',
    cliente: 'Empresa ABC Ltda',
    valor: 15000,
    dataVencimento: '2024-12-15',
    status: 'pendente',
    descricao: 'Consultoria em gestão financeira e implementação de ERP',
    conteudo: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA FINANCEIRA

CONTRATANTE: Empresa ABC Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
O presente contrato tem por objeto a prestação de serviços de consultoria financeira, incluindo análise de processos, implementação de sistemas ERP e treinamento de equipe.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
O valor total dos serviços é de R$ 15.000,00 (quinze mil reais), a ser pago em 3 parcelas de R$ 5.000,00.

CLÁUSULA 3 - DO PRAZO
O prazo para execução dos serviços é de 90 dias, contados a partir da assinatura do contrato.

CLÁUSULA 4 - DAS OBRIGAÇÕES
O contratado se compromete a entregar relatórios mensais de progresso e capacitar a equipe do contratante.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
As partes se comprometem a manter sigilo sobre informações confidenciais trocadas durante a execução do contrato.`,
    whatsapp: '5548988281035'
  },
  {
    id: '7',
    titulo: 'Contrato de Implementação de Assinatura Digital',
    cliente: 'Advocacia Moderna & Associados',
    valor: 12000,
    dataVencimento: '2024-12-10',
    status: 'pendente',
    descricao: 'Implementação de sistema de assinatura digital para escritório de advocacia',
    conteudo: `CONTRATO DE IMPLEMENTAÇÃO DE SISTEMA DE ASSINATURA DIGITAL

CONTRATANTE: Advocacia Moderna & Associados
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Implementação de sistema completo de assinatura digital, incluindo infraestrutura, treinamento e suporte técnico.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor total de R$ 12.000,00 (doze mil reais), dividido em 4 parcelas de R$ 3.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de implementação: 45 dias úteis.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Sistema compatível com ICP-Brasil, integração com sistemas existentes e interface web responsiva.

CLÁUSULA 5 - DO TREINAMENTO
Treinamento completo da equipe em boas práticas de assinatura digital.`,
    whatsapp: '5548988281035'
  },
  {
    id: '8',
    titulo: 'Contrato de Análise de Viabilidade Financeira',
    cliente: 'Startup Inovadora S.A.',
    valor: 8000,
    dataVencimento: '2024-12-28',
    status: 'pendente',
    descricao: 'Análise de viabilidade para expansão de negócios e captação de investimentos',
    conteudo: `CONTRATO DE ANÁLISE DE VIABILIDADE FINANCEIRA

CONTRATANTE: Startup Inovadora S.A.
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Análise completa de viabilidade financeira para expansão de negócios, incluindo projeções, cenários e recomendações estratégicas.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 8.000,00 (oito mil reais), pagamento à vista.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 30 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Relatório executivo, projeções financeiras, análise de cenários e plano de captação.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Informações estratégicas serão mantidas em sigilo absoluto.`,
    whatsapp: '5548988281035'
  },
  {
    id: '9',
    titulo: 'Contrato de Desenvolvimento de Dashboard Executivo',
    cliente: 'Grupo Empresarial XYZ',
    valor: 15000,
    dataVencimento: '2024-12-30',
    status: 'pendente',
    descricao: 'Desenvolvimento de dashboard executivo com indicadores em tempo real',
    conteudo: `CONTRATO DE DESENVOLVIMENTO DE DASHBOARD EXECUTIVO

CONTRATANTE: Grupo Empresarial XYZ
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Desenvolvimento de dashboard executivo interativo com indicadores financeiros, operacionais e estratégicos em tempo real.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 15.000,00 (quinze mil reais), dividido em 3 parcelas de R$ 5.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de desenvolvimento: 60 dias úteis.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Dashboard responsivo, integração com múltiplas fontes de dados e relatórios exportáveis.

CLÁUSULA 5 - DO TREINAMENTO
Treinamento completo da equipe executiva no uso do dashboard.`,
    whatsapp: '5548988281035'
  },
  {
    id: '10',
    titulo: 'Contrato de Consultoria em Transformação Digital',
    cliente: 'Comércio Tradicional Ltda',
    valor: 20000,
    dataVencimento: '2024-12-25',
    status: 'pendente',
    descricao: 'Consultoria para transformação digital de empresa tradicional',
    conteudo: `CONTRATO DE CONSULTORIA EM TRANSFORMAÇÃO DIGITAL

CONTRATANTE: Comércio Tradicional Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Consultoria para transformação digital completa, incluindo modernização de processos e implementação de tecnologias.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 20.000,00 (vinte mil reais), dividido em 4 parcelas de R$ 5.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 120 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Plano de transformação digital, implementação de soluções e treinamento da equipe.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Informações estratégicas serão mantidas em sigilo absoluto.`,
    whatsapp: '5548988281035'
  },

  // 5 Contratos INADIMPLENTES (vencidos)
  {
    id: '11',
    titulo: 'Contrato de Auditoria Financeira',
    cliente: 'Indústria XYZ Ltda',
    valor: 25000,
    dataVencimento: '2024-01-30',
    status: 'vencido',
    descricao: 'Auditoria completa dos processos financeiros e contábeis',
    conteudo: `CONTRATO DE AUDITORIA FINANCEIRA

CONTRATANTE: Indústria XYZ Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Realização de auditoria completa dos processos financeiros, contábeis e de compliance da empresa.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 25.000,00 (vinte e cinco mil reais), pagamento à vista.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 60 dias úteis.

CLÁUSULA 4 - DO RELATÓRIO
Entrega de relatório detalhado com recomendações e plano de ação.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Todas as informações obtidas durante a auditoria serão mantidas em sigilo absoluto.`,
    whatsapp: '5548988281035'
  },
  {
    id: '12',
    titulo: 'Contrato de Reestruturação Financeira',
    cliente: 'Indústria Metalúrgica ABC S.A.',
    valor: 28000,
    dataVencimento: '2024-01-15',
    status: 'vencido',
    descricao: 'Reestruturação completa da área financeira e implementação de controles',
    conteudo: `CONTRATO DE REESTRUTURAÇÃO FINANCEIRA

CONTRATANTE: Indústria Metalúrgica ABC S.A.
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Reestruturação completa da área financeira, implementação de controles internos e capacitação da equipe.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 28.000,00 (vinte e oito mil reais), pagamento em 4 parcelas de R$ 7.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 90 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Diagnóstico financeiro, plano de reestruturação, implementação de controles e treinamento.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Informações financeiras sensíveis serão tratadas com máximo sigilo.`,
    whatsapp: '5548988281035'
  },
  {
    id: '13',
    titulo: 'Contrato de Consultoria em Gestão de Riscos',
    cliente: 'Banco Regional S.A.',
    valor: 32000,
    dataVencimento: '2024-02-10',
    status: 'vencido',
    descricao: 'Implementação de sistema de gestão de riscos financeiros',
    conteudo: `CONTRATO DE CONSULTORIA EM GESTÃO DE RISCOS

CONTRATANTE: Banco Regional S.A.
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Implementação de sistema completo de gestão de riscos financeiros e operacionais.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 32.000,00 (trinta e dois mil reais), dividido em 4 parcelas de R$ 8.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 100 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Sistema de gestão de riscos, relatórios automatizados e treinamento da equipe.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Informações bancárias serão tratadas com máximo sigilo.`,
    whatsapp: '5548988281035'
  },
  {
    id: '14',
    titulo: 'Contrato de Desenvolvimento de Sistema de Vendas',
    cliente: 'Distribuidora Nacional Ltda',
    valor: 18000,
    dataVencimento: '2024-01-20',
    status: 'vencido',
    descricao: 'Desenvolvimento de sistema de gestão de vendas e CRM',
    conteudo: `CONTRATO DE DESENVOLVIMENTO DE SISTEMA DE VENDAS

CONTRATANTE: Distribuidora Nacional Ltda
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Desenvolvimento de sistema completo de gestão de vendas e CRM para distribuidora.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 18.000,00 (dezoito mil reais), dividido em 3 parcelas de R$ 6.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de desenvolvimento: 75 dias úteis.

CLÁUSULA 4 - DAS ESPECIFICAÇÕES TÉCNICAS
Sistema web com integração a APIs de terceiros e relatórios avançados.

CLÁUSULA 5 - DO SUPORTE
Suporte técnico por 12 meses após a entrega.`,
    whatsapp: '5548988281035'
  },
  {
    id: '15',
    titulo: 'Contrato de Consultoria em Controles Internos',
    cliente: 'Rede de Farmácias Unidos',
    valor: 14000,
    dataVencimento: '2024-02-05',
    status: 'vencido',
    descricao: 'Implementação de controles internos para rede de farmácias',
    conteudo: `CONTRATO DE CONSULTORIA EM CONTROLES INTERNOS

CONTRATANTE: Rede de Farmácias Unidos
CONTRATADO: Star Target Consultoria Financeira

CLÁUSULA 1 - DO OBJETO
Implementação de controles internos para rede de farmácias, incluindo auditoria e compliance.

CLÁUSULA 2 - DO VALOR E FORMA DE PAGAMENTO
Valor de R$ 14.000,00 (quatorze mil reais), pagamento em 2 parcelas de R$ 7.000,00.

CLÁUSULA 3 - DO PRAZO
Prazo de execução: 60 dias úteis.

CLÁUSULA 4 - DAS ENTREGAS
Manual de controles internos, treinamento da equipe e relatório de implementação.

CLÁUSULA 5 - DA CONFIDENCIALIDADE
Informações comerciais serão mantidas em sigilo absoluto.`,
    whatsapp: '5548988281035'
  }
];

export const DADOS_FINANCEIROS_MOCK: DadosFinanceiros = {
  receitas: 245000,
  despesas: 85000,
  lucro: 160000,
  contratosAtivos: 4,
  contratosPendentes: 3,
  contratosVencidos: 3,
  margemBruta: 65.3,
  margemLiquida: 65.3,
  roi: 188.2,
  receitaMensal: [
    { mes: 'Jan', valor: 35000 },
    { mes: 'Fev', valor: 42000 },
    { mes: 'Mar', valor: 58000 },
    { mes: 'Abr', valor: 45000 },
    { mes: 'Mai', valor: 38000 },
    { mes: 'Jun', valor: 27000 }
  ],
  despesasPorCategoria: [
    { categoria: 'Salários', valor: 45000 },
    { categoria: 'Tecnologia', valor: 15000 },
    { categoria: 'Marketing', valor: 12000 },
    { categoria: 'Consultoria', valor: 8000 },
    { categoria: 'Outros', valor: 5000 }
  ],
  indicadores: {
    crescimentoReceita: 23.5,
    eficienciaOperacional: 87.2,
    satisfacaoCliente: 94.8,
    produtividade: 156.7
  }
};
