import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { AuthService } from '../../services/auth.service';
import { CompanySelectorService } from '../../services/company-selector.service';
import { DfcResponse } from '../../services/erp-financeiro.service';
import { mapBomControleDfcToPlanilha } from './dfc-bomcontrole-mapper';
import {
  DfcLinhaComputada,
  DfcPlanilhaLinha,
  MONTHS_PT,
  applyResultTitleSelections,
  computeDfcSheet,
  computeDfcSheetFromApi,
  rollupEmptyTitleValuesFromDescendants,
  fmtDfc,
  fmtDfcPct,
  genDfcRowId,
  sortDfcMonths
} from './dfc-sheet.utils';

/**
 * Planilha DFC (layout títulos / itens / resultados).
 * No fluxo de caixa é alimentada por `gerarDFC` (Bom Controle) — não há segunda aba nem planilha “manual” separada.
 */
@Component({
  standalone: true,
  selector: 'app-dfc-planilha',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './dfc-planilha.component.html'
})
export class DfcPlanilhaComponent implements OnChanges {
  readonly monthsPt = MONTHS_PT;

  @Input() bomControleDfc: DfcResponse | null = null;
  @Input() carregandoExterno = false;
  @Input() mesesSelecionados: string[] = [];

  /** Ações da barra superior (integração com Bom Controle no container pai). */
  @Output() usarDfcPadrao = new EventEmitter<void>();
  @Output() importarDoBomControle = new EventEmitter<void>();
  @Output() filtrarMesAno = new EventEmitter<{ month: string; year: string }>();

  /** Quando true, valores vêm da API (sem recalcular hierarquia na planilha). */
  fonteBomControle = false;

  months: string[] = [];
  rows: DfcPlanilhaLinha[] = [];
  colunasVisiveis: string[] = [];

  editingCell: { rowId: string; month: string } | null = null;
  editingLabel: string | null = null;
  selectedRowId: string | null = null;
  collapsedTitles = new Set<string>();
  collapsedItems = new Set<string>();
  showAddMonth = false;
  showMonthFilter = false;
  resultConfigId: string | null = null;

  newMonth = {
    month: MONTHS_PT[new Date().getMonth()],
    year: String(new Date().getFullYear()),
    apiMonth: ''
  };

  constructor(
    private readonly auth: AuthService,
    private readonly companySelector: CompanySelectorService
  ) {}

  get isAdmin(): boolean {
    return this.auth.hasRole('admin');
  }

  /** Estrutura/valores só editáveis fora do modo Bom Controle (modo legado desativado no fluxo de caixa). */
  get podeEditarPlanilha(): boolean {
    return this.isAdmin;
  }

  get temEmpresa(): boolean {
    return !!this.companySelector.obterIdEmpresaSelecionada();
  }

  get computed(): DfcLinhaComputada[] {
    if (this.fonteBomControle) {
      const base = computeDfcSheetFromApi(this.rows, this.months);
      const withResults = applyResultTitleSelections(base, this.rows, this.months);
      return rollupEmptyTitleValuesFromDescendants(withResults, this.months);
    }
    return computeDfcSheet(this.rows, this.months);
  }

  get baseValues(): Record<string, number> {
    const titles = this.computed.filter((r) => r.type === 'title');
    const base = titles[1] ?? titles[0];
    return base?._val ?? {};
  }

  get parentMap(): Record<string, { titleId?: string; itemId?: string }> {
    const map: Record<string, { titleId?: string; itemId?: string }> = {};
    let currentTitle: DfcLinhaComputada | null = null;
    let currentItem: DfcLinhaComputada | null = null;
    this.computed.forEach((row) => {
      if (row.type === 'title') {
        currentTitle = row;
        currentItem = null;
      } else if (row.type === 'item') {
        currentItem = row;
        map[row.id] = { titleId: currentTitle?.id };
      } else if (row.type === 'subitem') {
        map[row.id] = { itemId: currentItem?.id, titleId: currentTitle?.id };
      }
    });
    return map;
  }

  get itemsWithSubitems(): Set<string> {
    const set = new Set<string>();
    const c = this.computed;
    for (let i = 0; i < c.length; i++) {
      if (c[i].type === 'item' && c[i + 1]?.type === 'subitem') {
        set.add(c[i].id);
      }
    }
    return set;
  }

