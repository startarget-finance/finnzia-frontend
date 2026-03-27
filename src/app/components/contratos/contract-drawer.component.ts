import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ContratoDTO, WorkflowAction } from '../../services/contrato.service';

@Component({
  selector: 'app-contract-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="open && contrato" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/30" (click)="close.emit()"></div>
      <aside class="absolute right-0 top-0 h-full w-full sm:w-[540px] bg-white border-l border-gray-200 shadow-2xl flex flex-col">
        <header class="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-900">Contrato</h3>
            <p class="text-sm text-gray-500 mt-1">{{ contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia }}</p>
          </div>
          <button class="text-gray-400 hover:text-gray-600" (click)="close.emit()">✕</button>
        </header>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <section class="grid grid-cols-2 gap-3 text-sm">
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-gray-500 text-xs">Valor</p>
              <p class="font-semibold text-slate-900 mt-1">{{ formatCurrency(contrato.valorContrato || 0) }}</p>
            </div>
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-gray-500 text-xs">Próxima cobrança</p>
              <p class="font-semibold text-slate-900 mt-1">{{ formatDate(getNextBillingDate()) }}</p>
            </div>
          </section>

          <section>
            <h4 class="text-sm font-semibold text-slate-900 mb-2">Parcelas</h4>
            <div class="space-y-2">
              <div *ngFor="let c of contrato.cobrancas || []" class="border border-gray-200 rounded-lg p-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-500">{{ formatDate(c.dataVencimento) }}</span>
                  <span class="font-medium text-slate-900">{{ formatCurrency(c.valor || 0) }}</span>
                </div>
                <p class="text-xs text-gray-500 mt-1">{{ c.status }}</p>
              </div>
              <p *ngIf="(contrato.cobrancas || []).length === 0" class="text-xs text-gray-400">Sem parcelas registradas</p>
            </div>
          </section>

          <section>
            <h4 class="text-sm font-semibold text-slate-900 mb-2">Histórico</h4>
            <div class="border border-dashed border-gray-300 rounded-lg p-3 text-xs text-gray-500">
              Histórico operacional será exibido aqui (MVP).
            </div>
          </section>
        </div>

        <footer class="p-4 border-t border-gray-200 bg-white">
          <div class="flex flex-wrap gap-2">
            <button *ngFor="let action of getActions()"
              (click)="requestAction.emit(action.key)"
              class="px-3 py-2 text-xs rounded-lg border border-gray-200 hover:bg-gray-50">
              {{ action.label }}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  `
})
export class ContractDrawerComponent {
  @Input() open = false;
  @Input() contrato: ContratoDTO | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() requestAction = new EventEmitter<WorkflowAction>();

  getActions(): Array<{ label: string; key: WorkflowAction }> {
    const workflow = this.contrato?.workflowStatus || 'NOVO';
    if (workflow === 'NOVO') return [{ label: 'Enviar para assinatura', key: 'ENVIAR_PARA_ASSINATURA' }];
    if (workflow === 'ASSINATURA') return [{ label: 'Marcar como assinado', key: 'MARCAR_COMO_ASSINADO' }];
    if (workflow === 'COBRANCA') {
      return [
        { label: 'Gerar cobrança', key: 'GERAR_COBRANCA' },
        { label: 'Ativar contrato', key: 'ATIVAR_CONTRATO' }
      ];
    }
    return [];
  }

  getNextBillingDate(): string | undefined {
    if (!this.contrato) return undefined;
    const pending = (this.contrato.cobrancas || [])
      .filter(c => c.status === 'PENDING' || c.status === 'OVERDUE')
      .map(c => c.dataVencimento)
      .sort();
    return pending[0] || this.contrato.dataVencimento;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  formatDate(date?: string): string {
    if (!date) return '-';
    return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
  }
}

