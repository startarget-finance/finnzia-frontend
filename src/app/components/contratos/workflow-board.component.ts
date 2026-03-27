import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ContratoDTO } from '../../services/contrato.service';
import { ContractCardComponent } from './contract-card.component';

@Component({
  selector: 'app-workflow-board',
  standalone: true,
  imports: [CommonModule, ContractCardComponent],
  template: `
    <div class="overflow-x-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-w-[860px] xl:min-w-0">
        <section *ngFor="let col of columns" class="bg-white border border-gray-200 rounded-xl p-3">
          <header class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-slate-900">{{ col.label }}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {{ getContracts(col.value).length }}
            </span>
          </header>
          <div class="space-y-2 min-h-[120px]">
            <app-contract-card
              *ngFor="let contrato of getContracts(col.value)"
              [contrato]="contrato"
              (open)="open.emit($event)"
            />
            <p *ngIf="getContracts(col.value).length === 0" class="text-xs text-gray-400 py-4 text-center">
              Sem contratos nesta etapa
            </p>
          </div>
        </section>
      </div>
    </div>
  `
})
export class WorkflowBoardComponent {
  @Input() contratos: ContratoDTO[] = [];
  @Output() open = new EventEmitter<ContratoDTO>();

  columns: Array<{ value: ContratoDTO['workflowStatus']; label: string }> = [
    { value: 'NOVO', label: 'Novo' },
    { value: 'ASSINATURA', label: 'Assinatura' },
    { value: 'COBRANCA', label: 'Cobrança' },
    { value: 'ATIVO', label: 'Ativo' }
  ];

  getContracts(workflow: ContratoDTO['workflowStatus']): ContratoDTO[] {
    return this.contratos.filter(c => (c.workflowStatus || 'NOVO') === workflow);
  }
}