  get visibleRows(): DfcLinhaComputada[] {
    const visible: DfcLinhaComputada[] = [];
    let hiddenByTitle = false;
    let hiddenByItem = false;
    this.computed.forEach((row) => {
      if (row.type === 'title') {
        hiddenByTitle = this.collapsedTitles.has(row.id);
        hiddenByItem = false;
        visible.push(row);
      } else if (row.type === 'result') {
        hiddenByTitle = false;
        hiddenByItem = false;
        visible.push(row);
      } else if (row.type === 'item') {
        hiddenByItem = false;
        if (!hiddenByTitle) {
          visible.push(row);
          if (this.collapsedItems.has(row.id)) {
            hiddenByItem = true;
          }
        }
      } else if (row.type === 'subitem') {
        if (!hiddenByTitle && !hiddenByItem) {
          visible.push(row);
        }
      }
    });
    return visible;
  }

  get mesesParaCabecalho(): string[] {
    if (this.colunasVisiveis.length === 0) {
      return [];
    }
    return this.months.filter((m) => this.colunasVisiveis.includes(m));
  }

  get mesesDisponiveisParaAdicionar(): string[] {
    return this.months.filter((m) => !this.colunasVisiveis.includes(m));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['bomControleDfc'] && !changes['mesesSelecionados']) {
      return;
    }
    if (changes['bomControleDfc']) {
      const v = this.bomControleDfc;
      if (v) {
        const { months, rows } = mapBomControleDfcToPlanilha(v);
        this.months = months;
        this.rows = rows;
        this.colunasVisiveis = [...months];
        this.fonteBomControle = true;
        this.newMonth.apiMonth = this.months[0] ?? '';
      } else {
        this.months = [];
        this.rows = [];
        this.colunasVisiveis = [];
        this.fonteBomControle = false;
        this.newMonth.apiMonth = '';
      }
    }

