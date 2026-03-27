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
        <p class="text-sm font-semibold text-slate-900 truncate">
          {{ contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia || 'Sem cliente' }}
        </p>
        <p class="text-xs text-gray-500 mt-1">
          {{ formatCurrency(contrato.valorContrato || 0) }}
        </p>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-gray-500 truncate">
          {{ formatDate(getNextBillingDate(contrato)) }}
        </span>
        <span [class]="getFinancialBadgeClass(contrato.financialStatus)" class="px-2 py-0.5 rounded-full text-[11px] font-medium">
          {{ getFinancialLabel(contrato.financialStatus) }}
        </span>
      </div>
    </article>
  `
})
export class ContractCardComponent {
  @Input({ required: true }) contrato!: ContratoDTO;
  @Output() open = new EventEmitter<ContratoDTO>();

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

