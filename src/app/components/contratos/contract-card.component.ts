import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ContratoDTO } from '../../services/contrato.service';

@Component({
  selector: 'app-contract-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article
      class="bg-white rounded-xl border border-gray-200 shadow-sm p-3 h-[112px] flex flex-col justify-between cursor-pointer hover:shadow-md transition-all duration-150"
      (click)="open.emit(contrato)"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <p class="text-sm font-semibold text-slate-900 truncate flex-1">
            {{ contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia || 'Sem cliente' }}
          </p>
          <span *ngIf="agrupadoCount && agrupadoCount > 1"
            class="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
            {{ agrupadoCount }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          {{ formatCurrency(valorExibicao) }}
        </p>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-gray-500 truncate">
          {{ formatDate(proximaCobrancaExibicao) }}
        </span>
        <span [class]="getFinancialBadgeClass(financeiroExibicao)" class="px-2 py-0.5 rounded-full text-[11px] font-medium">
          {{ getFinancialLabel(financeiroExibicao) }}
        </span>
      </div>
    </article>
  `
})
export class ContractCardComponent {
  @Input({ required: true }) contrato!: ContratoDTO;
  /** Quantidade de cobranças/contratos agrupados no mesmo cliente (só etiqueta). */
  @Input() agrupadoCount?: number;
  /** Valor a exibir (ex.: soma quando agrupado). */
  @Input() valorResumo?: number;
  @Input() financialResumo?: ContratoDTO['financialStatus'];
  @Input() proximaCobrancaResumo?: string;
  @Output() open = new EventEmitter<ContratoDTO>();

  get valorExibicao(): number {
    if (this.valorResumo != null && Number.isFinite(this.valorResumo)) {
      return this.valorResumo;
    }
    return Number(this.contrato.valorRecorrencia || this.contrato.valorContrato || 0);
  }

  get financeiroExibicao(): ContratoDTO['financialStatus'] | undefined {
    return this.financialResumo ?? this.contrato.financialStatus;
  }

  get proximaCobrancaExibicao(): string | undefined {
    if (this.proximaCobrancaResumo) {
      return this.proximaCobrancaResumo;
    }
    return this.getNextBillingDate(this.contrato);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  formatDate(date?: string): string {
    if (!date) return '-';
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString('pt-BR');
  }

  getNextBillingDate(contrato: ContratoDTO): string | undefined {
    const pending = (contrato.cobrancas || [])
      .filter(c => c.status === 'PENDING' || c.status === 'OVERDUE')
      .map(c => c.dataVencimento)
      .sort();
    return pending[0] || contrato.dataVencimento;
  }

  getFinancialLabel(status?: ContratoDTO['financialStatus']): string {
    switch (status) {
      case 'EM_DIA': return 'Em dia';
      case 'ATRASADO': return 'Atrasado';
      case 'INADIMPLENTE': return 'Inadimplente';
      default: return 'Em dia';
    }
  }

  getFinancialBadgeClass(status?: ContratoDTO['financialStatus']): string {
    switch (status) {
      case 'EM_DIA': return 'bg-emerald-50 text-emerald-700';
      case 'ATRASADO': return 'bg-amber-50 text-amber-700';
      case 'INADIMPLENTE': return 'bg-red-50 text-red-700';
      default: return 'bg-emerald-50 text-emerald-700';
    }
  }
}
