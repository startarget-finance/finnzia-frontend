import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { ErpFinanceiroService, MovimentacaoFinanceira } from '../../services/erp-financeiro.service';
import { CompanySelectorService } from '../../services/company-selector.service';

interface PassoRotina {
  titulo: string;
  descricao: string;
  rota: string;
  acao: string;
}

interface MesReferenciaOption {
  /** YYYY-MM (ex.: 2026-03) */
  value: string;
  /** Ex.: Mar/26 */
  label: string;
}

@Component({
  selector: 'app-rotina',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './rotina.component.html',
})
export class RotinaComponent implements OnInit, OnDestroy {
  readonly mesesReferencia: MesReferenciaOption[] = this.gerarMesesReferencia(18);
  mesReferenciaSelecionado: string = this.mesesReferencia[0]?.value ?? '';

  totalEntrou = 0;
  totalPagou = 0;
  linhasSelecionadasEntrou = 0;
  linhasSelecionadasPagou = 0;
  carregandoResumo = false;
  carregandoLinhas = false;
  carregandoAcoesHoje = false;
  private readonly moedaBRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

  private readonly destroy$ = new Subject<void>();

  // UI: popover "linhas incluídas no cálculo"
  popoverAberto: null | 'entrou' | 'pagou' = null;
  linhasDisponiveisEntrou: string[] = [];
  linhasDisponiveisPagou: string[] = [];
  linhasSelecionadasEntrouSet = new Set<string>();
  linhasSelecionadasPagouSet = new Set<string>();
  private movimentacoesMes: MovimentacaoFinanceira[] = [];

  // "Ações de hoje" (filtrado no dia atual)
  valorPagarHoje = 0;
  qtdPagarHoje = 0;
  valorReceberHoje = 0;
  qtdReceberHoje = 0;
  saldoConciliarHoje = 0;
  qtdConciliarHoje = 0;

  constructor(
    private erpFinanceiroService: ErpFinanceiroService,
    private companySelectorService: CompanySelectorService,
  ) {}

  ngOnInit(): void {
    this.carregarResumoMesAtual();
    this.carregarLinhasDoMes();
    this.carregarAcoesDeHoje();
    this.companySelectorService.empresaSelecionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.popoverAberto = null;
        this.carregarResumoMesAtual();
        this.carregarLinhasDoMes();
        this.carregarAcoesDeHoje();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  passos: PassoRotina[] = [
    {
      titulo: 'Contas a pagar hoje',
      descricao: 'Revise os compromissos do dia, valide valores, vencimentos e priorize os pagamentos mais urgentes.',
      rota: '/contas-a-pagar',
      acao: 'Abrir Contas a pagar'
    },
    {
      titulo: 'Contas a receber hoje',
      descricao: 'Acompanhe recebimentos previstos para o dia e identifique pendências para cobrança imediata.',
      rota: '/contas-a-receber',
      acao: 'Abrir Contas a receber'
    },
    {
      titulo: 'Conciliar',
      descricao: 'Concilie pagamentos e recebimentos do dia para garantir que o saldo esteja correto e atualizado.',
      rota: '/movimentacoes',
      acao: 'Abrir Conciliação'
    }
  ];

  get quantoSobrou(): number {
    return (this.totalEntrou ?? 0) - (this.totalPagou ?? 0);
  }

  get mesReferenciaLabelAtual(): string {
    return this.mesesReferencia.find(m => m.value === this.mesReferenciaSelecionado)?.label ?? '';
  }

  formatarMoeda(valor: number): string {
    return this.moedaBRL.format(Number.isFinite(valor) ? valor : 0);
  }

  aoMudarMesReferencia(): void {
    this.popoverAberto = null;
    this.carregarResumoMesAtual();
    this.carregarLinhasDoMes();
  }

  private carregarAcoesDeHoje(): void {
    const empresaId = this.companySelectorService.obterIdEmpresaSelecionada();
    if (!empresaId) {
      this.valorPagarHoje = 0;
      this.qtdPagarHoje = 0;
      this.valorReceberHoje = 0;
      this.qtdReceberHoje = 0;
      this.saldoConciliarHoje = 0;
      this.qtdConciliarHoje = 0;
      return;
    }

    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd = String(hoje.getDate()).padStart(2, '0');
    const dataHoje = `${yyyy}-${mm}-${dd}`;

    this.carregandoAcoesHoje = true;
    // Busca lista do dia no backend e calcula os cartões localmente:
    // - "Pagar/Receber hoje": pendentes (sem DataQuitacao)
    // - "Conciliar": saldo líquido do dia (todas)
    this.erpFinanceiroService.buscarMovimentacoes({
      idsEmpresa: empresaId,
      dataInicio: dataHoje,
      dataTermino: dataHoje,
      tipoData: 'DataVencimento',
      itensPorPagina: 5000,
      numeroDaPagina: 1,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          const list = resp.movimentacoes ?? [];

          const pendentes = list.filter(m => !(m as any).DataQuitacao);
          const pagar = pendentes.filter(m => !!m.Debito);
          const receber = pendentes.filter(m => !m.Debito);

          this.valorPagarHoje = pagar.reduce((acc, m) => acc + (m.Valor ?? 0), 0);
          this.qtdPagarHoje = pagar.length;

          this.valorReceberHoje = receber.reduce((acc, m) => acc + (m.Valor ?? 0), 0);
          this.qtdReceberHoje = receber.length;

          // Saldo do dia: todas as movimentações do dia (pendentes + quitadas)
          const receitasDia = list.filter(m => !m.Debito).reduce((acc, m) => acc + (m.Valor ?? 0), 0);
          const despesasDia = list.filter(m => !!m.Debito).reduce((acc, m) => acc + (m.Valor ?? 0), 0);
          this.saldoConciliarHoje = receitasDia - despesasDia;
          this.qtdConciliarHoje = list.length;

          this.carregandoAcoesHoje = false;
        },
        error: () => {
          this.valorPagarHoje = 0;
          this.qtdPagarHoje = 0;
          this.valorReceberHoje = 0;
          this.qtdReceberHoje = 0;
          this.saldoConciliarHoje = 0;
          this.qtdConciliarHoje = 0;
          this.carregandoAcoesHoje = false;
        },
      });
  }

