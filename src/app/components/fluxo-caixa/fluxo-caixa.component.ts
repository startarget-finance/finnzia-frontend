import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ErpFinanceiroService, DfcResponse } from '../../services/erp-financeiro.service';
import { DfcPlanilhaComponent } from './dfc-planilha.component';

@Component({
  selector: 'app-fluxo-caixa',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, DfcPlanilhaComponent],
  templateUrl: './fluxo-caixa.component.html',
})
export class FluxoCaixaComponent implements OnInit {
  private readonly monthsPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  dfcResposta: DfcResponse | null = null;
  mesesSelecionadosFiltro: string[] = [];

  filtrosForm: FormGroup;
  carregando = false;
  erro?: string;
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
    private readonly erpFinanceiroService: ErpFinanceiroService
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

  recarregarDfcDoBomControle(): void {
    this.filtrosForm.patchValue({ forcarAtualizacao: true });
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

    this.erpFinanceiroService
      .gerarDFC({
        dataInicio,
        dataTermino,
        usarCache,
        forcarAtualizacao
      })
      .pipe(
        finalize(() => {
          this.carregando = false;
          if (forcarAtualizacao) {
            this.filtrosForm.patchValue({ forcarAtualizacao: false });
          }
        })
      )
      .subscribe({
        next: (res: DfcResponse) => {
          this.dfcResposta = res;
        },
        error: (err: any) => {
          this.dfcResposta = null;
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
    this.mesesSelecionadosFiltro = [];
    this.carregarDfc();
  }

  filtrarPorMesAno(selecao: { month: string; year: string }): void {
    const monthIndex = this.monthsPt.findIndex((m) => m.toLowerCase() === (selecao.month ?? '').toLowerCase());
    if (monthIndex < 0) {
      return;
    }

    const year = Number(selecao.year);
    if (!Number.isFinite(year)) {
      return;
    }

    const key = `${selecao.month}/${String(year).slice(-2)}`;
    if (!this.mesesSelecionadosFiltro.includes(key)) {
      this.mesesSelecionadosFiltro = [...this.mesesSelecionadosFiltro, key];
    }

    const parsed = this.mesesSelecionadosFiltro
      .map((k) => {
        const [m, y] = k.split('/');
        const idx = this.monthsPt.findIndex((mm) => mm.toLowerCase() === (m ?? '').toLowerCase());
        if (idx < 0) {
          return null;
        }
        const yy = Number(y?.length === 2 ? `20${y}` : y);
        if (!Number.isFinite(yy)) {
          return null;
        }
        return { year: yy, monthIndex: idx };
      })
      .filter((v): v is { year: number; monthIndex: number } => !!v);

    if (!parsed.length) {
      return;
    }

    parsed.sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
    const min = parsed[0];
    const max = parsed[parsed.length - 1];

    const inicio = new Date(min.year, min.monthIndex, 1);
    const termino = new Date(max.year, max.monthIndex + 1, 0);
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

  resetarPeriodo(): void {
    const periodo = this.definirPeriodoInicial();
    this.filtrosForm.patchValue({
      dataInicio: periodo.dataInicio,
      dataTermino: periodo.dataTermino
    });
    this.dataInicial = periodo.dataInicio;
    this.dataFinal = periodo.dataTermino;
    this.mesesSelecionadosFiltro = [];
    this.visibleMonth = new Date(this.dataInicial);
    this.buildCalendar();
    this.carregarDfc();
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