    if (this.months.length && this.mesesSelecionados.length) {
      const selected = new Set(this.mesesSelecionados.map((m) => this.normalizeMonthKey(m)));
      const visible = this.months.filter((m) => selected.has(this.normalizeMonthKey(m)));
      if (visible.length) {
        this.colunasVisiveis = visible;
      }
    }
  }

  trackByRowId(_: number, row: DfcLinhaComputada): string {
    return row.id;
  }

  /** Zebrado leve nas linhas de dado (títulos/resultados mantêm cor própria). */
  zebraStripe(index: number, row: DfcLinhaComputada): boolean {
    if (row.type === 'result' || row.type === 'title') {
      return false;
    }
    return index % 2 === 1;
  }

  fmt = fmtDfc;
  fmtPct = fmtDfcPct;

  formatValorExibicao(row: DfcLinhaComputada, orig: DfcPlanilhaLinha, m: string): string {
    const v = row._val[m];
    if (v == null) {
      return this.podeEditarPlanilha && !this.isAutoCalc(row, orig) ? '—' : '';
    }
    if (orig.sign === '-' && row.type !== 'result') {
      return '-' + fmtDfc(Math.abs(v));
    }
    return fmtDfc(v);
  }

  getPct(row: DfcLinhaComputada, m: string, val: number | undefined): number | null {
    if (val == null) {
      return null;
    }
    const base = this.getBaseValueForMonth(m);
    if (row.type === 'result' || row.type === 'title') {
      return this.pctOrNull(val, base);
    }
    if (row.type === 'item') {
      const parentTitle = this.computed.find((r) => r.id === this.parentMap[row.id]?.titleId);
      const parentVal = parentTitle?._val?.[m] ?? 0;
      const denom = Math.abs(parentVal) > 1e-9 ? parentVal : base;
      return this.pctOrNull(val, denom);
    }
    if (row.type === 'subitem') {
      const parentItem = this.computed.find((r) => r.id === this.parentMap[row.id]?.itemId);
      const parentVal = parentItem?._val?.[m] ?? 0;
      const denom = Math.abs(parentVal) > 1e-9 ? parentVal : base;
      return this.pctOrNull(val, denom);
    }
    return null;
  }

  private pctOrNull(val: number, denom: number): number | null {
    if (!Number.isFinite(val) || !Number.isFinite(denom) || Math.abs(denom) < 1e-9) {
      return null;
    }
    return (val / denom) * 100;
  }

  /** Sempre mostra um texto de % (ou traço), como no protótipo da planilha. */
  formatPctExibicao(row: DfcLinhaComputada, m: string): string {
    const raw = row._val[m];
    if (raw == null || !Number.isFinite(raw)) {
      return '—';
    }
    const p = this.getPct(row, m, raw);
    if (p == null) {
      return '—';
    }
    return fmtDfcPct(p);
  }

  private getBaseValueForMonth(month: string): number {
    const titles = this.computed.filter((r) => r.type === 'title');
    if (!titles.length) {
      return this.fallbackBaseFromItems(month);
    }

    const nonZero = titles.find((t) => {
      const v = t._val?.[month] ?? 0;
      return Math.abs(v) > 1e-9;
    });
    if (nonZero) {
      return nonZero._val?.[month] ?? 0;
    }

    const first = titles[0]._val?.[month] ?? 0;
    if (Math.abs(first) > 1e-9) {
      return first;
    }
    return this.fallbackBaseFromItems(month);
  }

  /** Quando títulos da API vêm zerados, usa soma de itens “+” como proxy de base para %. */
  private fallbackBaseFromItems(month: string): number {
    let sum = 0;
    for (const r of this.computed) {
      if (r.type === 'item' && r.sign === '+') {
        sum += Math.abs(r._val?.[month] ?? 0);
      }
    }
    return sum;
  }

  sortMonths = sortDfcMonths;

  handleAddMonth(): void {
    const monthYear = `${this.newMonth.month}/${String(this.newMonth.year).slice(-2)}`;

    // No modo Bom Controle, "+ Mês" filtra o período para o mês/ano selecionado.
    if (this.fonteBomControle) {
      this.filtrarMesAno.emit({ month: this.newMonth.month, year: this.newMonth.year });
      this.showAddMonth = false;
      return;
    }

    if (!this.months.includes(monthYear)) {
      this.months = sortDfcMonths([...this.months, monthYear]);
    }
    this.colunasVisiveis = this.mergeVisibleMonths(monthYear);
    this.showMonthFilter = true;
    this.showAddMonth = false;
  }

  removeMonth(m: string): void {
    if (!this.podeEditarPlanilha) {
      return;
    }
    this.months = this.months.filter((x) => x !== m);
    this.colunasVisiveis = this.colunasVisiveis.filter((x) => x !== m);
    this.rows = this.rows.map((r) => {
      const v = { ...r.values };
      delete v[m];
      return { ...r, values: v };
    });
  }

  addRow(type: DfcPlanilhaLinha['type']): void {
    const row: DfcPlanilhaLinha = {
      id: genDfcRowId(),
      label: 'Nova linha',
      type,
      sign: '+',
      values: {},
      ...(type === 'result' ? { titleIds: [] } : {})
    };
    this.rows = [...this.rows, row];
  }

  toggleResultTitle(resultId: string, titleId: string): void {
    this.rows = this.rows.map((r) => {
      if (r.id !== resultId) {
        return r;
      }
      const ids = r.titleIds ?? [];
      const next = ids.includes(titleId) ? ids.filter((x) => x !== titleId) : [...ids, titleId];
      return { ...r, titleIds: next };
    });
  }

  removeRow(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
    if (this.selectedRowId === id) {
      this.selectedRowId = null;
    }
  }

  updateCell(rowId: string, month: string, value: string): void {
    this.rows = this.rows.map((r) =>
      r.id === rowId
        ? { ...r, values: { ...r.values, [month]: value === '' ? null : Number(value) } }
        : r
    );
  }

  updateLabel(rowId: string, label: string): void {
    this.rows = this.rows.map((r) => (r.id === rowId ? { ...r, label } : r));
  }

  updateType(rowId: string, type: DfcPlanilhaLinha['type']): void {
    this.rows = this.rows.map((r) => {
      if (r.id !== rowId) {
        return r;
      }
      if (type === 'result') {
        return { ...r, type, titleIds: r.titleIds ?? [] };
      }
      const { titleIds: _t, ...rest } = r as DfcPlanilhaLinha & { titleIds?: string[] };
      return { ...rest, type };
    });
  }

  updateSign(rowId: string): void {
    this.rows = this.rows.map((r) =>
      r.id === rowId ? { ...r, sign: r.sign === '-' ? '+' : '-' } : r
    );
  }

  toggleCollapse(id: string): void {
    const next = new Set(this.collapsedTitles);
    next.has(id) ? next.delete(id) : next.add(id);
    this.collapsedTitles = next;
  }

  toggleCollapseItem(id: string): void {
    const next = new Set(this.collapsedItems);
    next.has(id) ? next.delete(id) : next.add(id);
    this.collapsedItems = next;
  }

  onDragEnd(event: CdkDragDrop<DfcLinhaComputada[]>): void {
    if (!this.podeEditarPlanilha || !event.container) {
      return;
    }
    const vis = this.visibleRows;
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const srcId = vis[event.previousIndex]?.id;
    const dstId = vis[event.currentIndex]?.id;
    if (!srcId || !dstId || srcId === dstId) {
      return;
    }
    const srcIdx = this.rows.findIndex((r) => r.id === srcId);
    const dstIdx = this.rows.findIndex((r) => r.id === dstId);
    if (srcIdx === -1 || dstIdx === -1) {
      return;
    }
    const copy = [...this.rows];
    moveItemInArray(copy, srcIdx, dstIdx);
    this.rows = copy;
  }

  filtroSelecionarTodos(): void {
    this.colunasVisiveis = [...this.months];
  }

  filtroSelecionarNenhum(): void {
    this.colunasVisiveis = [];
  }

  toggleFiltroMes(m: string): void {
    if (this.colunasVisiveis.length === 0) {
      this.colunasVisiveis = [m];
      return;
    }
    let cur = [...this.colunasVisiveis];
    if (cur.length === this.months.length) {
      cur = [...this.months];
    }
    if (cur.includes(m)) {
      this.colunasVisiveis = sortDfcMonths(cur.filter((x) => x !== m));
    } else {
      this.colunasVisiveis = sortDfcMonths([...cur, m]);
    }
  }

  chipMesSelecionado(m: string): boolean {
    return this.colunasVisiveis.includes(m);
  }

  get filtroMesesDestacado(): boolean {
    return this.colunasVisiveis.length > 0 && this.colunasVisiveis.length < this.months.length;
  }

  origRow(rowId: string): DfcPlanilhaLinha | undefined {
    return this.rows.find((r) => r.id === rowId);
  }

  isAutoCalc(row: DfcLinhaComputada, orig: DfcPlanilhaLinha | undefined): boolean {
    if (this.fonteBomControle) {
      return true;
    }
    if (!orig) {
      return false;
    }
    if (row.type === 'result') {
      return true;
    }
    if (row.type === 'title') {
      const idx = this.rows.findIndex((r) => r.id === row.id);
      for (let j = idx + 1; j < this.rows.length; j++) {
        if (this.rows[j].type === 'subitem') {
          return true;
        }
        if (this.rows[j].type === 'item') {
          return true;
        }
        break;
      }
      return false;
    }
    if (orig.type === 'item') {
      const idx = this.rows.findIndex((r) => r.id === row.id);
      return this.rows[idx + 1]?.type === 'subitem';
    }
    return false;
  }

  titulosRows(): DfcPlanilhaLinha[] {
    return this.rows.filter((r) => r.type === 'title');
  }

  /** Meses e estrutura vêm do Bom Controle — edição manual desligada. */
  get planilhaSomenteLeitura(): boolean {
    return !this.isAdmin;
  }

  onClickSalvar(): void {
    if (this.planilhaSomenteLeitura || !this.isAdmin) {
      return;
    }
    // Modo edição legado (sem API Bom Controle): persistência opcional pode ser reativada aqui.
  }

  private findMonthFromApi(target: string): string | null {
    const normTarget = this.normalizeMonthKey(target);
    for (const m of this.months) {
      if (this.normalizeMonthKey(m) === normTarget) {
        return m;
      }
    }
    return null;
  }

  private normalizeMonthKey(value: string): string {
    const raw = (value ?? '').trim().toLowerCase().replace(/\./g, '');

    // tenta padrões comuns: "mar/26", "03/2026", "2026-03"
    let mRaw = '';
    let yRaw = '';
    if (raw.includes('/')) {
      const parts = raw.split('/');
      mRaw = parts[0] ?? '';
      yRaw = parts[1] ?? '';
    } else if (raw.includes('-')) {
      const parts = raw.split('-');
      if ((parts[0] ?? '').length === 4) {
        yRaw = parts[0] ?? '';
        mRaw = parts[1] ?? '';
      } else {
        mRaw = parts[0] ?? '';
        yRaw = parts[1] ?? '';
      }
    } else {
      return raw;
    }

    const year = yRaw.slice(-2);
    const monthToken = mRaw.trim();
    const monthNum = Number(monthToken);

    const monthMap: Record<string, string> = {
      jan: 'jan',
      fev: 'fev',
      mar: 'mar',
      abr: 'abr',
      mai: 'mai',
      jun: 'jun',
      jul: 'jul',
      ago: 'ago',
      set: 'set',
      out: 'out',
      nov: 'nov',
      dez: 'dez'
    };
    const monthByNumber = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const monthKey = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12
      ? monthByNumber[monthNum - 1]
      : (monthMap[monthToken.slice(0, 3)] ?? monthToken.slice(0, 3));

    return `${monthKey}/${year}`;
  }

  private mergeVisibleMonths(month: string): string[] {
    if (this.colunasVisiveis.includes(month)) {
      return this.colunasVisiveis;
    }
    return sortDfcMonths([...this.colunasVisiveis, month]);
  }
}