  hojeIso(): string {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd = String(hoje.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  alternarPopover(card: 'entrou' | 'pagou'): void {
    this.popoverAberto = this.popoverAberto === card ? null : card;
  }

  fecharPopover(): void {
    this.popoverAberto = null;
  }

  isLinhaSelecionada(card: 'entrou' | 'pagou', linha: string): boolean {
    return (card === 'entrou' ? this.linhasSelecionadasEntrouSet : this.linhasSelecionadasPagouSet).has(linha);
  }

  toggleLinha(card: 'entrou' | 'pagou', linha: string): void {
    const set = card === 'entrou' ? this.linhasSelecionadasEntrouSet : this.linhasSelecionadasPagouSet;
    if (set.has(linha)) {
      set.delete(linha);
    } else {
      set.add(linha);
    }
    this.recalcularTotaisPorLinhas();
  }

  selecionarTodasLinhas(card: 'entrou' | 'pagou'): void {
    const disponiveis = card === 'entrou' ? this.linhasDisponiveisEntrou : this.linhasDisponiveisPagou;
    const set = card === 'entrou' ? this.linhasSelecionadasEntrouSet : this.linhasSelecionadasPagouSet;
    set.clear();
    disponiveis.forEach(l => set.add(l));
    this.recalcularTotaisPorLinhas();
  }

  limparSelecaoLinhas(card: 'entrou' | 'pagou'): void {
    const set = card === 'entrou' ? this.linhasSelecionadasEntrouSet : this.linhasSelecionadasPagouSet;
    set.clear();
    this.recalcularTotaisPorLinhas();
  }

  private carregarResumoMesAtual(): void {
    const empresaId = this.companySelectorService.obterIdEmpresaSelecionada();
    if (!empresaId) {
      this.totalEntrou = 0;
      this.totalPagou = 0;
      this.linhasSelecionadasEntrou = 0;
      this.linhasSelecionadasPagou = 0;
      return;
    }

    const { dataInicio, dataTermino } = this.obterPeriodoDoMes(this.mesReferenciaSelecionado);

    this.carregandoResumo = true;
    forkJoin({
      receitas: this.erpFinanceiroService.buscarMovimentacoes({
        idsEmpresa: empresaId,
        dataInicio,
        dataTermino,
        tipoData: 'DataVencimento',
        tipo: 'receita',
        itensPorPagina: 1,
        numeroDaPagina: 1,
      }),
      despesas: this.erpFinanceiroService.buscarMovimentacoes({
        idsEmpresa: empresaId,
        dataInicio,
        dataTermino,
        tipoData: 'DataVencimento',
        tipo: 'despesa',
        itensPorPagina: 1,
        numeroDaPagina: 1,
      }),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ receitas, despesas }) => {
          this.totalEntrou = Number(receitas.totalReceitas ?? 0);
          this.totalPagou = Number(despesas.totalDespesas ?? 0);
          this.linhasSelecionadasEntrou = Number(receitas.total ?? 0);
          this.linhasSelecionadasPagou = Number(despesas.total ?? 0);
          this.carregandoResumo = false;
        },
        error: () => {
          this.totalEntrou = 0;
          this.totalPagou = 0;
          this.linhasSelecionadasEntrou = 0;
          this.linhasSelecionadasPagou = 0;
          this.carregandoResumo = false;
        },
      });
  }

