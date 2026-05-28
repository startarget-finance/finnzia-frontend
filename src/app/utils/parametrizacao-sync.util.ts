import { EventEmitter } from '@angular/core';

/** Recarrega os KPIs do topo da Parametrização (fonte única no componente pai). */
export function sincronizarResumoParametrizacao(
  embedded: boolean,
  cadastroAlterado: EventEmitter<void>
): void {
  if (embedded) {
    cadastroAlterado.emit();
  }
}
