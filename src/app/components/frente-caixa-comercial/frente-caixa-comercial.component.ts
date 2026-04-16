import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CobrancaDTO, ContratoDTO, ContratoService } from '../../services/contrato.service';

export interface LinhaCobrancaFrente {
  contrato: ContratoDTO;
  cobranca: CobrancaDTO;
  /** Ordem de urgência para lista */
  prioridade: number;
}

type FiltroFila = 'todos' | 'criticos' | 'hoje' | 'semana';

function isoDiaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoToDate(isoLike: string | undefined): Date | null {
  if (!isoLike) {
    return null;
  }
  const part = `${isoLike}`.slice(0, 10);
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) {
    return null;
  }
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-frente-caixa-comercial',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './frente-caixa-comercial.component.html'
})
export class FrenteCaixaComercialComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;
  contratos: ContratoDTO[] = [];

  recebidoMes = 0;
  emAberto = 0;
  venceHoje = 0;
  atrasado = 0;
  totalAberto = 0;
  totalRecebidasMes = 0;

  filaPrioritaria: LinhaCobrancaFrente[] = [];
  ultimosRecebidos: LinhaCobrancaFrente[] = [];

  hojeIso = isoDiaLocal(new Date());
  filtroFila: FiltroFila = 'criticos';
  paginaAtualFila = 1;
  readonly itensPorPaginaFila = 12;

  private destroy$ = new Subject<void>();

  constructor(private contratoService: ContratoService) {}

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  carregar(): void {
    this.hojeIso = isoDiaLocal(new Date());
    this.loading = true;
    this.error = null;
    this.contratoService
      .buscarComFiltros(
        undefined,
        undefined,
        undefined,
        0,
        500,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'dataCriacao,desc'
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.contratos = res.content || [];
          this.recompute();
          this.loading = false;
        },
        error: () => {
          this.error = 'Não foi possível carregar os dados. Tente novamente.';
          this.loading = false;
          this.contratos = [];
          this.recompute();
        }
      });
  }

  private recompute(): void {
    const hoje = this.hojeIso;
    const agora = new Date();
    const y = agora.getFullYear();
    const mo = String(agora.getMonth() + 1).padStart(2, '0');
    const prefixMes = `${y}-${mo}`;

    let sumRecebidoMes = 0;
    let sumAberto = 0;
    let nVenceHoje = 0;
    let nAtrasado = 0;
    let nAberto = 0;
    let nRecebidasMes = 0;

    const linhas: LinhaCobrancaFrente[] = [];

    for (const contrato of this.contratos) {
      const cobs = contrato.cobrancas || [];
      for (const cob of cobs) {
        const valor = Number(cob.valor || 0);
        const venc = (cob.dataVencimento || '').slice(0, 10);
        const pagoEm = (cob.dataPagamento || '').slice(0, 10);

        if (cob.status === 'RECEIVED' || cob.status === 'DUNNING_RECEIVED') {
          if (pagoEm && pagoEm.startsWith(prefixMes)) {
            sumRecebidoMes += valor;
            nRecebidasMes++;
          }
          linhas.push({
            contrato,
            cobranca: cob,
            prioridade: 100
          });
          continue;
        }

        if (
          cob.status === 'PENDING' ||
          cob.status === 'OVERDUE' ||
          cob.status === 'DUNNING_REQUESTED'
        ) {
          sumAberto += valor;
          nAberto++;
          const atraso = venc && venc < hoje;
          if (atraso) {
            nAtrasado++;
          } else if (venc === hoje) {
            nVenceHoje++;
          }
          const prioridade = atraso ? 0 : venc === hoje ? 1 : venc > hoje ? 2 : 3;
          linhas.push({ contrato, cobranca: cob, prioridade });
        }
      }
    }

    this.recebidoMes = sumRecebidoMes;
    this.emAberto = sumAberto;
    this.venceHoje = nVenceHoje;
    this.atrasado = nAtrasado;
    this.totalAberto = nAberto;
    this.totalRecebidasMes = nRecebidasMes;

    const abertas = linhas
      .filter((l) => l.prioridade < 100)
      .sort((a, b) => {
        if (a.prioridade !== b.prioridade) {
          return a.prioridade - b.prioridade;
        }
        return (a.cobranca.dataVencimento || '').localeCompare(b.cobranca.dataVencimento || '');
      });

    this.filaPrioritaria = abertas;

    this.ultimosRecebidos = linhas
      .filter((l) => l.prioridade === 100)
      .filter((l) => {
        const pe = (l.cobranca.dataPagamento || '').slice(0, 10);
        return pe && pe.startsWith(prefixMes);
      })
      .sort((a, b) =>
        (b.cobranca.dataPagamento || '').localeCompare(a.cobranca.dataPagamento || '')
      )
      .slice(0, 15);

    this.ajustarPaginaFila();

  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }

  fmtData(iso: string | undefined): string {
    if (!iso) {
      return '—';
    }
    const d = `${iso}`.slice(0, 10);
    if (d.length < 10) {
      return iso;
    }
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  nomeCliente(c: ContratoDTO): string {
    return c.cliente?.razaoSocial || c.cliente?.nomeFantasia || 'Cliente';
  }

  abrirLink(cob: CobrancaDTO): void {
    const url = cob.linkPagamento;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  statusLabel(cob: CobrancaDTO): string {
    if (cob.status === 'RECEIVED' || cob.status === 'DUNNING_RECEIVED') {
      return 'Pago';
    }
    if (cob.status === 'OVERDUE' || cob.status === 'DUNNING_REQUESTED') {
      return 'Atrasado';
    }
    return 'Pendente';
  }

  badgeClass(cob: CobrancaDTO): string {
    if (cob.status === 'RECEIVED' || cob.status === 'DUNNING_RECEIVED') {
      return 'bg-emerald-100 text-emerald-800';
    }
    if (cob.status === 'OVERDUE' || cob.status === 'DUNNING_REQUESTED') {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-amber-100 text-amber-800';
  }

  setFiltroFila(filtro: FiltroFila): void {
    this.filtroFila = filtro;
    this.paginaAtualFila = 1;
  }

  get filaFiltradaBase(): LinhaCobrancaFrente[] {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    return this.filaPrioritaria.filter((row) => {
      const vencDate = parseIsoToDate(row.cobranca.dataVencimento);
      if (!vencDate) {
        return this.filtroFila === 'todos';
      }
      if (this.filtroFila === 'todos') {
        return true;
      }
      const diff = this.diffDias(hojeDate, vencDate);
      if (this.filtroFila === 'criticos') {
        return diff <= 0;
      }
      if (this.filtroFila === 'hoje') {
        return diff === 0;
      }
      return diff > 0 && diff <= 7;
    });
  }

  get filaFiltrada(): LinhaCobrancaFrente[] {
    const ini = (this.paginaAtualFila - 1) * this.itensPorPaginaFila;
    const fim = ini + this.itensPorPaginaFila;
    return this.filaFiltradaBase.slice(ini, fim);
  }

  get totalPaginasFila(): number {
    const total = this.filaFiltradaBase.length;
    return Math.max(1, Math.ceil(total / this.itensPorPaginaFila));
  }

  get inicioPaginaFila(): number {
    if (this.filaFiltradaBase.length === 0) {
      return 0;
    }
    return (this.paginaAtualFila - 1) * this.itensPorPaginaFila + 1;
  }

  get fimPaginaFila(): number {
    if (this.filaFiltradaBase.length === 0) {
      return 0;
    }
    return Math.min(this.paginaAtualFila * this.itensPorPaginaFila, this.filaFiltradaBase.length);
  }

  irPrimeiraPaginaFila(): void {
    this.paginaAtualFila = 1;
  }

  irPaginaAnteriorFila(): void {
    this.paginaAtualFila = Math.max(1, this.paginaAtualFila - 1);
  }

  irProximaPaginaFila(): void {
    this.paginaAtualFila = Math.min(this.totalPaginasFila, this.paginaAtualFila + 1);
  }

  irUltimaPaginaFila(): void {
    this.paginaAtualFila = this.totalPaginasFila;
  }

  private ajustarPaginaFila(): void {
    if (this.paginaAtualFila > this.totalPaginasFila) {
      this.paginaAtualFila = this.totalPaginasFila;
    }
    if (this.paginaAtualFila < 1) {
      this.paginaAtualFila = 1;
    }
  }

  get totalCriticos(): number {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    return this.filaPrioritaria.filter((row) => {
      const vencDate = parseIsoToDate(row.cobranca.dataVencimento);
      return vencDate ? this.diffDias(hojeDate, vencDate) <= 0 : false;
    }).length;
  }

  get totalHoje(): number {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    return this.filaPrioritaria.filter((row) => {
      const vencDate = parseIsoToDate(row.cobranca.dataVencimento);
      return vencDate ? this.diffDias(hojeDate, vencDate) === 0 : false;
    }).length;
  }

  get totalSemana(): number {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    return this.filaPrioritaria.filter((row) => {
      const vencDate = parseIsoToDate(row.cobranca.dataVencimento);
      if (!vencDate) {
        return false;
      }
      const diff = this.diffDias(hojeDate, vencDate);
      return diff > 0 && diff <= 7;
    }).length;
  }

  get taxaAdimplencia(): number {
    const base = this.recebidoMes + this.emAberto;
    if (base <= 0) {
      return 0;
    }
    return (this.recebidoMes / base) * 100;
  }

  get ticketMedioMes(): number {
    if (!this.totalRecebidasMes) {
      return 0;
    }
    return this.recebidoMes / this.totalRecebidasMes;
  }

  get riscoAtrasoPercent(): number {
    if (!this.totalAberto) {
      return 0;
    }
    return (this.atrasado / this.totalAberto) * 100;
  }

  get statusSaudeCarteira(): 'alta' | 'media' | 'baixa' {
    if (this.taxaAdimplencia >= 75) {
      return 'alta';
    }
    if (this.taxaAdimplencia >= 45) {
      return 'media';
    }
    return 'baixa';
  }

  prazoLabel(cob: CobrancaDTO): string {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    const vencDate = parseIsoToDate(cob.dataVencimento);
    if (!vencDate) {
      return 'Sem vencimento';
    }
    const diff = this.diffDias(hojeDate, vencDate);
    if (diff < 0) {
      const atraso = Math.abs(diff);
      if (atraso > 999) {
        return '999+d atraso';
      }
      return `${atraso}d atraso`;
    }
    if (diff === 0) {
      return 'Vence hoje';
    }
    if (diff <= 7) {
      return `Vence em ${diff}d`;
    }
    if (diff > 999) {
      return 'Vence > 999d';
    }
    return `Vence em ${diff}d`;
  }

  prazoClass(cob: CobrancaDTO): string {
    const hojeDate = parseIsoToDate(this.hojeIso) || new Date();
    const vencDate = parseIsoToDate(cob.dataVencimento);
    if (!vencDate) {
      return 'bg-slate-100 text-slate-700';
    }
    const diff = this.diffDias(hojeDate, vencDate);
    if (diff < 0) {
      return 'bg-red-100 text-red-700';
    }
    if (diff === 0) {
      return 'bg-amber-100 text-amber-700';
    }
    if (diff <= 7) {
      return 'bg-blue-100 text-blue-700';
    }
    return 'bg-slate-100 text-slate-700';
  }

  formatPercent(v: number): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v || 0) + '%';
  }

  private diffDias(base: Date, alvo: Date): number {
    const baseDia = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const alvoDia = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
    const ms = alvoDia.getTime() - baseDia.getTime();
    return Math.round(ms / 86400000);
  }
}
