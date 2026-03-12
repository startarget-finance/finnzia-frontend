import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { BomControleService, DfcResponse, DfcIndicadores } from '../../services/bomcontrole.service';

type TipoLinha = 'SECAO' | 'RECEITA' | 'DESPESA' | 'RESULTADO' | 'FATURAMENTO' | 'SUBTOTAL_RECEITA' | 'SUBTOTAL_DESPESA';

interface LinhaTabela {
  nome: string;
  tipo: TipoLinha;
  nivel: 0 | 1;
  grupo?: string | null;
  valores: (number | null)[];
  total?: number;
  media?: number;
}

interface DfcMetadados {
  fonteDados: string;
  fallbackAtivo: boolean;
  tempoProcessamentoMs: number;
  paginasProcessadas: number;
  paginasEstimadas: number;
  usandoCache: boolean;
  atualizadoEm: string;
}

@Component({
  selector: 'app-fluxo-caixa',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './fluxo-caixa.component.html',
})
export class FluxoCaixaComponent implements OnInit {
  filtrosForm: FormGroup;
  meses: string[] = [];
  dfcLinhas: LinhaTabela[] = [];
  indicadores?: DfcIndicadores;
  metadados?: DfcMetadados;
  carregando = false;
  erro?: string;
  expandirReceitas = true;
  expandirDespesas = true;
  mostrarRangePicker = false;
  visibleMonth: Date = new Date();
  calendarDays: Array<{ day: number; inCurrentMonth: boolean; dateStr: string }> = [];
  private tempRangeStart: string | null = null;
  private tempRangeEnd: string | null = null;
  private hoverRangeDate: string | null = null;
  dataInicial = '';
  dataFinal = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly bomControleService: BomControleService
  ) {
    const periodo = this.definirPeriodoInicial();
    this.dataInicial = periodo.dataInicio;
    this.dataFinal = periodo.dataTermino;
    this.filtrosForm = this.fb.group({
      dataInicio: [periodo.dataInicio],
      dataTermino: [periodo.dataTermino],
      usarCache: [true],
      forcarAtualizacao: [false]
    });
    this.visibleMonth = new Date(this.dataInicial);
    this.buildCalendar();
  }

  ngOnInit(): void {
    this.carregarDfc();
  }

  carregarDfc(): void {
    if (this.filtrosForm.invalid) {
      return;
    }
    const { dataInicio, dataTermino, usarCache, forcarAtualizacao } = this.filtrosForm.value;
    if (new Date(dataInicio) > new Date(dataTermino)) {
      this.erro = 'A data inicial não pode ser maior que a data final.';
      return;
    }

    this.carregando = true;
    this.erro = undefined;

    this.bomControleService
      .gerarDFC({
        dataInicio,
        dataTermino,
        usarCache,
        forcarAtualizacao
      })
      .pipe(finalize(() => (this.carregando = false)))
      .subscribe({
        next: (res) => this.processarResposta(res),
        error: (err) => {
          const mensagem = err?.error?.mensagem ?? 'Não foi possível carregar o demonstrativo.';
          this.erro = mensagem;
        }
      });
  }

  ajustarPeriodo(meses: number): void {
    const termino = new Date();
    const inicio = new Date(termino);
    inicio.setMonth(inicio.getMonth() - (meses - 1));
    inicio.setDate(1);

    const dataInicio = this.formatarDataInput(inicio);
    const dataTermino = this.formatarDataInput(termino);

    this.filtrosForm.patchValue({
      dataInicio,
      dataTermino
    });
    this.dataInicial = dataInicio;
    this.dataFinal = dataTermino;
    this.carregarDfc();
  }

  private processarResposta(resposta: DfcResponse): void {
    this.meses = resposta.meses ?? [];
    this.dfcLinhas = (resposta.linhas ?? []).map((linha) => ({
      nome: linha.nome,
      tipo: linha.tipo as TipoLinha,
      nivel: (linha.nivel ?? 0) as 0 | 1,
      grupo: linha.grupo,
      valores: this.alinharValores(linha.valores, this.meses.length),
      total: linha.total,
      media: linha.media
    }));
    this.indicadores = resposta.indicadores;
    this.metadados = {
      fonteDados: resposta.fonteDados,
      fallbackAtivo: resposta.fallbackAtivo,
      tempoProcessamentoMs: resposta.tempoProcessamentoMs,
      paginasProcessadas: resposta.paginasProcessadas,
      paginasEstimadas: resposta.paginasEstimadas,
      usandoCache: resposta.usandoCache,
      atualizadoEm: resposta.atualizadoEm
    };
  }

  exportarCsv(): void {
    if (!this.dfcLinhas.length) {
      return;
    }
    const header = ['Descrição', ...this.meses, 'TOTAL', 'MÉDIA'];
    const linhas = this.dfcLinhas.map((linha) => [
      linha.nome,
      ...linha.valores.map((v) => (v ?? 0).toString().replace('.', ',')),
      (linha.total ?? 0).toString().replace('.', ','),
      (linha.media ?? 0).toString().replace('.', ',')
    ]);
    const conteudo = [header, ...linhas].map((row) => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const periodo = `${this.filtrosForm.value.dataInicio}_${this.filtrosForm.value.dataTermino}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `DFC_${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  imprimir(): void {
    window.print();
  }

  formatCurrency(value?: number | null): string {
    const numero = value ?? 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
  }

  formatCurrencySigned(value?: number | null): string {
    const numero = value ?? 0;
    if (numero < 0) {
      return `(${this.formatCurrency(Math.abs(numero))})`;
    }
    return this.formatCurrency(numero);
  }

  isLinhaVisivel(linha: LinhaTabela): boolean {
    if (linha.tipo === 'RECEITA' || linha.tipo === 'FATURAMENTO') {
      return this.expandirReceitas;
    }
    if (linha.tipo === 'DESPESA') {
      return this.expandirDespesas;
    }
    return true;
  }

  alternarReceitas(): void {
    this.expandirReceitas = !this.expandirReceitas;
  }

  alternarDespesas(): void {
    this.expandirDespesas = !this.expandirDespesas;
  }

  /** Redefine o período para o mês atual e recarrega o DFC (equivalente a “resetar filtros”). */
  resetarPeriodo(): void {
    const periodo = this.definirPeriodoInicial();
    this.filtrosForm.patchValue({
      dataInicio: periodo.dataInicio,
      dataTermino: periodo.dataTermino
    });
    this.dataInicial = periodo.dataInicio;
    this.dataFinal = periodo.dataTermino;
    this.visibleMonth = new Date(this.dataInicial);
    this.buildCalendar();
    this.carregarDfc();
  }

  mostrarModalDetalhesDfc = false;
  tipoModalDetalhesDfc: 'receita' | 'despesa' = 'receita';

  abrirModalDetalhesDfc(tipo: 'receita' | 'despesa'): void {
    this.tipoModalDetalhesDfc = tipo;
    this.mostrarModalDetalhesDfc = true;
  }

  fecharModalDetalhesDfc(): void {
    this.mostrarModalDetalhesDfc = false;
  }

  /** Linhas do DFC que compõem receitas (RECEITA, FATURAMENTO) ou despesas (DESPESA). */
  getLinhasDetalhesDfc(tipo: 'receita' | 'despesa'): LinhaTabela[] {
    if (tipo === 'receita') {
      return this.dfcLinhas.filter((l) => l.tipo === 'RECEITA' || l.tipo === 'FATURAMENTO');
    }
    return this.dfcLinhas.filter((l) => l.tipo === 'DESPESA');
  }

  get possuiDados(): boolean {
    return this.dfcLinhas.length > 0 && this.meses.length > 0;
  }

  private alinharValores(valores: Array<number | null> | undefined, tamanho: number): (number | null)[] {
    const base = valores ? [...valores] : [];
    while (base.length < tamanho) {
      base.push(null);
    }
    if (base.length > tamanho) {
      base.length = tamanho;
    }
    return base;
  }

  private definirPeriodoInicial(): { dataInicio: string; dataTermino: string } {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const termino = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return {
      dataInicio: this.formatarDataInput(inicio),
      dataTermino: this.formatarDataInput(termino)
    };
  }

  private formatarDataInput(data: Date): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private somar(valores: (number | null)[]): number {
    return valores.reduce((acc: number, valor) => acc + (valor ?? 0), 0);
  }

  private media(valores: (number | null)[]): number {
    const existentes = valores.filter((valor) => typeof valor === 'number') as number[];
    if (!existentes.length) {
      return 0;
    }
    return this.somar(existentes) / existentes.length;
  }

  // ===== Date Range Picker =====
  toggleRangePicker(): void {
    this.mostrarRangePicker = !this.mostrarRangePicker;
    if (this.mostrarRangePicker) {
      this.tempRangeStart = null;
      this.tempRangeEnd = null;
      this.hoverRangeDate = null;
      this.visibleMonth = this.dataInicial ? new Date(this.dataInicial + 'T00:00:00') : new Date();
      this.buildCalendar();
    }
  }

  cancelRangePicker(): void {
    this.mostrarRangePicker = false;
  }

  applyRangePicker(): void {
    if (this.tempRangeStart) {
      const rangeEnd = this.tempRangeEnd ?? this.tempRangeStart;
      const inicio = this.tempRangeStart <= rangeEnd ? this.tempRangeStart : rangeEnd;
      const termino = this.tempRangeStart <= rangeEnd ? rangeEnd : this.tempRangeStart;
      this.atualizarPeriodoSelecionado(inicio, termino);
      this.carregarDfc();
    }
    this.mostrarRangePicker = false;
  }

  clearRange(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
    const periodo = this.definirPeriodoInicial();
    this.atualizarPeriodoSelecionado(periodo.dataInicio, periodo.dataTermino);
    this.mostrarRangePicker = false;
    this.carregarDfc();
  }

  prevMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() - 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  nextMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() + 1);
    this.visibleMonth = d;
    this.buildCalendar();
  }

  getMonthYearLabel(): string {
    const month = this.visibleMonth.toLocaleString('pt-BR', { month: 'long' });
    const year = this.visibleMonth.getFullYear();
    return `${month} de ${year}`;
  }

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
      return;
    }
    if (this.tempRangeStart && !this.tempRangeEnd) {
      this.tempRangeEnd = dateStr;
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  isStart(dateStr: string): boolean {
    return !!this.tempRangeStart && this.tempRangeStart === dateStr;
  }

  isEnd(dateStr: string): boolean {
    return !!this.tempRangeEnd && this.tempRangeEnd === dateStr;
  }

  isBetween(dateStr: string): boolean {
    const start = this.tempRangeStart;
    const end = this.tempRangeEnd || this.hoverRangeDate;
    if (!start || !end) {
      return false;
    }
    const inicio = start <= end ? start : end;
    const termino = start <= end ? end : start;
    return dateStr > inicio && dateStr < termino;
  }

  private atualizarPeriodoSelecionado(inicio: string, termino: string): void {
    const inicioFormatado = inicio.split('T')[0];
    const terminoFormatado = termino.split('T')[0];
    this.dataInicial = inicioFormatado;
    this.dataFinal = terminoFormatado;
    this.filtrosForm.patchValue({
      dataInicio: inicioFormatado,
      dataTermino: terminoFormatado
    });
  }

  private buildCalendar(): void {
    const year = this.visibleMonth.getFullYear();
    const month = this.visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: Array<{ day: number; inCurrentMonth: boolean; dateStr: string }> = [];

    for (let i = startWeekDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, inCurrentMonth: false, dateStr: this.dateToStr(date) });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({ day: d, inCurrentMonth: true, dateStr: this.dateToStr(date) });
    }

    let nextDay = 1;
    while (days.length % 7 !== 0) {
      const date = new Date(year, month + 1, nextDay);
      days.push({ day: nextDay, inCurrentMonth: false, dateStr: this.dateToStr(date) });
      nextDay++;
    }

    this.calendarDays = days;
  }

  private dateToStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T00:00:00`;
  }
}


