import {
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  buildCalendarDays,
  CalendarDay,
  formatPeriodoLabel,
  parseLocalYmd,
} from '../../../utils/date-range-calendar.util';

@Component({
  selector: 'app-periodo-range-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './periodo-range-picker.component.html',
})
export class PeriodoRangePickerComponent {
  @Input() dataInicial = '';
  @Input() dataFinal = '';
  @Output() dataInicialChange = new EventEmitter<string>();
  @Output() dataFinalChange = new EventEmitter<string>();
  /** Disparado após Aplicar com o intervalo confirmado. */
  @Output() applied = new EventEmitter<{ dataInicial: string; dataFinal: string }>();
  /** Disparado ao clicar em Limpar (comportamento extra no pai, se necessário). */
  @Output() cleared = new EventEmitter<void>();
  @Output() openChange = new EventEmitter<boolean>();

  @Input() label?: string;
  @Input() placeholder = 'Selecionar período';
  @Input() showLabel = true;
  @Input() fullWidth = false;
  @Input() disabled = false;
  @Input() wrapperClass = 'z-[130]';
  @Input() triggerClass = '';
  /** Ao abrir, carrega as datas já aplicadas na seleção temporária. */
  @Input() preloadOnOpen = true;
  /** Limpar também zera as datas aplicadas (emite strings vazias). */
  @Input() limparClearsApplied = false;

  @ContentChild('periodoTrigger') customTrigger?: ElementRef<HTMLElement>;

  open = false;
  visibleMonth = new Date();
  calendarDays: CalendarDay[] = [];
  private tempRangeStart: string | null = null;
  private tempRangeEnd: string | null = null;
  private hoverRangeDate: string | null = null;

  get hasCustomTrigger(): boolean {
    return !!this.customTrigger;
  }

  get displayLabel(): string {
    return formatPeriodoLabel(this.dataInicial, this.dataFinal, this.placeholder);
  }

  get monthYearLabel(): string {
    return this.visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }
    this.setOpen(!this.open);
  }

  setOpen(value: boolean): void {
    if (this.open === value) {
      return;
    }
    this.open = value;
    this.openChange.emit(this.open);
    if (this.open) {
      this.prepararAbertura();
    }
  }

  cancelar(): void {
    this.setOpen(false);
  }

  aplicar(): void {
    if (!this.tempRangeStart) {
      return;
    }
    const rangeEnd = this.tempRangeEnd ?? this.tempRangeStart;
    const a = this.tempRangeStart <= rangeEnd ? this.tempRangeStart : rangeEnd;
    const b = this.tempRangeStart <= rangeEnd ? rangeEnd : this.tempRangeStart;
    this.dataInicial = a;
    this.dataFinal = b;
    this.dataInicialChange.emit(a);
    this.dataFinalChange.emit(b);
    this.applied.emit({ dataInicial: a, dataFinal: b });
    this.setOpen(false);
  }

  limpar(): void {
    this.tempRangeStart = null;
    this.tempRangeEnd = null;
    this.hoverRangeDate = null;
    if (this.limparClearsApplied) {
      this.dataInicial = '';
      this.dataFinal = '';
      this.dataInicialChange.emit('');
      this.dataFinalChange.emit('');
    }
    this.cleared.emit();
  }

  prevMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() - 1);
    this.visibleMonth = d;
    this.rebuildCalendar();
  }

  nextMonth(): void {
    const d = new Date(this.visibleMonth);
    d.setMonth(d.getMonth() + 1);
    this.visibleMonth = d;
    this.rebuildCalendar();
  }

  onSelectDate(dateStr: string): void {
    if (!this.tempRangeStart || (this.tempRangeStart && this.tempRangeEnd)) {
      this.tempRangeStart = dateStr;
      this.tempRangeEnd = null;
      return;
    }
    if (this.tempRangeStart && !this.tempRangeEnd) {
      this.tempRangeEnd = dateStr;
    }
  }

  onHoverDate(dateStr: string | null): void {
    this.hoverRangeDate = dateStr;
  }

  isStart(dateStr: string): boolean {
    return !!this.tempRangeStart && this.tempRangeStart === dateStr;
  }

  isEnd(dateStr: string): boolean {
    return !!this.tempRangeEnd && this.tempRangeEnd === dateStr;
  }

  isBetween(dateStr: string): boolean {
    const start = this.tempRangeStart;
    const end = this.tempRangeEnd || this.hoverRangeDate;
    if (!start || !end) {
      return false;
    }
    const a = start <= end ? start : end;
    const b = start <= end ? end : start;
    return dateStr > a && dateStr < b;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.cancelar();
    }
  }

  private prepararAbertura(): void {
    if (this.preloadOnOpen && this.dataInicial) {
      this.tempRangeStart = this.dataInicial;
      this.tempRangeEnd = this.dataFinal || null;
      this.visibleMonth = parseLocalYmd(this.dataInicial);
    } else {
      this.tempRangeStart = null;
      this.tempRangeEnd = null;
      this.visibleMonth = new Date();
    }
    this.hoverRangeDate = null;
    this.rebuildCalendar();
  }

  private rebuildCalendar(): void {
    this.calendarDays = buildCalendarDays(this.visibleMonth);
  }
}
