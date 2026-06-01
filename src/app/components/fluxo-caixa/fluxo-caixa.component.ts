import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ErpFinanceiroService, DfcResponse } from '../../services/erp-financeiro.service';
import { DfcPlanilhaComponent } from './dfc-planilha.component';
import { PeriodoRangePickerComponent } from '../../shared/components/periodo-range-picker/periodo-range-picker.component';

@Component({
  selector: 'app-fluxo-caixa',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, DfcPlanilhaComponent, PeriodoRangePickerComponent],
  templateUrl: './fluxo-caixa.component.html',
})
export class FluxoCaixaComponent implements OnInit {
  private readonly monthsPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  dfcResposta: DfcResponse | null = null;
  mesesSelecionadosFiltro: string[] = [];

  filtrosForm: FormGroup;
  carregando = false;
  erro?: string;
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
  }

  ngOnInit(): void {
    this.carregarDfc();
  }

  atualizarDfcAgora(): void {
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
    this.carregarDfc();
  }

  onPeriodoAplicado(event: { dataInicial: string; dataFinal: string }): void {
    this.atualizarPeriodoSelecionado(event.dataInicial, event.dataFinal);
    this.carregarDfc();
  }

  onPeriodoLimpar(): void {
    const periodo = this.definirPeriodoInicial();
    this.atualizarPeriodoSelecionado(periodo.dataInicio, periodo.dataTermino);
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

}