  private carregarLinhasDoMes(): void {
    const empresaId = this.companySelectorService.obterIdEmpresaSelecionada();
    if (!empresaId) {
      this.movimentacoesMes = [];
      this.linhasDisponiveisEntrou = [];
      this.linhasDisponiveisPagou = [];
      this.linhasSelecionadasEntrouSet.clear();
      this.linhasSelecionadasPagouSet.clear();
      return;
    }

    const { dataInicio, dataTermino } = this.obterPeriodoDoMes(this.mesReferenciaSelecionado);
    this.carregandoLinhas = true;

    // Busca uma amostra grande do mês para descobrir as "linhas" (categorias root).
    // Se o mês tiver mais registros do que o limite retornado, ainda assim já habilita o seletor
    // com o que veio; os totais seguem vindo do backend no resumo geral.
    this.erpFinanceiroService.buscarMovimentacoes({
      idsEmpresa: empresaId,
      dataInicio,
      dataTermino,
      tipoData: 'DataVencimento',
      itensPorPagina: 5000,
      numeroDaPagina: 1,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.movimentacoesMes = resp.movimentacoes ?? [];

          const receitas = this.movimentacoesMes.filter(m => !m.Debito);
          const despesas = this.movimentacoesMes.filter(m => !!m.Debito);

          const linhasReceita = this.extrairLinhas(receitas);
          const linhasDespesa = this.extrairLinhas(despesas);

          this.linhasDisponiveisEntrou = linhasReceita;
          this.linhasDisponiveisPagou = linhasDespesa;

          // Seleciona tudo por padrão (equivalente a "todas as linhas incluídas")
          this.linhasSelecionadasEntrouSet = new Set(linhasReceita);
          this.linhasSelecionadasPagouSet = new Set(linhasDespesa);

          // Se já estamos com movimentações do mês carregadas, recalcula os cards por filtro
          // (deixa consistente com o popover). Caso contrário, mantém os totais do backend.
          this.recalcularTotaisPorLinhas(true);
          this.carregandoLinhas = false;
        },
        error: () => {
          this.movimentacoesMes = [];
          this.linhasDisponiveisEntrou = [];
          this.linhasDisponiveisPagou = [];
          this.linhasSelecionadasEntrouSet.clear();
          this.linhasSelecionadasPagouSet.clear();
          this.carregandoLinhas = false;
        }
      });
  }

  private extrairLinhas(list: MovimentacaoFinanceira[]): string[] {
    const set = new Set<string>();
    list.forEach(m => {
      const root = (m.Valores?.[0]?.NomeCategoriaRoot || m.NomeCategoriaFinanceira || '').trim();
      if (root) set.add(root);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  private recalcularTotaisPorLinhas(naoSobrescreverSeVazio = false): void {
    // Se não temos dados do mês carregados, não dá para recalcular localmente.
    if (!this.movimentacoesMes.length) {
      return;
    }

    const receitasSelecionadas = new Set(this.linhasSelecionadasEntrouSet);
    const despesasSelecionadas = new Set(this.linhasSelecionadasPagouSet);

    const receitas = this.movimentacoesMes.filter(m => {
      if (m.Debito) return false;
      const root = (m.Valores?.[0]?.NomeCategoriaRoot || m.NomeCategoriaFinanceira || '').trim();
      return receitasSelecionadas.size === 0 ? false : receitasSelecionadas.has(root);
    });
    const despesas = this.movimentacoesMes.filter(m => {
      if (!m.Debito) return false;
      const root = (m.Valores?.[0]?.NomeCategoriaRoot || m.NomeCategoriaFinanceira || '').trim();
      return despesasSelecionadas.size === 0 ? false : despesasSelecionadas.has(root);
    });

    const somaReceitas = receitas.reduce((acc, m) => acc + (m.Valor ?? 0), 0);
    const somaDespesas = despesas.reduce((acc, m) => acc + (m.Valor ?? 0), 0);

    if (!naoSobrescreverSeVazio || receitasSelecionadas.size > 0) {
      this.totalEntrou = somaReceitas;
      this.linhasSelecionadasEntrou = receitas.length;
    }
    if (!naoSobrescreverSeVazio || despesasSelecionadas.size > 0) {
      this.totalPagou = somaDespesas;
      this.linhasSelecionadasPagou = despesas.length;
    }
  }

  private obterPeriodoDoMes(yyyyMm: string): { dataInicio: string; dataTermino: string } {
    const [yRaw, mRaw] = String(yyyyMm || '').split('-');
    const y = Number(yRaw);
    const m = Number(mRaw);
    const ano = Number.isFinite(y) ? y : new Date().getFullYear();
    const mesIndex = Number.isFinite(m) ? Math.min(12, Math.max(1, m)) - 1 : new Date().getMonth();

    const inicio = new Date(ano, mesIndex, 1);
    const fim = new Date(ano, mesIndex + 1, 0);

    const dataInicio = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`;
    const dataTermino = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`;
    return { dataInicio, dataTermino };
  }

  private gerarMesesReferencia(qtd: number): MesReferenciaOption[] {
    const base = new Date();
    base.setDate(1);

    const meses: MesReferenciaOption[] = [];
    for (let i = 0; i < Math.max(1, qtd); i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ value, label: this.formatarMesReferencia(d) });
    }
    return meses;
  }

  private formatarMesReferencia(d: Date): string {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mm = meses[d.getMonth()] ?? '';
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${yy}`;
  }
}
