export interface CalendarDay {
  day: number;
  inCurrentMonth: boolean;
  dateStr: string;
}

export function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function buildCalendarDays(visibleMonth: Date): CalendarDay[] {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const days: CalendarDay[] = [];

  for (let i = startWeekDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const date = new Date(year, month - 1, day);
    days.push({ day, inCurrentMonth: false, dateStr: dateToYmd(date) });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    days.push({ day: d, inCurrentMonth: true, dateStr: dateToYmd(date) });
  }

  while (days.length % 7 !== 0) {
    const nextIndex = days.length - startWeekDay - daysInMonth + 1;
    const date = new Date(year, month + 1, nextIndex);
    days.push({ day: date.getDate(), inCurrentMonth: false, dateStr: dateToYmd(date) });
  }

  return days;
}

export function formatPeriodoLabel(dataInicial: string, dataFinal: string, placeholder: string): string {
  if (!dataInicial || !dataFinal) {
    return placeholder;
  }
  const fmt = (s: string) =>
    parseLocalYmd(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return dataInicial === dataFinal ? fmt(dataInicial) : `${fmt(dataInicial)} até ${fmt(dataFinal)}`;
}
