import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type FeedbackStateKind = 'loading' | 'error' | 'empty';

@Component({
  selector: 'app-feedback-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="flex w-full items-start gap-3 rounded-xl border px-4 py-3.5"
      [ngClass]="containerClass"
      role="status"
      [attr.aria-live]="kind === 'error' ? 'assertive' : 'polite'"
    >
      <div class="mt-0.5 shrink-0 rounded-lg p-2" [ngClass]="iconWrapClass">
        <svg *ngIf="kind === 'loading'" class="h-4 w-4 animate-spin" [ngClass]="iconClass" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <svg *ngIf="kind === 'error'" class="h-4 w-4" [ngClass]="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <svg *ngIf="kind === 'empty'" class="h-4 w-4" [ngClass]="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold" [ngClass]="titleClass">{{ title }}</p>
        <p *ngIf="message" class="mt-0.5 text-sm" [ngClass]="messageClass">{{ message }}</p>
        <button
          *ngIf="actionLabel"
          type="button"
          (click)="action.emit()"
          class="mt-2 inline-flex h-8 items-center rounded-lg border border-current/20 bg-white px-3 text-xs font-semibold transition-colors hover:bg-black/[0.03]"
          [ngClass]="titleClass"
        >
          {{ actionLabel }}
        </button>
      </div>
    </div>
  `,
})
export class FeedbackStateComponent {
  @Input() kind: FeedbackStateKind = 'empty';
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();

  get containerClass(): string {
    if (this.kind === 'error') return 'border-rose-200 bg-rose-50/90';
    if (this.kind === 'loading') return 'border-sky-200 bg-sky-50/80';
    return 'border-slate-200 bg-slate-50/90';
  }

  get iconWrapClass(): string {
    if (this.kind === 'error') return 'bg-rose-100';
    if (this.kind === 'loading') return 'bg-sky-100';
    return 'bg-slate-100';
  }

  get iconClass(): string {
    if (this.kind === 'error') return 'text-rose-700';
    if (this.kind === 'loading') return 'text-sky-700';
    return 'text-slate-600';
  }

  get titleClass(): string {
    if (this.kind === 'error') return 'text-rose-900';
    if (this.kind === 'loading') return 'text-sky-900';
    return 'text-slate-900';
  }

  get messageClass(): string {
    if (this.kind === 'error') return 'text-rose-700';
    if (this.kind === 'loading') return 'text-sky-700';
    return 'text-slate-600';
  }
}

