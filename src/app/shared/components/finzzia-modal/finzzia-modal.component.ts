import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type FinzziaModalTamanho = 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';

@Component({
  selector: 'app-finzzia-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="aberto"
      class="finzzia-modal-overlay"
      [style.z-index]="zIndex"
      (click)="onOverlayClick($event)"
    >
      <div
        class="finzzia-modal-panel"
        [ngClass]="classeTamanho"
        (click)="$event.stopPropagation()"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titulo ? 'finzzia-modal-title' : null"
      >
        <header class="finzzia-modal-header">
          <div class="pointer-events-none absolute inset-0 finzzia-modal-header-glow" aria-hidden="true"></div>
          <div class="relative flex flex-wrap items-start gap-4">
            <div class="min-w-0 flex-1 pr-2">
              <p *ngIf="eyebrow" class="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400/95">{{ eyebrow }}</p>
              <h2 id="finzzia-modal-title" class="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">{{ titulo }}</h2>
              <p *ngIf="subtitulo" class="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-400">{{ subtitulo }}</p>
            </div>
            <div
              *ngIf="totalLiquido != null && totalLiquido !== ''"
              class="flex flex-col items-end rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-inner shadow-black/20 backdrop-blur-sm"
            >
              <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{{ rotuloTotal }}</span>
              <span class="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-white">{{ totalLiquido }}</span>
            </div>
          </div>
          <button
            type="button"
            (click)="fechar.emit()"
            class="absolute right-3 top-3 rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white sm:right-4 sm:top-4"
            aria-label="Fechar"
          >
            <i class="fi fi-rr-cross-small text-[1rem] leading-none" aria-hidden="true"></i>
          </button>
        </header>

        <nav *ngIf="temAbas" class="finzzia-modal-tabs">
          <ng-content select="[finzziaModalTabs]"></ng-content>
        </nav>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div class="finzzia-modal-body" [class.finzzia-modal-body--plain]="corpoSimples">
            <ng-content select="[finzziaModalBody]"></ng-content>
          </div>
          <footer *ngIf="temRodape" class="finzzia-modal-footer">
            <ng-content select="[finzziaModalFooter]"></ng-content>
          </footer>
        </div>
      </div>
    </div>
  `,
})
export class FinzziaModalComponent {
  @Input() aberto = false;
  @Input() eyebrow = '';
  @Input() titulo = '';
  @Input() subtitulo = '';
  @Input() totalLiquido: string | null = null;
  @Input() rotuloTotal = 'Total líquido';
  @Input() tamanho: FinzziaModalTamanho = '4xl';
  @Input() zIndex = 10060;
  @Input() fecharAoClicarFora = true;
  @Input() temAbas = false;
  @Input() temRodape = true;
  @Input() corpoSimples = false;

  @Output() fechar = new EventEmitter<void>();

  get classeTamanho(): string {
    const map: Record<FinzziaModalTamanho, string> = {
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
      '4xl': 'max-w-4xl',
      '6xl': 'max-w-6xl',
    };
    return map[this.tamanho] ?? 'max-w-4xl';
  }

  onOverlayClick(event: MouseEvent): void {
    if (!this.fecharAoClicarFora) {
      return;
    }
    if (event.target === event.currentTarget) {
      this.fechar.emit();
    }
  }
}
