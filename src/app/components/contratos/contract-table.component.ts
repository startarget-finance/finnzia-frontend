import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ContratoDTO, WorkflowAction } from '../../services/contrato.service';
import {
  ContratoGrupoCliente,
  groupContratosByClienteId,
  grupoContratoPrincipal,
  grupoFinancialWorst,
  grupoProximaCobranca,
  grupoValorMensalTotal,
  grupoWorkflowRepresentativo
} from './contratos-group.utils';

@Component({
  selector: 'app-contract-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 border-b border-gray-200">
            <tr class="text-left text-gray-500">
              <th class="py-3.5 px-5 font-medium text-sm w-10" *ngIf="groupByCliente"></th>
              <th class="py-3.5 px-5 font-medium text-sm">Cliente</th>
              <th class="py-3.5 px-5 font-medium text-sm">Valor mensal</th>
              <th class="py-3.5 px-5 font-medium text-sm">Próxima cobrança</th>
              <th class="py-3.5 px-5 font-medium text-sm">Etapa</th>
              <th class="py-3.5 px-5 font-medium text-sm">Status financeiro</th>
              <th class="py-3.5 px-5 font-medium text-right text-sm">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!groupByCliente">
              <tr
                *ngFor="let contrato of contratos; let i = index"
                [ngClass]="i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'"
                class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors duration-150 align-middle"
                (click)="open.emit(contrato)"
              >
                <td class="py-4 px-5 align-middle">
                  <p class="font-semibold text-slate-900 truncate">
                    {{ contrato.cliente.razaoSocial || contrato.cliente.nomeFantasia || 'Sem cliente' }}
                  </p>
                </td>
                <td class="py-4 px-5 font-semibold text-slate-800 tabular-nums align-middle">
                  {{ formatCurrency(contrato.valorRecorrencia || contrato.valorContrato || 0) }}
                </td>
                <td class="py-4 px-5 text-sm text-gray-500 align-middle">
                  {{ formatDate(getNextBillingDate(contrato)) }}
                </td>
                <td class="py-4 px-5 align-middle">
                  <span [class]="getWorkflowBadgeClass(contrato.workflowStatus)" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
                    {{ getWorkflowLabel(contrato.workflowStatus) }}
                  </span>
                </td>
                <td class="py-4 px-5 align-middle">
                  <span [class]="getFinancialBadgeClass(contrato.financialStatus)" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
                    {{ getFinancialLabel(contrato.financialStatus) }}
                  </span>
                </td>
                <td class="py-4 px-5 align-middle">
                  <div class="flex justify-end gap-1" (click)="$event.stopPropagation()">
                    <button *ngFor="let action of getActions(contrato.workflowStatus)"
                      class="h-7 px-2.5 text-[11px] rounded-md border border-gray-200 text-gray-600 bg-transparent hover:bg-gray-100/70 transition-colors"
                      (click)="requestAction.emit({ contrato, action: action.key })">
                      {{ action.label }}
                    </button>
                  </div>
                </td>
              </tr>
            </ng-container>

            <ng-container *ngIf="groupByCliente">
              <ng-container *ngFor="let g of grupos; let gi = index">
                <tr
                  [ngClass]="gi % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'"
                  class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors duration-150 align-middle"
                  (click)="open.emit(grupoContratoPrincipal(g))"
                >
                  <td class="py-4 px-2 align-middle text-center" (click)="$event.stopPropagation()">
                    <button
                      *ngIf="g.contratos.length > 1"
                      type="button"
                      (click)="toggleExpand(g.clienteId); $event.stopPropagation()"
                      class="h-8 w-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs"
                      [attr.aria-expanded]="isExpanded(g.clienteId)"
                    >
                      {{ isExpanded(g.clienteId) ? '▼' : '▶' }}
                    </button>
                  </td>
                  <td class="py-4 px-5 align-middle">
                    <p class="font-semibold text-slate-900 truncate">
                      {{ g.cliente.razaoSocial || g.cliente.nomeFantasia || 'Sem cliente' }}
                    </p>
                    <p *ngIf="g.contratos.length > 1" class="text-[11px] text-gray-500 mt-0.5">
                      {{ g.contratos.length }} cobranças agrupadas
                    </p>
                  </td>
                  <td class="py-4 px-5 font-semibold text-slate-800 tabular-nums align-middle">
                    {{ formatCurrency(grupoValorMensalTotal(g)) }}
                  </td>
                  <td class="py-4 px-5 text-sm text-gray-500 align-middle">
                    {{ formatDate(grupoProximaCobranca(g)) }}
                  </td>
                  <td class="py-4 px-5 align-middle">
                    <span [class]="getWorkflowBadgeClass(grupoWorkflowRepresentativo(g))" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
                      {{ getWorkflowLabel(grupoWorkflowRepresentativo(g)) }}
                    </span>
                  </td>
                  <td class="py-4 px-5 align-middle">
                    <span [class]="getFinancialBadgeClass(grupoFinancialWorst(g))" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
                      {{ getFinancialLabel(grupoFinancialWorst(g)) }}
                    </span>
                  </td>
                  <td class="py-4 px-5 align-middle">
                    <div class="flex justify-end gap-1" (click)="$event.stopPropagation()">
                      <button *ngFor="let action of getActions(grupoWorkflowRepresentativo(g))"
                        class="h-7 px-2.5 text-[11px] rounded-md border border-gray-200 text-gray-600 bg-transparent hover:bg-gray-100/70 transition-colors"
                        (click)="requestAction.emit({ contrato: grupoContratoPrincipal(g), action: action.key })">
                        {{ action.label }}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr
                  *ngFor="let contrato of g.contratos"
                  [hidden]="!(g.contratos.length > 1 && isExpanded(g.clienteId))"
                  class="border-b border-gray-100 bg-slate-50/80 hover:bg-slate-100/80 align-middle"
                  (click)="open.emit(contrato)"
                >
                  <td class="py-2 px-2 align-middle"></td>
                  <td class="py-2 px-5 align-middle pl-8" colspan="1">
                    <p class="text-xs text-slate-700 truncate" [title]="contrato.titulo">{{ contrato.titulo }}</p>
                    <p class="text-[11px] text-gray-500 truncate">{{ contrato.servico || '—' }}</p>
                  </td>
                  <td class="py-2 px-5 text-xs tabular-nums text-slate-800 align-middle">
                    {{ formatCurrency(contrato.valorRecorrencia || contrato.valorContrato || 0) }}
                  </td>
                  <td class="py-2 px-5 text-xs text-gray-500 align-middle">
                    {{ formatDate(getNextBillingDate(contrato)) }}
                  </td>
                  <td class="py-2 px-5 align-middle">
                    <span [class]="getWorkflowBadgeClass(contrato.workflowStatus)" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium">
                      {{ getWorkflowLabel(contrato.workflowStatus) }}
                    </span>
                  </td>
                  <td class="py-2 px-5 align-middle">
                    <span [class]="getFinancialBadgeClass(contrato.financialStatus)" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium">
                      {{ getFinancialLabel(contrato.financialStatus) }}
                    </span>
                  </td>
                  <td class="py-2 px-5 align-middle" (click)="$event.stopPropagation()">
                    <div class="flex justify-end gap-1 flex-wrap">
                      <button *ngFor="let action of getActions(contrato.workflowStatus)"
                        class="h-6 px-2 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-white"
                        (click)="requestAction.emit({ contrato, action: action.key })">
                        {{ action.label }}
                      </button>
                    </div>
                  </td>
                </tr>
              </ng-container>
            </ng-container>

            <tr *ngIf="!loading && contratos.length === 0">
              <td [attr.colspan]="groupByCliente ? 7 : 6" class="py-9 text-center text-sm text-gray-500">Nenhum contrato encontrado</td>
            </tr>
            <tr *ngIf="loading">
              <td [attr.colspan]="groupByCliente ? 7 : 6" class="py-9 text-center text-sm text-gray-500">Carregando contratos...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class ContractTableComponent {
  @Input() contratos: ContratoDTO[] = [];
  @Input() loading = false;
  /** Uma linha por cliente; cobranças avulsas do mesmo cliente aparecem agrupadas (expandir para ver cada uma). */
  @Input() groupByCliente = false;
  @Output() open = new EventEmitter<ContratoDTO>();
  @Output() requestAction = new EventEmitter<{ contrato: ContratoDTO; action: WorkflowAction }>();

  private expandedCliente: Record<number, boolean> = {};

  get grupos(): ContratoGrupoCliente[] {
    return groupContratosByClienteId(this.contratos);
  }

  grupoContratoPrincipal = grupoContratoPrincipal;
  grupoValorMensalTotal = grupoValorMensalTotal;
  grupoProximaCobranca = grupoProximaCobranca;
  grupoWorkflowRepresentativo = grupoWorkflowRepresentativo;
  grupoFinancialWorst = grupoFinancialWorst;

  toggleExpand(clienteId: number): void {
    this.expandedCliente[clienteId] = !this.expandedCliente[clienteId];
  }

  isExpanded(clienteId: number): boolean {
    return !!this.expandedCliente[clienteId];
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

  getWorkflowLabel(status?: ContratoDTO['workflowStatus']): string {
    switch (status) {
      case 'NOVO': return 'Novo';
      case 'ASSINATURA': return 'Assinatura';
      case 'COBRANCA': return 'Cobrança';
      case 'ATIVO': return 'Ativo';
      default: return 'Novo';
    }
  }

  getWorkflowBadgeClass(status?: ContratoDTO['workflowStatus']): string {
    switch (status) {
      case 'NOVO': return 'bg-gray-100/80 text-gray-700';
      case 'ASSINATURA': return 'bg-blue-100/70 text-blue-700';
      case 'COBRANCA': return 'bg-purple-100/70 text-purple-700';
      case 'ATIVO': return 'bg-emerald-100/70 text-emerald-700';
      default: return 'bg-gray-100/80 text-gray-700';
    }
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
      case 'EM_DIA': return 'bg-emerald-100/70 text-emerald-700';
      case 'ATRASADO': return 'bg-amber-100/70 text-amber-700';
      case 'INADIMPLENTE': return 'bg-red-100/70 text-red-700';
      default: return 'bg-emerald-100/70 text-emerald-700';
    }
  }

  getActions(workflow?: ContratoDTO['workflowStatus']): Array<{ label: string; key: WorkflowAction }> {
    switch (workflow || 'NOVO') {
      case 'NOVO':
        return [{ label: 'Enviar assinatura', key: 'ENVIAR_PARA_ASSINATURA' }];
      case 'ASSINATURA':
        return [{ label: 'Marcar assinado', key: 'MARCAR_COMO_ASSINADO' }];
      case 'COBRANCA':
        return [
          { label: 'Gerar cobrança', key: 'GERAR_COBRANCA' },
          { label: 'Ativar', key: 'ATIVAR_CONTRATO' }
        ];
      default:
        return [];
    }
  }
}
