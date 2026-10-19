import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { WeGridAlign } from '../models/we-grid-column.model';
import { WeGridExportTable } from '../models/we-grid-export.model';
import { WeGridCellStyle, WeGridFormatColor } from '../models/we-grid-format.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridParseClipboardTable } from '../services/we-grid-clipboard.util';
import { weGridDownloadBlob, weGridParseCsv, weGridToCsv } from '../services/we-grid-csv.util';
import { WeGridCellCss, weGridCellStyleCss, weGridFormatBg, weGridFormatFg } from '../services/we-grid-format.util';
import {
  WE_GRID_FORMULA_ALIASES,
  WE_GRID_FORMULA_FUNCTIONS,
  WE_GRID_FORMULA_SIGNATURES,
  WeGridSheetEvaluator,
  weGridColumnLetter,
  weGridFormulaValueToText,
  weGridIsFormula
} from '../services/we-grid-formula.util';
import { weGridBuildXlsx, weGridReadXlsx } from '../services/we-grid-xlsx.util';
import { WE_SHEET_STORE, WeSheetCell, WeSheetData, WeSheetNumberFormat, WeSheetStore } from './we-sheet.model';
import {
  WE_SHEET_COLORS,
  WE_SHEET_MAX_COLS,
  WE_SHEET_MAX_ROWS,
  WeSheetRange,
  WeSheetStats,
  weSheetAddress,
  weSheetAutoSum,
  weSheetEmpty,
  weSheetInsert,
  weSheetFormatValue,
  weSheetNormalize,
  weSheetParseAddress,
  weSheetParseInput,
  weSheetRangeLabel,
  weSheetSanitize,
  weSheetShiftFormula,
  weSheetSortRange,
  weSheetStats
} from './we-sheet.util';

interface Pos {
  col: number;
  row: number;
}

/** What a cell renders — rebuilt after every change, so change detection only reads */
interface CellView {
  text: string;
  css: WeGridCellCss | null;
  align: WeGridAlign;
  error: boolean;
}

const DEFAULT_WIDTH = 104;
const UNDO_LIMIT = 100;

/** Every name the formula engine accepts, English and Turkish, with what it means — for suggestions */
const FUNCTION_NAMES: { name: string; canonical: string }[] = [
  ...WE_GRID_FORMULA_FUNCTIONS.map((name) => ({ name, canonical: name })),
  ...Object.entries(WE_GRID_FORMULA_ALIASES).map(([name, canonical]) => ({ name, canonical }))
];

/** One function suggestion while a formula is typed */
export interface WeSheetSuggestion {
  name: string;
  signature: string;
}

/**
 * `<we-sheet>` — a small spreadsheet: type values and Excel formulas into A1 cells, select ranges,
 * copy and paste with Excel and Google Sheets, undo, style cells with the grid's palette, choose
 * number formats, sort, fill down and export to Excel or CSV. The status bar sums the selection.
 *
 * Give it a `sheetKey` and it saves itself through `WE_SHEET_STORE` (localStorage unless you
 * provide your own store, e.g. one that calls your backend); or bind `[data]` / `(dataChange)`.
 */
