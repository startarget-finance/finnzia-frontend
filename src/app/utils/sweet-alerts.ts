import Swal, { SweetAlertOptions } from 'sweetalert2';

const baseDangerConfirm: SweetAlertOptions = {
  icon: 'warning',
  showCancelButton: true,
  confirmButtonText: 'Excluir',
  cancelButtonText: 'Cancelar',
  confirmButtonColor: '#dc2626',
  cancelButtonColor: '#334155',
  reverseButtons: true,
};

export function buildDeleteConfirmOptions(entityLabel: string, entityName: string): SweetAlertOptions {
  return {
    ...baseDangerConfirm,
    title: `Excluir ${entityLabel}?`,
    text: `Tem certeza que deseja excluir "${entityName}"?`,
  };
}

export function buildUnsavedChangesOptions(): SweetAlertOptions {
  return {
    icon: 'question',
    title: 'Descartar alterações?',
    text: 'Existem alterações não salvas. Deseja fechar mesmo assim?',
    showCancelButton: true,
    confirmButtonText: 'Descartar',
    cancelButtonText: 'Continuar editando',
    confirmButtonColor: '#334155',
    cancelButtonColor: '#6366f1',
    reverseButtons: true,
  };
}

export async function confirmUnsavedChanges(): Promise<boolean> {
  const result = await Swal.fire(buildUnsavedChangesOptions());
  return result.isConfirmed;
}