@Component({
  selector: 'we-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './we-sheet.component.html',
  styleUrls: ['./we-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeSheetComponent implements OnInit, OnChanges, OnDestroy {
  /** Saves and restores the sheet under this key through `WE_SHEET_STORE` */
  @Input() sheetKey?: string;
  /** The sheet's content — takes precedence over a stored one */
  @Input() data?: WeSheetData | null;
  /** Size of a new, empty sheet */
  @Input() rows = 50;
  @Input() cols = 12;
  /** No editing — selection, copy, sorting off, export stay available */
  @Input() readonly = false;
  /** File name for exports, without extension */
  @Input() exportFileName = 'sheet';
  /** Fixed height of the scrolling area — CSS length or pixels */
  @Input() height: number | string = 420;

  /** Every change, with the new content */
  @Output() dataChange = new EventEmitter<WeSheetData>();

  @ViewChild('scroll', { static: true }) scrollRef!: ElementRef<HTMLElement>;
  @ViewChild('editor') editorRef?: ElementRef<HTMLInputElement>;
  @ViewChild('importInput') importInputRef?: ElementRef<HTMLInputElement>;

  sheet: WeSheetData = weSheetEmpty();
  view: CellView[][] = [];
  columnLetters: string[] = [];
  rowNumbers: number[] = [];
  colIndexes: number[] = [];

  active: Pos = { col: 0, row: 0 };
  anchor: Pos = { col: 0, row: 0 };
  selection: WeSheetRange = { c1: 0, r1: 0, c2: 0, r2: 0 };
  /** The in-cell editor, when open */
  editing: { col: number; row: number; text: string; fromBar: boolean } | null = null;
  /** The formula bar's text — the active cell's raw content unless the user is typing in it */
  barText = '';
  stats: WeSheetStats = weSheetStats([]);
  openPalette: 'color' | 'fill' | null = null;
  /** The right-click menu, at viewport coordinates */
  menu: { x: number; y: number } | null = null;
  /** Function names matching what is being typed after `=` */
  suggestions: WeSheetSuggestion[] = [];
  suggestionIndex = 0;
  /** Where the suggestions list sits — under the cell editor or under the formula bar */
  suggestionsFor: 'cell' | 'bar' = 'cell';
  notice: string | null = null;

  readonly colors = WE_SHEET_COLORS;
  readonly formats: WeSheetNumberFormat[] = ['general', 'number', 'integer', 'currency', 'percent', 'date', 'text'];

  private evaluator!: WeGridSheetEvaluator;
  private undoStack: WeSheetData[] = [];
  private redoStack: WeSheetData[] = [];
  private dragging = false;
  private resizing: { col: number; startX: number; startWidth: number } | null = null;
  /** What this sheet last copied — pasted back as raw cells (formulas shifted) instead of text */
  private clip: { text: string; range: WeSheetRange; cells: (WeSheetCell | undefined)[][] } | null = null;
  private readonly save$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    @Inject(WE_SHEET_STORE) private readonly store: WeSheetStore,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.save$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => {
      if (this.sheetKey) this.store.save(this.sheetKey, this.sheet).pipe(takeUntil(this.destroy$)).subscribe();
    });
    if (this.data) {
      this.load(this.data);
    } else if (this.sheetKey) {
      this.load(null);
      this.store
        .load(this.sheetKey)
        .pipe(takeUntil(this.destroy$))
        .subscribe((stored) => {
          if (stored && !this.data) this.load(stored);
        });
    } else {
      this.load(null);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Our own (dataChange) bound back into [data] carries the same object — nothing to reload then
    if (changes['data'] && !changes['data'].firstChange && this.data && this.data !== this.sheet) this.load(this.data);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Public API (also what macros drive) ─────────────────────────────

  /** The current content */
  getData(): WeSheetData {
    return this.sheet;
  }

  /** Replaces the content (sanitised), as one undoable step */
  setData(data: WeSheetData): void {
    const clean = weSheetSanitize(data);
    if (clean) this.commit(clean);
  }

  /** A cell's computed value by address — `'B3'` */
  getValue(address: string): unknown {
    const at = weSheetParseAddress(address);
    return at ? this.evaluator.value(at.col, at.row) : undefined;
  }

  /** Writes what a user would type into a cell — `setCell('C2', '=A2*B2')` */
  setCell(address: string, input: string | number | boolean | null): void {
    const at = weSheetParseAddress(address);
    if (!at || this.readonly) return;
    const next = this.cloneForEdit(at.row + 1, at.col + 1);
    this.writeInput(next, at.col, at.row, input);
    this.commit(next);
  }

  /** Selects a range by its label — `select('A1:C5')` */
  select(label: string): void {
    const [a, b] = label.split(':').map((p) => weSheetParseAddress(p.trim()));
    if (!a) return;
    this.anchor = a;
    this.active = a;
    this.selection = weSheetNormalize(a, b ?? a);
    this.afterSelection();
  }

  /** The selection, as `'A1:C5'` */
  get selectionLabel(): string {
    return weSheetRangeLabel(this.selection);
  }

  // ─── Rendering ───────────────────────────────────────────────────────

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  fg(color: WeGridFormatColor): string {
    return weGridFormatFg(color);
  }

  bg(color: WeGridFormatColor): string {
    return weGridFormatBg(color);
  }

  width(col: number): number {
    return this.sheet.widths?.[weGridColumnLetter(col)] ?? DEFAULT_WIDTH;
  }

  get heightCss(): string {
    return typeof this.height === 'number' ? `${this.height}px` : this.height;
  }

  inSelection(col: number, row: number): boolean {
    const s = this.selection;
    return col >= s.c1 && col <= s.c2 && row >= s.r1 && row <= s.r2;
  }

  get activeCell(): WeSheetCell | undefined {
    return this.sheet.cells[weSheetAddress(this.active.col, this.active.row)];
  }

  get activeStyle(): WeGridCellStyle {
    return this.activeCell?.s ?? {};
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get hasStats(): boolean {
    return this.stats.count > 1;
  }

  formatStat(n: number | null): string {
    return n === null ? '—' : new Intl.NumberFormat(this.locale.intlLocale, { maximumFractionDigits: 4 }).format(n);
  }

  // ─── Mouse ───────────────────────────────────────────────────────────

  onCellMouseDown(event: MouseEvent, col: number, row: number): void {
    if (event.button !== 0) return;
    if (this.editing && !(this.editing.col === col && this.editing.row === row)) this.commitEdit();
    event.preventDefault();
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    if (event.shiftKey) {
      this.extendTo({ col, row });
    } else {
      this.moveTo({ col, row });
    }
    this.dragging = true;
  }

  onCellMouseEnter(col: number, row: number): void {
    if (this.dragging) this.extendTo({ col, row });
  }

  onCellDblClick(col: number, row: number): void {
    this.moveTo({ col, row });
    this.startEdit(null);
  }

  onColumnHeaderClick(event: MouseEvent, col: number): void {
    if (this.resizing) return;
    this.commitEdit();
    const from = event.shiftKey ? this.anchor : { col, row: 0 };
    this.anchor = { col: from.col, row: 0 };
    this.active = { col: event.shiftKey ? this.active.col : col, row: 0 };
    this.selection = weSheetNormalize({ col: from.col, row: 0 }, { col, row: this.sheet.rows - 1 });
    this.afterSelection();
  }

  onRowHeaderClick(event: MouseEvent, row: number): void {
    this.commitEdit();
    const from = event.shiftKey ? this.anchor : { col: 0, row };
    this.anchor = { col: 0, row: from.row };
    this.active = { col: 0, row: event.shiftKey ? this.active.row : row };
    this.selection = weSheetNormalize({ col: 0, row: from.row }, { col: this.sheet.cols - 1, row });
    this.afterSelection();
  }

  selectAll(): void {
    this.commitEdit();
    this.anchor = { col: 0, row: 0 };
    this.active = { col: 0, row: 0 };
    this.selection = { c1: 0, r1: 0, c2: this.sheet.cols - 1, r2: this.sheet.rows - 1 };
    this.afterSelection();
  }

  onResizeStart(event: MouseEvent, col: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizing = { col, startX: event.clientX, startWidth: this.width(col) };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizing) return;
    const w = Math.max(30, Math.min(1000, this.resizing.startWidth + event.clientX - this.resizing.startX));
    this.sheet = { ...this.sheet, widths: { ...(this.sheet.widths ?? {}), [weGridColumnLetter(this.resizing.col)]: Math.round(w) } };
    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.dragging = false;
    if (this.resizing) {
      // The resize already changed `sheet`; record it without another undo step per pixel
      setTimeout(() => (this.resizing = null));
      this.emitChange();
    }
  }

  // ─── Keyboard ────────────────────────────────────────────────────────

  onGridKeydown(event: KeyboardEvent): void {
    if (this.editing) return;
    if (this.menu && event.key === 'Escape') {
      this.closeMenu();
      event.preventDefault();
      return;
    }
    if (event.altKey && event.key === '=') {
      this.autoSum();
      event.preventDefault();
      return;
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const cell = this.scrollRef.nativeElement.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(this.active.col, this.active.row)}"]`);
      const box = cell?.getBoundingClientRect();
      this.openMenu(box ? box.left + 8 : 40, box ? box.bottom : 40);
      event.preventDefault();
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod) {
      const lower = key.toLowerCase();
      const handled =
        lower === 'z' ? (event.shiftKey ? this.redo() : this.undo(), true) :
        lower === 'y' ? (this.redo(), true) :
        lower === 'a' ? (this.selectAll(), true) :
        lower === 'b' ? (this.toggleFlag('bold'), true) :
        lower === 'i' ? (this.toggleFlag('italic'), true) :
        lower === 'u' ? (this.toggleFlag('underline'), true) :
        lower === 'd' ? (this.fillDown(), true) :
        key.startsWith('Arrow') ? (this.jump(key, event.shiftKey), true) :
        false;
      if (handled) event.preventDefault();
      return;
    }
    switch (key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key];
        const from = event.shiftKey ? this.focusCorner() : this.active;
        const to = this.clamp({ col: from.col + d[0], row: from.row + d[1] });
        if (event.shiftKey) this.extendTo(to);
        else this.moveTo(to);
        break;
      }
      case 'Enter':
        this.moveTo(this.clamp({ col: this.active.col, row: this.active.row + (event.shiftKey ? -1 : 1) }));
        break;
      case 'Tab':
        this.moveTo(this.clamp({ col: this.active.col + (event.shiftKey ? -1 : 1), row: this.active.row }));
        break;
      case 'Home':
        this.moveTo({ col: 0, row: this.active.row });
        break;
      case 'End':
        this.moveTo({ col: this.usedSize().cols - 1, row: this.active.row });
        break;
      case 'F2':
        this.startEdit(null);
        break;
      case 'Delete':
      case 'Backspace':
        this.clearContents();
        break;
      default:
        if (key.length === 1 && !event.altKey) {
          this.startEdit(key);
        } else {
          return;
        }
    }
    event.preventDefault();
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if (!this.editing) return;
    // The editor sits inside the grid — its keys must not reach the grid's own handler as well
    event.stopPropagation();
    if (this.handleSuggestionKey(event, event.target as HTMLInputElement)) return;
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const back = event.shiftKey ? -1 : 1;
      this.commitEdit();
      const to = event.key === 'Enter' ? { col: this.active.col, row: this.active.row + back } : { col: this.active.col + back, row: this.active.row };
      this.moveTo(this.clamp(to));
      this.scrollRef.nativeElement.focus({ preventScroll: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  // ─── Formula bar ─────────────────────────────────────────────────────

  onBarFocus(): void {
    if (this.readonly) return;
    this.editing = { ...this.active, text: this.barText, fromBar: true };
  }

  onBarInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.barText = input.value;
    if (this.editing) this.editing.text = input.value;
    this.updateSuggestions(input, 'bar');
  }

  onBarKeydown(event: KeyboardEvent): void {
    if (this.handleSuggestionKey(event, event.target as HTMLInputElement)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit();
      this.moveTo(this.clamp({ col: this.active.col, row: this.active.row + 1 }));
      this.scrollRef.nativeElement.focus({ preventScroll: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
      this.scrollRef.nativeElement.focus({ preventScroll: true });
    }
  }

  onBarBlur(): void {
    if (this.editing?.fromBar) this.commitEdit();
  }

  /** The name box accepts an address or a range to jump to */
  onNameBoxEnter(input: HTMLInputElement): void {
    this.select(input.value.trim().toUpperCase());
    input.value = this.selectionLabel;
    this.scrollRef.nativeElement.focus({ preventScroll: true });
  }

  // ─── Editing ─────────────────────────────────────────────────────────

  startEdit(initial: string | null): void {
    if (this.readonly) return;
    const raw = this.rawText(this.active.col, this.active.row);
    this.editing = { ...this.active, text: initial ?? raw, fromBar: false };
    this.barText = this.editing.text;
    this.cdr.detectChanges();
    const el = this.editorRef?.nativeElement;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  onEditorInput(event: Event): void {
    if (!this.editing) return;
    const input = event.target as HTMLInputElement;
    this.editing.text = input.value;
    this.barText = input.value;
    this.updateSuggestions(input, 'cell');
  }

  commitEdit(): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    this.suggestions = [];
    if (e.text === this.rawText(e.col, e.row)) {
      this.cdr.markForCheck();
      return;
    }
    const next = this.cloneForEdit(e.row + 1, e.col + 1);
    this.writeInput(next, e.col, e.row, e.text);
    this.commit(next);
  }

  cancelEdit(): void {
    this.editing = null;
    this.suggestions = [];
    this.barText = this.rawText(this.active.col, this.active.row);
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  clearContents(): void {
    if (this.readonly) return;
    this.updateRange((cell) => {
      const { v: _v, ...rest } = cell;
      return rest;
    });
  }

  // ─── Formatting ──────────────────────────────────────────────────────

  toggleFlag(flag: 'bold' | 'italic' | 'underline' | 'strike'): void {
    const on = !this.activeStyle[flag];
    this.updateRange((cell) => ({ ...cell, s: this.cleanStyle({ ...cell.s, [flag]: on || undefined }) }));
  }

  setColor(key: 'color' | 'fill', color: WeGridFormatColor | null): void {
    this.openPalette = null;
    this.updateRange((cell) => ({ ...cell, s: this.cleanStyle({ ...cell.s, [key]: color ?? undefined }) }));
  }

  setAlign(align: WeGridAlign): void {
    this.updateRange((cell) => ({ ...cell, a: cell.a === align ? undefined : align }));
  }

  setFormat(format: WeSheetNumberFormat): void {
    this.updateRange((cell) => ({ ...cell, f: format === 'general' ? undefined : format }));
  }

  clearFormatting(): void {
    this.updateRange((cell) => (cell.v === undefined || cell.v === null ? {} : { v: cell.v }));
  }

  toggleHeaderRow(): void {
    this.commit({ ...this.sheet, headerRow: !this.sheet.headerRow || undefined });
  }

  toggleStriped(): void {
    this.commit({ ...this.sheet, striped: !this.sheet.striped || undefined });
  }

  toggleFreezeColumn(): void {
    this.commit({ ...this.sheet, freezeColumn: !this.sheet.freezeColumn || undefined });
  }

  // ─── Rows and columns ────────────────────────────────────────────────

  /** Inserts as many rows as are selected, above (`'before'`) or below the selection */
  insertRows(where: 'before' | 'after'): void {
    const s = this.selection;
    this.structure('row', where === 'before' ? s.r1 : s.r2 + 1, s.r2 - s.r1 + 1);
  }

  insertColumns(where: 'before' | 'after'): void {
    const s = this.selection;
    this.structure('col', where === 'before' ? s.c1 : s.c2 + 1, s.c2 - s.c1 + 1);
  }

  deleteRows(): void {
    const s = this.selection;
    if (s.r2 - s.r1 + 1 >= this.sheet.rows) return;
    this.structure('row', s.r1, -(s.r2 - s.r1 + 1));
  }

  deleteColumns(): void {
    const s = this.selection;
    if (s.c2 - s.c1 + 1 >= this.sheet.cols) return;
    this.structure('col', s.c1, -(s.c2 - s.c1 + 1));
  }

  private structure(axis: 'row' | 'col', at: number, count: number): void {
    this.closeMenu();
    if (this.readonly) return;
    this.commitEdit();
    this.commit(weSheetInsert(this.sheet, axis, at, count));
  }

  /** Σ — sums the numbers above (or left of) the active cell, or under each column of a block */
  autoSum(): void {
    this.closeMenu();
    if (this.readonly) return;
    this.commitEdit();
    const writes = weSheetAutoSum(this.selection, (c, r) => typeof this.evaluator.value(c, r) === 'number');
    if (!writes.length) return;
    const next = this.cloneForEdit(Math.max(...writes.map((w) => w.row)) + 1, this.sheet.cols);
    for (const w of writes) this.writeInput(next, w.col, w.row, w.formula);
    this.commit(next);
    const last = writes[writes.length - 1];
    this.moveTo({ col: last.col, row: last.row });
  }

  // ─── Context menu ────────────────────────────────────────────────────

  onCellContextMenu(event: MouseEvent, col: number, row: number): void {
    event.preventDefault();
    if (!this.inSelection(col, row)) this.moveTo({ col, row });
    this.openMenu(event.clientX, event.clientY);
  }

  openMenu(x: number, y: number): void {
    this.commitEdit();
    this.openPalette = null;
    // Kept inside the viewport — the menu is about 16rem by 22rem
    this.menu = { x: Math.min(x, window.innerWidth - 260), y: Math.min(y, window.innerHeight - 360) };
    this.cdr.markForCheck();
    queueMicrotask(() => this.scrollRef.nativeElement.closest('.we-sheet')?.querySelector<HTMLElement>('.we-sheet__menu button')?.focus());
  }

  closeMenu(): void {
    if (!this.menu) return;
    this.menu = null;
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      items[(i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      event.preventDefault();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      this.closeMenu();
      event.preventDefault();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.menu && !(event.target as HTMLElement).closest?.('.we-sheet__menu')) this.closeMenu();
  }

  // ─── Import ──────────────────────────────────────────────────────────

  openImport(): void {
    this.importInputRef?.nativeElement.click();
  }

  /** Reads an .xlsx or .csv file into the sheet from A1, as one undoable step */
  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.readonly) return;
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const table = isXlsx ? await weGridReadXlsx(file) : weGridParseCsv(await file.text());
      const lines = [table.headers, ...table.rows];
      const cols = Math.max(this.sheet.cols, ...lines.map((l) => l.length));
      let next: WeSheetData = { ...weSheetEmpty(Math.max(this.sheet.rows, lines.length + 10), cols), headerRow: true, striped: this.sheet.striped };
      next = { ...next, cells: {} };
      // Excel stores numbers with a dot whatever the locale; a CSV is written in the user's own
      const separator: '.' | ',' = isXlsx ? '.' : this.decimalSeparator;
      lines.forEach((line, r) =>
        line.forEach((text, c) => {
          const parsed = weSheetParseInput(text, separator);
          if (parsed.value !== null && parsed.value !== undefined) next.cells[weSheetAddress(c, r)] = parsed.format ? { v: parsed.value, f: parsed.format } : { v: parsed.value };
        })
      );
      this.commit(next);
      this.moveTo({ col: 0, row: 0 });
    } catch {
      this.notice = this.locale.sheetImportFailed;
      this.cdr.markForCheck();
    }
  }

  // ─── Formula suggestions ─────────────────────────────────────────────

  /** Suggests functions for the name being typed right before the caret, inside a formula */
  private updateSuggestions(input: HTMLInputElement, where: 'cell' | 'bar'): void {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const m = /(^=|[=(,;+\-*/^&<>\s])([A-Za-zÇĞİÖŞÜçğıöşü_.]+)$/.exec(before);
    if (!input.value.startsWith('=') || !m) {
      this.suggestions = [];
      return;
    }
    const prefix = m[2].toLocaleUpperCase('tr').replace(/İ/g, 'I');
    const norm = (name: string) => name.toLocaleUpperCase('tr').replace(/İ/g, 'I');
    const seen = new Set<string>();
    this.suggestions = FUNCTION_NAMES.filter((f) => norm(f.name).startsWith(prefix))
      .filter((f) => !seen.has(f.name) && seen.add(f.name))
      .slice(0, 7)
      .map((f) => ({ name: f.name, signature: `${f.canonical === f.name ? '' : `${f.canonical} · `}${f.name}(${WE_GRID_FORMULA_SIGNATURES[f.canonical] ?? ''})` }));
    this.suggestionIndex = 0;
    this.suggestionsFor = where;
  }

  /** Arrow keys walk the suggestions, Tab or Enter takes one, Escape closes the list */
  private handleSuggestionKey(event: KeyboardEvent, input: HTMLInputElement): boolean {
    if (!this.suggestions.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const n = this.suggestions.length;
      this.suggestionIndex = (this.suggestionIndex + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      this.acceptSuggestion(this.suggestions[this.suggestionIndex], input);
    } else if (event.key === 'Escape') {
      this.suggestions = [];
    } else {
      return false;
    }
    event.preventDefault();
    this.cdr.markForCheck();
    return true;
  }

  acceptSuggestion(s: WeSheetSuggestion, input?: HTMLInputElement | null): void {
    const el = input ?? (this.suggestionsFor === 'cell' ? this.editorRef?.nativeElement : null) ?? null;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(/[A-Za-zÇĞİÖŞÜçğıöşü_.]+$/, '');
    const text = `${before}${s.name}(${el.value.slice(caret)}`;
    el.value = text;
    const at = before.length + s.name.length + 1;
    el.setSelectionRange(at, at);
    el.focus();
    this.barText = text;
    if (this.editing) this.editing.text = text;
    this.suggestions = [];
  }

  // ─── Structure ───────────────────────────────────────────────────────

  addRow(): void {
    if (this.sheet.rows < WE_SHEET_MAX_ROWS) this.commit({ ...this.sheet, rows: this.sheet.rows + 1 });
  }

  addColumn(): void {
    if (this.sheet.cols < WE_SHEET_MAX_COLS) this.commit({ ...this.sheet, cols: this.sheet.cols + 1 });
  }

  /**
   * Sorts by the active cell's column: the selected rows when a block is selected, otherwise every
   * used row (below the header row).
   */
  sort(direction: 'asc' | 'desc'): void {
    if (this.readonly) return;
    const s = this.selection;
    const used = this.usedSize();
    const block = s.r2 > s.r1 && s.r2 < this.sheet.rows - 1;
    const range: WeSheetRange = block
      ? s
      : { c1: 0, r1: this.sheet.headerRow ? 1 : 0, c2: Math.max(used.cols - 1, 0), r2: Math.max(used.rows - 1, 0) };
    if (range.r2 <= range.r1) return;
    const sorted = weSheetSortRange(this.sheet, range, this.active.col, direction, (c, r) => this.evaluator.value(c, r), this.locale.intlLocale);
    this.commit(sorted);
  }

  /** Copies the top row of the selection down through it, shifting relative references — Ctrl+D */
  fillDown(): void {
    const s = this.selection;
    if (this.readonly || s.r2 === s.r1) return;
    const next = this.cloneForEdit(s.r2 + 1, s.c2 + 1);
    for (let c = s.c1; c <= s.c2; c++) {
      const source = this.sheet.cells[weSheetAddress(c, s.r1)];
      for (let r = s.r1 + 1; r <= s.r2; r++) this.putCell(next, c, r, this.shiftedCell(source, 0, r - s.r1));
    }
    this.commit(next);
  }

  // ─── Undo ────────────────────────────────────────────────────────────

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.sheet);
    this.apply(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.sheet);
    this.apply(next);
  }

  // ─── Clipboard ───────────────────────────────────────────────────────

  onCopy(event: ClipboardEvent, cut = false): void {
    if (this.editing) return;
    const s = this.selection;
    const used = this.usedSize();
    const r2 = Math.min(s.r2, Math.max(used.rows - 1, s.r1));
    const c2 = Math.min(s.c2, Math.max(used.cols - 1, s.c1));
    const lines: string[] = [];
    const cells: (WeSheetCell | undefined)[][] = [];
    for (let r = s.r1; r <= r2; r++) {
      const line: string[] = [];
      const row: (WeSheetCell | undefined)[] = [];
      for (let c = s.c1; c <= c2; c++) {
        line.push(this.view[r]?.[c]?.text ?? '');
        row.push(this.sheet.cells[weSheetAddress(c, r)]);
      }
      lines.push(line.map((t) => (/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)).join('\t'));
      cells.push(row);
    }
    const text = lines.join('\n');
    this.clip = { text, range: { c1: s.c1, r1: s.r1, c2, r2 }, cells };
    event.clipboardData?.setData('text/plain', text);
    event.preventDefault();
    if (cut && !this.readonly) this.clearContents();
  }

  onPaste(event: ClipboardEvent): void {
    if (this.editing || this.readonly) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    const at = { col: this.selection.c1, row: this.selection.r1 };
    // Our own copy: whole cells, formulas shifted like Excel. Anything else: values as if typed.
    const own = this.clip && this.clip.text === text.replace(/\r\n/g, '\n').replace(/\n$/, '') ? this.clip : null;
    const table = own ? null : weGridParseClipboardTable(text);
    const height = own ? own.cells.length : table!.length;
    const widthOf = (r: number) => (own ? own.cells[r].length : table![r].length);
    const maxWidth = Math.max(0, ...Array.from({ length: height }, (_, r) => widthOf(r)));
    const next = this.cloneForEdit(at.row + height, at.col + maxWidth);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < widthOf(r); c++) {
        if (own) {
          const dCol = at.col - own.range.c1;
          const dRow = at.row - own.range.r1;
          this.putCell(next, at.col + c, at.row + r, this.shiftedCell(own.cells[r][c], dCol, dRow));
        } else {
          this.writeInput(next, at.col + c, at.row + r, table![r][c]);
        }
      }
    }
    this.commit(next);
    this.selection = { c1: at.col, r1: at.row, c2: at.col + Math.max(maxWidth - 1, 0), r2: at.row + Math.max(height - 1, 0) };
    this.afterSelection();
  }

  // ─── Export ──────────────────────────────────────────────────────────

  exportAs(format: 'xlsx' | 'csv'): void {
    const table = this.buildExportTable();
    const name = this.exportFileName || 'sheet';
    if (format === 'csv') {
      weGridDownloadBlob(new Blob([weGridToCsv(table)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    } else {
      weGridDownloadBlob(weGridBuildXlsx(table), `${name}.xlsx`);
    }
  }

  /** The used range as an export table — row 1 as column titles when it is a header row */
  buildExportTable(): WeGridExportTable {
    const used = this.usedSize();
    const first = this.sheet.headerRow ? 1 : 0;
    const columns = Array.from({ length: used.cols }, (_, c) => {
      let numeric = true;
      for (let r = first; r < used.rows; r++) {
        const v = this.evaluator.value(c, r);
        if (v !== null && v !== undefined && v !== '' && typeof v !== 'number') numeric = false;
      }
      return {
        field: weGridColumnLetter(c),
        header: this.sheet.headerRow ? this.view[0]?.[c]?.text || weGridColumnLetter(c) : weGridColumnLetter(c),
        type: numeric ? ('number' as const) : ('text' as const),
        format: undefined,
        align: numeric ? ('end' as const) : ('start' as const),
        width: this.width(c),
        useDisplayText: !numeric,
        numberScale: 1
      };
    });
    const rows = [];
    for (let r = first; r < used.rows; r++) {
      const values = columns.map((_, c) => {
        const v = this.evaluator.value(c, r);
        return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null ? v : weGridFormulaValueToText(v);
      });
      rows.push({ values, text: columns.map((_, c) => this.view[r]?.[c]?.text ?? '') });
    }
    return { fileName: this.exportFileName, title: this.exportFileName, columns, rows, summary: null, cssVariables: {} };
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private get currency(): string {
    return this.locale.intlCurrency ?? 'USD';
  }

  private get decimalSeparator(): '.' | ',' {
    return new Intl.NumberFormat(this.locale.intlLocale).format(1.5).includes(',') ? ',' : '.';
  }

  private load(input: WeSheetData | null): void {
    const data = (input && weSheetSanitize(input)) || weSheetEmpty(this.clampRows(this.rows), this.clampCols(this.cols));
    this.undoStack = [];
    this.redoStack = [];
    this.apply(data);
  }

  private clampRows(n: number): number {
    return Math.max(1, Math.min(WE_SHEET_MAX_ROWS, Math.floor(n) || 1));
  }

  private clampCols(n: number): number {
    return Math.max(1, Math.min(WE_SHEET_MAX_COLS, Math.floor(n) || 1));
  }

  /** Makes `next` the content as one undoable step */
  private commit(next: WeSheetData): void {
    this.notice = null;
    this.undoStack.push(this.sheet);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.apply(next);
  }

  private apply(data: WeSheetData): void {
    this.sheet = data;
    this.evaluator = new WeGridSheetEvaluator(
      (c, r) => this.sheet.cells[weSheetAddress(c, r)]?.v ?? null,
      () => ({ cols: this.sheet.cols, rows: this.sheet.rows })
    );
    this.columnLetters = Array.from({ length: data.cols }, (_, i) => weGridColumnLetter(i));
    this.colIndexes = Array.from({ length: data.cols }, (_, i) => i);
    this.rowNumbers = Array.from({ length: data.rows }, (_, i) => i);
    this.rebuildView();
    this.active = this.clamp(this.active);
    this.anchor = this.clamp(this.anchor);
    this.selection = {
      c1: Math.min(this.selection.c1, data.cols - 1),
      r1: Math.min(this.selection.r1, data.rows - 1),
      c2: Math.min(this.selection.c2, data.cols - 1),
      r2: Math.min(this.selection.r2, data.rows - 1)
    };
    this.afterSelection(false);
    this.emitChange();
  }

  private emitChange(): void {
    this.dataChange.emit(this.sheet);
    this.save$.next();
  }

  private rebuildView(): void {
    const view: CellView[][] = [];
    for (let r = 0; r < this.sheet.rows; r++) {
      const line: CellView[] = [];
      for (let c = 0; c < this.sheet.cols; c++) {
        const cell = this.sheet.cells[weSheetAddress(c, r)];
        const value = this.evaluator.value(c, r);
        const text = weSheetFormatValue(value, cell?.f, this.locale.intlLocale, this.currency);
        const error = typeof value === 'object' && value !== null && !(value instanceof Date);
        const numeric = typeof value === 'number' && cell?.f !== 'text';
        const css = cell?.s ? weGridCellStyleCss(cell.s) : null;
        line.push({ text, css: css && Object.keys(css).length ? css : null, align: cell?.a ?? (numeric || error ? 'end' : 'start'), error });
      }
      view.push(line);
    }
    this.view = view;
  }

  private rawText(col: number, row: number): string {
    const v = this.sheet.cells[weSheetAddress(col, row)]?.v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return new Intl.NumberFormat(this.locale.intlLocale, { maximumFractionDigits: 15, useGrouping: false }).format(v);
    return v;
  }

  /** A copy whose `cells` can be written, grown to fit `rows` × `cols` */
  private cloneForEdit(rows: number, cols: number): WeSheetData {
    return {
      ...this.sheet,
      rows: Math.min(WE_SHEET_MAX_ROWS, Math.max(this.sheet.rows, rows)),
      cols: Math.min(WE_SHEET_MAX_COLS, Math.max(this.sheet.cols, cols)),
      cells: { ...this.sheet.cells }
    };
  }

  private writeInput(target: WeSheetData, col: number, row: number, input: string | number | boolean | null): void {
    const key = weSheetAddress(col, row);
    const parsed = typeof input === 'string' ? weSheetParseInput(input, this.decimalSeparator) : { value: input };
    const cell: WeSheetCell = { ...(target.cells[key] ?? {}) };
    if (parsed.value === null || parsed.value === undefined) delete cell.v;
    else cell.v = parsed.value;
    if (parsed.format && !cell.f) cell.f = parsed.format;
    this.putCell(target, col, row, cell);
  }

  private putCell(target: WeSheetData, col: number, row: number, cell: WeSheetCell | undefined): void {
    if (col >= target.cols || row >= target.rows) return;
    const key = weSheetAddress(col, row);
    if (!cell || Object.keys(cell).length === 0) delete target.cells[key];
    else target.cells[key] = cell;
  }

  private shiftedCell(cell: WeSheetCell | undefined, dCol: number, dRow: number): WeSheetCell | undefined {
    if (!cell) return undefined;
    return weGridIsFormula(cell.v) ? { ...cell, v: weSheetShiftFormula(cell.v, dCol, dRow) } : { ...cell };
  }

  /** Rewrites every selected cell — capped at the used area plus the selection's first row/column */
  private updateRange(fn: (cell: WeSheetCell) => WeSheetCell): void {
    if (this.readonly) return;
    this.commitEdit();
    const s = this.selection;
    const next = this.cloneForEdit(0, 0);
    for (let r = s.r1; r <= s.r2; r++) {
      for (let c = s.c1; c <= s.c2; c++) {
        const key = weSheetAddress(c, r);
        const updated = fn(next.cells[key] ?? {});
        this.putCell(next, c, r, this.compact(updated));
      }
    }
    this.commit(next);
  }

  private compact(cell: WeSheetCell): WeSheetCell {
    const out: WeSheetCell = {};
    if (cell.v !== undefined && cell.v !== null) out.v = cell.v;
    const s = cell.s && this.cleanStyle(cell.s);
    if (s) out.s = s;
    if (cell.a) out.a = cell.a;
    if (cell.f) out.f = cell.f;
    return out;
  }

  private cleanStyle(style: WeGridCellStyle | undefined): WeGridCellStyle | undefined {
    if (!style) return undefined;
    const out = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== false && v !== null)) as WeGridCellStyle;
    return Object.keys(out).length ? out : undefined;
  }

  /** Last row/column with content, at least 1 × 1 */
  private usedSize(): { rows: number; cols: number } {
    let rows = 0;
    let cols = 0;
    for (const [key, cell] of Object.entries(this.sheet.cells)) {
      if (cell.v === undefined || cell.v === null || cell.v === '') continue;
      const at = weSheetParseAddress(key);
      if (!at) continue;
      rows = Math.max(rows, at.row + 1);
      cols = Math.max(cols, at.col + 1);
    }
    return { rows: Math.max(rows, 1), cols: Math.max(cols, 1) };
  }

  private clamp(p: Pos): Pos {
    return { col: Math.max(0, Math.min(this.sheet.cols - 1, p.col)), row: Math.max(0, Math.min(this.sheet.rows - 1, p.row)) };
  }

  /** The selection corner opposite the anchor — where Shift+arrow grows from */
  private focusCorner(): Pos {
    const s = this.selection;
    return { col: this.anchor.col === s.c1 ? s.c2 : s.c1, row: this.anchor.row === s.r1 ? s.r2 : s.r1 };
  }

  private moveTo(p: Pos): void {
    this.anchor = p;
    this.active = p;
    this.selection = weSheetNormalize(p, p);
    this.afterSelection();
  }

  private extendTo(p: Pos): void {
    this.selection = weSheetNormalize(this.anchor, p);
    this.afterSelection(true, p);
  }

  /** Ctrl+arrow — to the edge of the used area */
  private jump(key: string, extend: boolean): void {
    const used = this.usedSize();
    const from = extend ? this.focusCorner() : this.active;
    const to =
      key === 'ArrowUp' ? { col: from.col, row: 0 } :
      key === 'ArrowDown' ? { col: from.col, row: Math.max(used.rows - 1, from.row) } :
      key === 'ArrowLeft' ? { col: 0, row: from.row } :
      { col: Math.max(used.cols - 1, from.col), row: from.row };
    if (extend) this.extendTo(this.clamp(to));
    else this.moveTo(this.clamp(to));
  }

  private afterSelection(scroll = true, focus: Pos = this.active): void {
    if (!this.editing) this.barText = this.rawText(this.active.col, this.active.row);
    const values: unknown[] = [];
    const s = this.selection;
    const used = this.usedSize();
    for (let r = s.r1; r <= Math.min(s.r2, used.rows - 1); r++) {
      for (let c = s.c1; c <= Math.min(s.c2, used.cols - 1); c++) values.push(this.evaluator.value(c, r));
    }
    this.stats = weSheetStats(values);
    this.cdr.markForCheck();
    if (scroll) {
      queueMicrotask(() => {
        const el = this.scrollRef.nativeElement.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(focus.col, focus.row)}"]`);
        el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      });
    }
  }
}
