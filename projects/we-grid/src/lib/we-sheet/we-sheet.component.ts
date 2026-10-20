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
import { WeGridCellStyle, WeGridFormatColor, WeGridFormatRule } from '../models/we-grid-format.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridParseClipboardTable } from '../services/we-grid-clipboard.util';
import { weGridDownloadBlob, weGridParseCsv, weGridToCsv } from '../services/we-grid-csv.util';
import { WeGridCellCss, weGridCellStyleCss, weGridFormatBg, weGridFormatFg, weGridResolveFormats } from '../services/we-grid-format.util';
import {
  WE_GRID_FORMULA_ALIASES,
  WE_GRID_FORMULA_FUNCTIONS,
  WE_GRID_FORMULA_SIGNATURES,
  WeGridSheetEvaluator,
  weGridColumnIndex,
  weGridColumnLetter,
  weGridFormulaValueToText,
  weGridIsFormula
} from '../services/we-grid-formula.util';
import { WeGridXlsxCellSheet, weGridReadXlsxCells } from '../services/we-grid-xlsx.util';
import { weGridPrintTable } from '../services/we-grid-pdf.util';
import { WE_SHEET_STORE, WeSheetCell, WeSheetChart, WeSheetData, WeSheetFormatRule, WeSheetNumberFormat, WeSheetStore } from './we-sheet.model';
import { WeChartComponent } from '../we-chart/we-chart.component';
import { WeGridFormatPanelComponent } from '../we-grid-format-panel/we-grid-format-panel.component';
import { WeChartData } from '../we-chart/we-chart.util';
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
  weSheetFill,
  weSheetCleanList,
  weSheetWorkbookXlsx,
  weSheetFromCells,
  weSheetBorderSides,
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
  note: string | null;
  /** Under a merge's top-left cell — not drawn */
  covered?: boolean;
  /** The top-left cell of a merge: how far it spans */
  colspan?: number;
  rowspan?: number;
}

const DEFAULT_WIDTH = 104;
let sheetCount = 0;
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
  imports: [CommonModule, FormsModule, WeChartComponent, WeGridFormatPanelComponent],
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
  /**
   * Other sheets a formula can read (`Sales!B2`, `'Q 1'!A1:C9`) — `<we-workbook>` passes its sheets
   * here. Returns null for an unknown name (→ `#REF!`).
   */
  @Input() resolveSheet?: (name: string) => WeSheetData | null;
  /** The sheets the Excel export writes — `<we-workbook>` passes all of its sheets; this sheet alone by default */
  @Input() xlsxSheets?: () => readonly { name: string; data: WeSheetData }[];
  /** Takes the sheets of an opened Excel file with more than one — `<we-workbook>` adds them as sheets */
  @Input() importSheets?: (sheets: readonly WeGridXlsxCellSheet[]) => void;

  /** Every change, with the new content */
  @Output() dataChange = new EventEmitter<WeSheetData>();
  /** Rows or columns were inserted (`count` > 0) or deleted — after the `dataChange` that carries them */
  @Output() structureChange = new EventEmitter<{ axis: 'row' | 'col'; at: number; count: number }>();

  @ViewChild('scroll', { static: true }) scrollRef!: ElementRef<HTMLElement>;
  /** Unique per sheet — the ids that tie the comboboxes to their lists */
  readonly uid = `we-sheet-${++sheetCount}`;
  @ViewChild('editor') editorRef?: ElementRef<HTMLInputElement>;
  @ViewChild('importInput') importInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('formulaBar') formulaBarRef?: ElementRef<HTMLInputElement>;

  sheet: WeSheetData = weSheetEmpty();
  view: CellView[][] = [];
  columnLetters: string[] = [];
  rowNumbers: number[] = [];
  /** The rows drawn — all of them, but those the header-row filters hide */
  visibleRows: number[] = [];
  private hiddenRows = new Set<number>();
  /** The sheet's merges as ranges, worked out with the view */
  private mergeRanges: WeSheetRange[] = [];
  private leftCache: { widths: unknown; cols: number; values: string[] } | null = null;
  /** The open filter of a header cell: its column and the distinct texts below it */
  filterMenu: { col: number; x: number; y: number; values: { text: string; label: string; shown: boolean }[] } | null = null;
  colIndexes: number[] = [];

  active: Pos = { col: 0, row: 0 };
  anchor: Pos = { col: 0, row: 0 };
  selection: WeSheetRange = { c1: 0, r1: 0, c2: 0, r2: 0 };
  /** The in-cell editor, when open */
  editing: { col: number; row: number; text: string; fromBar: boolean } | null = null;
  /** The formula bar's text — the active cell's raw content unless the user is typing in it */
  barText = '';
  stats: WeSheetStats = weSheetStats([]);
  openPalette: 'color' | 'fill' | 'border' | null = null;
  /** The table options menu in the toolbar */
  optionsOpen = false;
  /** The right-click menu, at viewport coordinates */
  menu: { x: number; y: number } | null = null;
  /** Function names matching what is being typed after `=` */
  suggestions: WeSheetSuggestion[] = [];
  suggestionIndex = 0;
  /** Where the suggestions list sits — under the cell editor or under the formula bar */
  suggestionsFor: 'cell' | 'bar' = 'cell';
  notice: string | null = null;
  /** The find bar — open with Ctrl+F (find) or Ctrl+H (find and replace) */
  find: { text: string; replace: string; withReplace: boolean; matchCase: boolean; index: number } | null = null;
  findMatches: { col: number; row: number }[] = [];
  /** The chart's data, worked out from its range after every change */
  chartData: WeChartData | null = null;
  readonly chartTypes: WeSheetChart['type'][] = ['column', 'bar', 'line', 'area', 'pie', 'donut'];

  readonly colors = WE_SHEET_COLORS;
  readonly formats: WeSheetNumberFormat[] = ['general', 'number', 'integer', 'currency', 'percent', 'date', 'text'];

  private evaluator!: WeGridSheetEvaluator;
  private undoStack: WeSheetData[] = [];
  private redoStack: WeSheetData[] = [];
  private dragging = false;
  /** Dragging the fill handle; `fillRange` is where the fill would go */
  private filling = false;
  fillRange: WeSheetRange | null = null;
  /** The dropdown-list editor (one choice per line), placed where the context menu was */
  listEditor: { kind: 'list' | 'note'; text: string; x: number; y: number } | null = null;
  /** The open choices of the active cell's dropdown list */
  picker: { options: string[]; index: number; x: number; y: number } | null = null;
  /** The ƒ button's list of every function, searchable by English or Turkish name */
  functionPicker: { query: string; index: number; x: number; y: number } | null = null;
  /** The conditional-formatting panel: the column it shows (as the panel expects one) and that range's rules */
  formatPanel: { range: string; column: { field: string; defaultHeader: string; type: 'number' | 'text' }; rules: WeGridFormatRule[] } | null = null;
  private resizing: { col: number; startX: number; startWidth: number } | null = null;
  /** What this sheet last copied — pasted back as raw cells (formulas shifted) instead of text */
  private clip: { text: string; range: WeSheetRange; cells: (WeSheetCell | undefined)[][]; values: unknown[][]; rows: number[]; cut: boolean } | null = null;
  private pasteValues = false;
  private readonly save$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    @Inject(WE_SHEET_STORE) private readonly store: WeSheetStore,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>
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
    if (changes['data'] && !changes['data'].firstChange && this.data && this.data !== this.sheet) {
      this.load(this.data);
    } else if (changes['resolveSheet'] && !changes['resolveSheet'].firstChange) {
      // Another sheet changed: recompute what refers to it
      this.otherSheets.clear();
      this.apply(this.sheet, false);
    }
  }

  /** Evaluators of the other sheets, by lower-cased name — rebuilt when the resolver changes */
  private readonly otherSheets = new Map<string, { data: WeSheetData; evaluator: WeGridSheetEvaluator } | null>();

  private otherSheet(name: string): WeGridSheetEvaluator | null {
    const key = name.toLocaleLowerCase();
    if (!this.otherSheets.has(key)) {
      const data = this.resolveSheet?.(name) ?? null;
      if (!data) {
        this.otherSheets.set(key, null);
      } else {
        const evaluator = new WeGridSheetEvaluator(
          (c, r) => data.cells[weSheetAddress(c, r)]?.v ?? null,
          () => ({ cols: data.cols, rows: data.rows }),
          { sheet: (n) => this.otherSheet(n), parseNumbers: false }
        );
        this.otherSheets.set(key, { data, evaluator });
      }
    }
    return this.otherSheets.get(key)?.evaluator ?? null;
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
    const m = b ? null : this.mergeAt(a);
    this.anchor = m ? { col: m.c1, row: m.r1 } : a;
    this.active = this.anchor;
    this.selection = m ?? this.withMerges(weSheetNormalize(a, b ?? a));
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
    if (this.filling) {
      this.fillRange = this.fillTargetAt(col, row);
      this.cdr.markForCheck();
    } else if (this.dragging) this.extendTo({ col, row });
  }

  // ─── Fill handle ─────────────────────────────────────────────────────

  onFillStart(event: MouseEvent): void {
    if (event.button !== 0 || this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    this.commitEdit();
    this.filling = true;
    this.fillRange = null;
  }

  /** Double-clicking the handle fills down as far as the column beside the selection goes, as in Excel */
  onFillDblClick(event: MouseEvent): void {
    event.stopPropagation();
    const s = this.selection;
    const filled = (c: number, r: number) => {
      const v = c >= 0 && c < this.sheet.cols ? this.sheet.cells[weSheetAddress(c, r)]?.v : undefined;
      return v !== undefined && v !== null && v !== '';
    };
    const side = filled(s.c1 - 1, s.r2 + 1) ? s.c1 - 1 : s.c2 + 1;
    let r2 = s.r2;
    while (r2 + 1 < this.sheet.rows && filled(side, r2 + 1)) r2++;
    if (r2 > s.r2) this.fill({ ...s, r2 });
  }

  /** Fills `target` from the selection — the fill handle's work; `target` must contain the selection */
  fill(target: WeSheetRange): void {
    if (this.readonly) return;
    const s = this.selection;
    if (target.c1 > s.c1 || target.r1 > s.r1 || target.c2 < s.c2 || target.r2 < s.r2) return;
    this.commit(this.keepCovered(weSheetFill(this.cloneForEdit(target.r2 + 1, target.c2 + 1), s, target)));
    this.selection = target;
    this.afterSelection();
  }

  /**
   * The fill handle from the keyboard (context menu): the filled rows at the top of the selection
   * start a series that continues through the empty rows below them
   */
  fillSeries(): void {
    this.closeMenu();
    const s = this.selection;
    const filled = (r: number) => {
      for (let c = s.c1; c <= s.c2; c++) if (this.sheet.cells[weSheetAddress(c, r)]?.v !== undefined) return true;
      return false;
    };
    let r2 = s.r1;
    while (r2 < s.r2 && filled(r2 + 1)) r2++;
    if (r2 === s.r2 || !filled(s.r1) || this.readonly) return;
    this.commit(this.keepCovered(weSheetFill(this.cloneForEdit(s.r2 + 1, s.c2 + 1), { ...s, r2 }, s)));
    this.afterSelection(false);
  }

  inFill(col: number, row: number): boolean {
    const f = this.fillRange;
    return !!f && col >= f.c1 && col <= f.c2 && row >= f.r1 && row <= f.r2 && !this.inSelection(col, row);
  }

  /** The selection grown towards a cell along the axis it is furthest out on, or null inside it */
  private fillTargetAt(col: number, row: number): WeSheetRange | null {
    const s = this.selection;
    const rows = row > s.r2 ? row - s.r2 : row < s.r1 ? s.r1 - row : 0;
    const cols = col > s.c2 ? col - s.c2 : col < s.c1 ? s.c1 - col : 0;
    if (!rows && !cols) return null;
    return rows >= cols ? { ...s, r1: Math.min(s.r1, row), r2: Math.max(s.r2, row) } : { ...s, c1: Math.min(s.c1, col), c2: Math.max(s.c2, col) };
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
    if (this.filling) {
      this.filling = false;
      const target = this.fillRange;
      this.fillRange = null;
      if (target) this.fill(target);
      else this.cdr.markForCheck();
    }
    if (this.resizing) {
      // The resize already changed `sheet`; record it without another undo step per pixel
      setTimeout(() => (this.resizing = null));
      this.emitChange();
    }
  }

  // ─── Keyboard ────────────────────────────────────────────────────────

  onGridKeydown(event: KeyboardEvent): void {
    if (this.editing) return;
    if (this.pickerKey(event)) return;
    // Alt+↓ on a header cell opens its filter, as in Excel
    if (event.altKey && event.key === 'ArrowDown' && this.active.row === 0 && this.sheet.headerRow && this.sheet.autoFilter && this.view[0]?.[this.active.col]?.text) {
      this.openFilter(null, this.active.col);
      event.preventDefault();
      return;
    }
    if (event.altKey && event.key === 'ArrowDown' && this.activeList) {
      this.openPicker();
      event.preventDefault();
      return;
    }
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
      if (lower === 'f' || lower === 'h') {
        this.openFind(lower === 'h');
        event.preventDefault();
        return;
      }
      // Ctrl+Shift+V: the paste that follows writes values only — no formulas, no formats
      if (lower === 'v' && event.shiftKey) {
        this.pasteValues = true;
        // Only the paste that follows at once — a browser that sends none must not change the next Ctrl+V
        setTimeout(() => (this.pasteValues = false), 500);
        return;
      }
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
    if (this.readonly || this.hiddenRows.has(this.active.row)) return;
    const raw = this.rawText(this.active.col, this.active.row);
    this.editing = { ...this.active, text: initial ?? raw, fromBar: false };
    this.barText = this.editing.text;
    this.cdr.detectChanges();
    const el = this.editorRef?.nativeElement;
    if (el) {
      // The cell is already in view — focusing must not scroll the page
      el.focus({ preventScroll: true });
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
    // A dropdown-list cell takes only its choices, written as the list writes them
    const list = this.sheet.cells[weSheetAddress(e.col, e.row)]?.l;
    let text = e.text;
    if (list && text.trim() !== '' && !text.startsWith('=')) {
      const match = list.find((o) => o.toLocaleLowerCase() === text.trim().toLocaleLowerCase());
      if (match === undefined) {
        this.notice = this.locale.sheetListInvalid;
        this.barText = this.rawText(e.col, e.row);
        this.cdr.markForCheck();
        return;
      }
      text = match;
    }
    const next = this.cloneForEdit(e.row + 1, e.col + 1);
    this.writeInput(next, e.col, e.row, text);
    this.commit(next);
  }

  // ─── Insert function (ƒ) ─────────────────────────────────────────────

  toggleFunctionPicker(event: MouseEvent): void {
    if (this.functionPicker || this.readonly) {
      this.functionPicker = null;
      return;
    }
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.functionPicker = { query: '', index: 0, x: Math.min(box.left, window.innerWidth - 300), y: box.bottom + 4 };
    queueMicrotask(() => this.scrollRef.nativeElement.closest('.we-sheet')?.querySelector<HTMLInputElement>('.we-sheet__functions-search')?.focus());
  }

  /** The functions whose English or Turkish name holds the search, English names first */
  get functionMatches(): WeSheetSuggestion[] {
    const q = (this.functionPicker?.query ?? '').trim().toLocaleUpperCase('tr');
    const seen = new Set<string>();
    const out: WeSheetSuggestion[] = [];
    for (const f of FUNCTION_NAMES) {
      if (seen.has(f.canonical) || (q && !f.name.toLocaleUpperCase('tr').includes(q))) continue;
      seen.add(f.canonical);
      out.push({ name: f.canonical, signature: `${f.canonical}(${WE_GRID_FORMULA_SIGNATURES[f.canonical] ?? ''})${f.name !== f.canonical ? ` · ${f.name}` : ''}` });
    }
    return out;
  }

  /** Puts `name(` into the active cell's formula — a new formula when the cell holds none — and edits it in the formula bar */
  insertFunction(name: string): void {
    this.functionPicker = null;
    if (this.readonly || this.hiddenRows.has(this.active.row)) return;
    const current = this.editing ? this.editing.text : this.rawText(this.active.col, this.active.row);
    const text = !current.startsWith('=') ? `=${name}(` : /[=(,;+\-*/^&<>\s]$/.test(current) ? `${current}${name}(` : `${current}+${name}(`;
    this.barText = text;
    this.editing = { ...this.active, text, fromBar: true };
    this.cdr.detectChanges();
    const bar = this.formulaBarRef?.nativeElement;
    if (!bar) return;
    bar.value = text;
    bar.focus({ preventScroll: true });
    bar.setSelectionRange(text.length, text.length);
  }

  onFunctionPickerKeydown(event: KeyboardEvent): void {
    const p = this.functionPicker;
    if (!p) return;
    const n = this.functionMatches.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (n) p.index = (p.index + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
      event.preventDefault();
      queueMicrotask(() => document.getElementById(`${this.uid}-fn-${p.index}`)?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
      const f = this.functionMatches[p.index];
      if (f) this.insertFunction(f.name);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.functionPicker = null;
      this.scrollRef.nativeElement.focus({ preventScroll: true });
    }
  }

  // ─── Dropdown lists ──────────────────────────────────────────────────

  /** The active cell's dropdown list, or null */
  get activeList(): string[] | null {
    return this.sheet.cells[weSheetAddress(this.active.col, this.active.row)]?.l ?? null;
  }

  /** Opens the list editor (or, for `'note'`, the note editor) for the selection, where the context menu was */
  openListEditor(kind: 'list' | 'note' = 'list'): void {
    const at = this.menu ?? { x: 40, y: 40 };
    this.closeMenu();
    if (this.readonly) return;
    const text = kind === 'list' ? (this.activeList ?? []).join('\n') : (this.sheet.cells[weSheetAddress(this.active.col, this.active.row)]?.n ?? '');
    this.listEditor = { kind, text, ...at };
    this.cdr.markForCheck();
    queueMicrotask(() => this.scrollRef.nativeElement.closest('.we-sheet')?.querySelector<HTMLTextAreaElement>('.we-sheet__list-editor textarea')?.focus());
  }

  /** Gives every selected cell the choices in `text`, one per line — none removes the list */
  saveList(text: string): void {
    const list = weSheetCleanList(text.split(/\r?\n/));
    this.closeListEditor();
    this.updateRange((cell) => {
      const { l: _l, ...rest } = cell;
      return list.length ? { ...rest, l: list } : rest;
    });
  }

  /** Gives the selected cells the note `text` — empty removes it */
  saveNote(text: string): void {
    const note = text.trim().slice(0, 1000);
    this.closeListEditor();
    this.updateRange((cell) => {
      const { n: _n, ...rest } = cell;
      return note ? { ...rest, n: note } : rest;
    });
  }

  // ─── Conditional formatting ──────────────────────────────────────────

  /**
   * Opens the grid's Format panel for the active cell's column: over the selected rows of it, or
   * over its used rows (below the header row) when one cell is selected
   */
  openFormatPanel(): void {
    this.closeMenu();
    if (this.readonly) return;
    const s = this.selection;
    const col = this.active.col;
    const used = this.usedSize();
    const [r1, r2] = s.r2 > s.r1 ? [s.r1, s.r2] : [this.sheet.headerRow ? 1 : 0, Math.max(used.rows - 1, this.sheet.headerRow ? 1 : 0)];
    const range = `${weSheetAddress(col, r1)}:${weSheetAddress(col, r2)}`;
    let numbers = 0;
    let values = 0;
    for (let r = r1; r <= r2; r++) {
      const v = this.evaluator.value(col, r);
      if (v === null || v === '') continue;
      values++;
      if (typeof v === 'number') numbers++;
    }
    const field = weGridColumnLetter(col);
    this.formatPanel = {
      range,
      column: { field, defaultHeader: range, type: values > 0 && numbers * 2 >= values ? 'number' : 'text' },
      rules: (this.sheet.formats ?? []).filter((f) => f.range === range)
    };
    this.cdr.markForCheck();
  }

  /** The panel's rules for its range replace that range's rules; other ranges keep theirs */
  onFormatRulesChange(rules: WeGridFormatRule[]): void {
    const panel = this.formatPanel;
    if (!panel) return;
    const own: WeSheetFormatRule[] = rules.map((r) => ({ ...r, field: panel.column.field, range: panel.range }));
    const formats = [...(this.sheet.formats ?? []).filter((f) => f.range !== panel.range), ...own];
    this.formatPanel = { ...panel, rules: own };
    const next: WeSheetData = { ...this.sheet, formats };
    if (!formats.length) delete next.formats;
    this.commit(next);
  }

  closeFormatPanel(): void {
    this.formatPanel = null;
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  closeListEditor(): void {
    if (!this.listEditor) return;
    this.listEditor = null;
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  onListEditorKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeListEditor();
    }
  }

  /** Shows the active cell's choices under it — Alt+↓, or the arrow on the cell */
  openPicker(): void {
    const options = this.activeList;
    if (!options || this.readonly) return;
    this.commitEdit();
    const cell = this.scrollRef.nativeElement.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(this.active.col, this.active.row)}"]`);
    const box = cell?.getBoundingClientRect();
    const current = String(this.sheet.cells[weSheetAddress(this.active.col, this.active.row)]?.v ?? '');
    const index = options.findIndex((o) => o === current || String(weSheetParseInput(o, this.decimalSeparator, this.dateOrder).value) === current);
    this.picker = { options, index: Math.max(0, index), x: box ? box.left : 40, y: box ? box.bottom : 40 };
    this.cdr.markForCheck();
  }

  pick(option: string): void {
    this.picker = null;
    this.setCell(weSheetAddress(this.active.col, this.active.row), option);
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.afterSelection(false);
  }

  /** Arrow keys, Enter and Escape while the choices are open; true when the key was used */
  private pickerKey(event: KeyboardEvent): boolean {
    const p = this.picker;
    if (!p) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      p.index = (p.index + (event.key === 'ArrowDown' ? 1 : -1) + p.options.length) % p.options.length;
    } else if (event.key === 'Enter') {
      this.pick(p.options[p.index]);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      this.picker = null;
    } else {
      return false;
    }
    event.preventDefault();
    this.cdr.markForCheck();
    return true;
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

  /** Wrap text on the selection, or off again when the active cell already wraps */
  toggleWrap(): void {
    const on = !this.activeCell?.w;
    this.updateRange((cell) => ({ ...cell, w: on || undefined }));
  }

  /** One decimal place more or fewer for the selection — Excel's Increase / Decrease Decimal */
  changeDecimals(delta: number): void {
    const current = this.activeCell?.d ?? (this.activeCell?.f === 'percent' || this.activeCell?.f === 'integer' ? 0 : 2);
    const next = Math.max(0, Math.min(10, current + delta));
    this.updateRange((cell) => ({ ...cell, d: next, f: cell.f === undefined || cell.f === 'general' || cell.f === 'integer' ? 'number' : cell.f }));
  }

  // ─── Find and replace ────────────────────────────────────────────────

  openFind(withReplace = false): void {
    this.commitEdit();
    this.find = { text: this.find?.text ?? '', replace: this.find?.replace ?? '', withReplace, matchCase: this.find?.matchCase ?? false, index: 0 };
    this.refreshMatches();
    this.cdr.markForCheck();
    queueMicrotask(() => this.scrollRef.nativeElement.closest('.we-sheet')?.querySelector<HTMLInputElement>('.we-sheet__find-input')?.focus());
  }

  closeFind(): void {
    this.find = null;
    this.findMatches = [];
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  onFindInput(text: string): void {
    if (!this.find) return;
    this.find.text = text;
    this.find.index = 0;
    this.refreshMatches();
    if (this.findMatches.length) this.moveTo(this.findMatches[0]);
  }

  setMatchCase(on: boolean): void {
    if (!this.find) return;
    this.find.matchCase = on;
    this.refreshMatches();
  }

  findNext(step = 1): void {
    if (!this.find || !this.findMatches.length) return;
    const n = this.findMatches.length;
    this.find.index = (this.find.index + step + n) % n;
    this.moveTo(this.findMatches[this.find.index]);
  }

  onFindKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.findNext(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeFind();
    }
  }

  /** Replaces the text in the current match, then moves on to the next one */
  replaceOne(): void {
    const f = this.find;
    if (!f || this.readonly || !this.findMatches.length) return;
    const at = this.findMatches[f.index];
    const next = this.cloneForEdit(0, 0);
    this.writeInput(next, at.col, at.row, this.replaceIn(this.rawText(at.col, at.row)));
    this.commit(next);
    this.refreshMatches();
    if (this.findMatches.length) {
      f.index = Math.min(f.index, this.findMatches.length - 1);
      this.moveTo(this.findMatches[f.index]);
    }
  }

  replaceAll(): void {
    const f = this.find;
    if (!f || this.readonly || !this.findMatches.length) return;
    const next = this.cloneForEdit(0, 0);
    const count = this.findMatches.length;
    for (const at of this.findMatches) this.writeInput(next, at.col, at.row, this.replaceIn(this.rawText(at.col, at.row)));
    this.commit(next);
    this.refreshMatches();
    this.notice = this.locale.sheetReplaced(count);
  }

  /** Cells whose shown text (or, for formulas, the formula) contains the search text */
  private refreshMatches(): void {
    const f = this.find;
    this.findMatches = [];
    if (!f || !f.text) return;
    const needle = f.matchCase ? f.text : f.text.toLocaleLowerCase(this.locale.intlLocale);
    const norm = (t: string) => (f.matchCase ? t : t.toLocaleLowerCase(this.locale.intlLocale));
    for (let r = 0; r < this.sheet.rows; r++) {
      for (let c = 0; c < this.sheet.cols; c++) {
        const shown = this.view[r]?.[c]?.text ?? '';
        const raw = this.rawText(c, r);
        if (norm(shown).includes(needle) || (raw.startsWith('=') && norm(raw).includes(needle))) this.findMatches.push({ col: c, row: r });
      }
    }
  }

  private replaceIn(text: string): string {
    const f = this.find!;
    const escaped = f.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, f.matchCase ? 'g' : 'gi'), () => f.replace);
  }

  setFormat(format: WeSheetNumberFormat): void {
    this.updateRange((cell) => ({ ...cell, f: format === 'general' ? undefined : format }));
  }

  clearFormatting(): void {
    this.updateRange((cell) => ({ v: cell.v, l: cell.l, n: cell.n }));
  }

  toggleHeaderRow(): void {
    this.commit({ ...this.sheet, headerRow: !this.sheet.headerRow || undefined });
  }

  /** Filter buttons on the header row; turning them off shows every row again */
  toggleAutoFilter(): void {
    const next: WeSheetData = { ...this.sheet, autoFilter: !this.sheet.autoFilter || undefined };
    if (!next.autoFilter) delete next.filters;
    this.commit(next);
  }

  /** Whether a column's filter hides anything — its button shows filled */
  isFiltered(col: number): boolean {
    return !!this.sheet.filters?.[weGridColumnLetter(col)]?.length;
  }

  /** Opens a header cell's filter: every distinct text under it, ticked when shown */
  openFilter(event: MouseEvent | null, col: number): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.commitEdit();
    const hidden = new Set(this.sheet.filters?.[weGridColumnLetter(col)] ?? []);
    const texts = new Set<string>();
    const used = this.usedSize();
    const others = Object.entries(this.sheet.filters ?? {})
      .filter(([letter]) => letter !== weGridColumnLetter(col))
      .map(([letter, list]) => [weGridColumnIndex(letter), new Set(list)] as const);
    for (let r = 1; r < used.rows; r++) {
      if (others.some(([c, list]) => list.has(this.view[r]?.[c]?.text ?? ''))) continue;
      texts.add(this.view[r]?.[col]?.text ?? '');
    }
    const sorted = [...texts].filter((t) => t !== '').sort((a, b) => a.localeCompare(b, this.locale.intlLocale, { numeric: true }));
    if (texts.has('')) sorted.push('');
    const anchor = (event?.currentTarget as HTMLElement | null) ?? this.scrollRef.nativeElement.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(col, 0)}"]`);
    const box = anchor?.getBoundingClientRect() ?? { left: 40, bottom: 40 };
    this.filterMenu = {
      col,
      x: Math.min(box.left, window.innerWidth - 260),
      y: box.bottom,
      values: sorted.map((text) => ({ text, label: text === '' ? this.locale.emptyGroupValue : text, shown: !hidden.has(text) }))
    };
    this.cdr.markForCheck();
    queueMicrotask(() => this.scrollRef.nativeElement.closest('.we-sheet')?.querySelector<HTMLElement>('.we-sheet__filter input')?.focus());
  }

  get filterAllShown(): boolean {
    return !!this.filterMenu?.values.every((v) => v.shown);
  }

  setAllFilterValues(shown: boolean): void {
    this.filterMenu?.values.forEach((v) => (v.shown = shown));
  }

  /** Hides the rows whose text in the column is unticked; `clear` shows them all */
  applyFilter(clear = false): void {
    const menu = this.filterMenu;
    if (!menu) return;
    const letter = weGridColumnLetter(menu.col);
    const hidden = clear ? [] : menu.values.filter((v) => !v.shown).map((v) => v.text);
    const filters = { ...(this.sheet.filters ?? {}) };
    if (hidden.length) filters[letter] = hidden;
    else delete filters[letter];
    this.closeFilter();
    const next: WeSheetData = { ...this.sheet, filters };
    if (!Object.keys(filters).length) delete next.filters;
    this.commit(next);
  }

  closeFilter(): void {
    if (!this.filterMenu) return;
    this.filterMenu = null;
    this.scrollRef.nativeElement.focus({ preventScroll: true });
    this.cdr.markForCheck();
  }

  onFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeFilter();
    }
  }

  /** `to`, or the nearest row the filters don't hide — in the direction of travel first, then back */
  private toShown(to: Pos, step: number): Pos {
    if (!this.hiddenRows.has(to.row)) return to;
    for (const dir of [step || 1, -(step || 1)]) {
      for (let row = to.row + dir; row >= 0 && row < this.sheet.rows; row += dir) {
        if (!this.hiddenRows.has(row)) return { col: to.col, row };
      }
    }
    return to;
  }

  toggleStriped(): void {
    this.commit({ ...this.sheet, striped: !this.sheet.striped || undefined });
  }

  /** Charts the selection (or replaces the chart's type when one exists and nothing new is selected) */
  insertChart(type: WeSheetChart['type'] = 'column'): void {
    const s = this.selection;
    const single = s.r1 === s.r2 && s.c1 === s.c2;
    const used = this.usedSize();
    const range = single ? `A1:${weSheetAddress(used.cols - 1, used.rows - 1)}` : this.selectionLabel;
    this.commit({ ...this.sheet, chart: { range, type } });
  }

  setChartType(type: WeSheetChart['type']): void {
    if (this.sheet.chart) this.commit({ ...this.sheet, chart: { ...this.sheet.chart, type } });
  }

  removeChart(): void {
    if (!this.sheet.chart) return;
    const { chart: _chart, ...rest } = this.sheet;
    this.commit(rest as WeSheetData);
  }

  toggleFreezeColumn(): void {
    const next: WeSheetData = { ...this.sheet, freezeColumn: !this.frozenCols || undefined };
    delete next.freeze;
    if (this.frozenRows) next.freeze = { rows: this.frozenRows, cols: this.frozenCols ? 0 : 1 };
    if (next.freeze) delete next.freezeColumn;
    this.commit(next);
  }

  /** Freeze panes at the active cell: the rows above it and the columns before it stay in view; again to unfreeze */
  toggleFreezePanes(): void {
    this.optionsOpen = false;
    const next: WeSheetData = { ...this.sheet };
    delete next.freezeColumn;
    delete next.freeze;
    const rows = Math.min(this.active.row, 50);
    const cols = Math.min(this.active.col, 20);
    if (!this.frozenRows && !this.frozenCols && (rows || cols)) next.freeze = { rows, cols };
    this.commit(next);
  }

  /** Columns that stay in view while scrolling sideways */
  get frozenCols(): number {
    return this.sheet.freeze?.cols ?? (this.sheet.freezeColumn ? 1 : 0);
  }

  /** Rows that stay in view while scrolling down (a header row stays as well) */
  get frozenRows(): number {
    return this.sheet.freeze?.rows ?? 0;
  }

  /** Where a frozen column sticks: past the row numbers and the frozen columns before it */
  frozenLeft(col: number): string | null {
    if (col >= this.frozenCols) return null;
    const widths = this.sheet.widths;
    let cache = this.leftCache;
    if (!cache || cache.widths !== widths || cache.cols !== this.frozenCols) {
      const values: string[] = [];
      let px = 0;
      for (let c = 0; c < this.frozenCols; c++) {
        values.push(`calc(3rem + ${px}px)`);
        px += this.width(c);
      }
      cache = this.leftCache = { widths, cols: this.frozenCols, values };
    }
    return cache.values[col];
  }

  /** Where a frozen row sticks: under the column letters and the frozen rows shown above it */
  frozenTop(row: number): string | null {
    // shortcut: assumes the standard row height — a wrapped row in the frozen area overlaps the next; measure rows if that matters
    if (row >= this.frozenRows) return this.sheet.headerRow && row === 0 ? '1.6rem' : null;
    let above = 0;
    for (let r = 0; r < row; r++) if (!this.hiddenRows.has(r)) above++;
    return `calc(1.6rem + ${above * 1.75}rem)`;
  }

  /** A cell (or the merge it starts) lies wholly in the frozen columns */
  isFrozenCol(col: number, row: number): boolean {
    return col + (this.view[row]?.[col]?.colspan ?? 1) <= this.frozenCols;
  }

  /** A cell (or the merge it starts) lies wholly in the frozen rows */
  isFrozenRow(col: number, row: number): boolean {
    return row + (this.view[row]?.[col]?.rowspan ?? 1) <= this.frozenRows;
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
    const size = axis === 'row' ? this.sheet.rows : this.sheet.cols;
    const max = axis === 'row' ? WE_SHEET_MAX_ROWS : WE_SHEET_MAX_COLS;
    const keep = max - count;
    if (count > 0 && size + count > max && Object.keys(this.sheet.cells).some((k) => {
      const p = weSheetParseAddress(k);
      return !!p && (axis === 'row' ? p.row : p.col) >= keep;
    })) {
      this.notice = this.locale.sheetFull;
      this.cdr.markForCheck();
      return;
    }
    this.commit(weSheetInsert(this.sheet, axis, at, count));
    this.structureChange.emit({ axis, at, count });
  }

  /** Σ — sums the numbers above (or left of) the active cell, or under each column of a block */
  autoSum(): void {
    this.closeMenu();
    if (this.readonly) return;
    this.commitEdit();
    const s = this.selection;
    const range = this.selectionIsMerge ? { c1: s.c1, r1: s.r1, c2: s.c1, r2: s.r1 } : s;
    const writes = weSheetAutoSum(range, (c, r) => typeof this.evaluator.value(c, r) === 'number');
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
    const target = event.target as HTMLElement;
    if (this.menu && !target.closest?.('.we-sheet__menu')) this.closeMenu();
    if (this.listEditor && !target.closest?.('.we-sheet__list-editor')) this.closeListEditor();
    if (this.filterMenu && !target.closest?.('.we-sheet__filter')) this.closeFilter();
    if (this.functionPicker && !target.closest?.('.we-sheet__functions, .we-sheet__fx')) {
      this.functionPicker = null;
      this.cdr.markForCheck();
    }
    if (this.picker && !target.closest?.('.we-sheet__picker, .we-sheet__pick-btn')) {
      this.picker = null;
      this.cdr.markForCheck();
    }
    if (this.optionsOpen && !target.closest?.('.we-sheet__palette-host')) {
      this.optionsOpen = false;
      this.cdr.markForCheck();
    }
    if (this.openPalette && !target.closest?.('.we-sheet__palette-host')) {
      this.openPalette = null;
      this.cdr.markForCheck();
    }
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
      let all: string[][];
      if (isXlsx) {
        const sheets = await weGridReadXlsxCells(file, weSheetShiftFormula);
        if (sheets.length > 1 && this.importSheets) {
          this.importSheets(sheets);
          return;
        }
        // The first worksheet, cell by cell where it stands — formulas included
        const first = sheets[0];
        const { data, truncated } = weSheetFromCells(first?.cells ?? {}, '.', this.sheet.rows, this.sheet.cols, first?.merges, first?.formats, first);
        this.commit({ ...data, headerRow: true, striped: this.sheet.striped });
        this.moveTo({ col: 0, row: 0 });
        if (truncated) {
          this.notice = this.locale.sheetImportTruncated;
          this.cdr.markForCheck();
        }
        return;
      } else {
        const table = weGridParseCsv(await file.text());
        all = [table.headers, ...table.rows];
      }
      const lines = all.slice(0, WE_SHEET_MAX_ROWS).map((l) => l.slice(0, WE_SHEET_MAX_COLS));
      let cols = this.sheet.cols;
      let truncated = lines.length < all.length;
      for (let r = 0; r < lines.length; r++) {
        if (all[r].length > WE_SHEET_MAX_COLS) truncated = true;
        if (lines[r].length > cols) cols = lines[r].length;
      }
      let next: WeSheetData = { ...weSheetEmpty(Math.min(WE_SHEET_MAX_ROWS, Math.max(this.sheet.rows, lines.length + 10)), cols), headerRow: true, striped: this.sheet.striped };
      next = { ...next, cells: {} };
      // Excel stores numbers with a dot whatever the locale; a CSV is written in the user's own
      const separator: '.' | ',' = isXlsx ? '.' : this.decimalSeparator;
      lines.forEach((line, r) =>
        line.forEach((text, c) => {
          const parsed = weSheetParseInput(text, separator, this.dateOrder);
          if (parsed.value !== null && parsed.value !== undefined) next.cells[weSheetAddress(c, r)] = parsed.format ? { v: parsed.value, f: parsed.format } : { v: parsed.value };
        })
      );
      this.commit(next);
      this.moveTo({ col: 0, row: 0 });
      if (truncated) {
        this.notice = this.locale.sheetImportTruncated;
        this.cdr.markForCheck();
      }
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
      // Shortest first — `=SU` offers SUM before SUBSTITUTE
      .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
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
    const block = s.r2 > s.r1 && !(s.r1 === 0 && s.r2 === this.sheet.rows - 1);
    const range: WeSheetRange = block
      ? s
      : { c1: 0, r1: this.sheet.headerRow ? 1 : 0, c2: Math.max(used.cols - 1, 0), r2: Math.max(used.rows - 1, 0) };
    if (range.r2 <= range.r1) return;
    if (this.mergeRanges.some((m) => m.c1 <= range.c2 && range.c1 <= m.c2 && m.r1 <= range.r2 && range.r1 <= m.r2)) {
      this.notice = this.locale.sheetMergeSort;
      this.cdr.markForCheck();
      return;
    }
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
      for (let r = s.r1 + 1; r <= s.r2; r++) if (!this.hiddenRows.has(r)) this.putCell(next, c, r, this.shiftedCell(source, 0, r - s.r1));
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
    const rows: number[] = [];
    const values: unknown[][] = [];
    for (let r = s.r1; r <= r2; r++) {
      // Rows the filters hide are left out, as Excel copies the visible cells of a filtered range
      if (this.hiddenRows.has(r)) continue;
      rows.push(r);
      values.push(Array.from({ length: c2 - s.c1 + 1 }, (_, i) => this.evaluator.value(s.c1 + i, r)));
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
    this.clip = { text, range: { c1: s.c1, r1: s.r1, c2, r2 }, cells, values, rows, cut };
    event.clipboardData?.setData('text/plain', text);
    event.preventDefault();
    if (cut && !this.readonly) this.clearContents();
  }

  onPaste(event: ClipboardEvent): void {
    if (this.editing || this.readonly) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    const valuesOnly = this.pasteValues;
    this.pasteValues = false;
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
        if (own && valuesOnly) {
          // The values the copy showed, into the cells as they are formatted here
          const v = own.values[r][c];
          const key = weSheetAddress(at.col + c, at.row + r);
          const value = typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || v === null ? v : weGridFormulaValueToText(v);
          // Text is written as it is: "007" stays "007", as Excel's Paste Values keeps it
          this.putCell(next, at.col + c, at.row + r, this.compact({ ...(next.cells[key] ?? {}), v: value === '' ? null : value }));
        } else if (own) {
          const dCol = own.cut ? 0 : at.col - own.range.c1;
          const dRow = own.cut ? 0 : at.row + r - own.rows[r];
          this.putCell(next, at.col + c, at.row + r, this.shiftedCell(own.cells[r][c], dCol, dRow));
        } else {
          this.writeInput(next, at.col + c, at.row + r, table![r][c]);
        }
      }
    }
    // A cut is pasted once, as in Excel
    if (own?.cut) this.clip = null;
    this.commit(next);
    this.selection = { c1: at.col, r1: at.row, c2: at.col + Math.max(maxWidth - 1, 0), r2: at.row + Math.max(height - 1, 0) };
    this.afterSelection();
  }

  // ─── Export ──────────────────────────────────────────────────────────

  exportAs(format: 'xlsx' | 'csv' | 'pdf'): void {
    const table = this.buildExportTable();
    const name = this.exportFileName || 'sheet';
    if (format === 'pdf') {
      // Printed as it is shown: the rows the filters hide stay out, the theme colours come along
      const styles = getComputedStyle(this.host.nativeElement);
      const cssVariables: Record<string, string> = {};
      for (const v of ['--we-grid-print-color', '--we-grid-print-bg', '--we-grid-print-border-color', '--we-grid-print-header-bg', '--we-grid-print-muted-color', '--we-grid-accent-color']) {
        const value = styles.getPropertyValue(v).trim();
        if (value) cssVariables[v] = value;
      }
      const first = this.sheet.headerRow ? 1 : 0;
      const rows = table.rows.filter((_, i) => !this.hiddenRows.has(i + first));
      weGridPrintTable({ ...table, title: this.exportFileName || this.locale.sheetLabel, rows, cssVariables });
    } else if (format === 'csv') {
      weGridDownloadBlob(new Blob([weGridToCsv(table)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    } else {
      // Cell by cell, with formulas — the whole workbook when the sheet is part of one
      const sheets = this.xlsxSheets?.() ?? [{ name: this.exportFileName || 'Sheet1', data: this.sheet }];
      weGridDownloadBlob(weSheetWorkbookXlsx(sheets), `${name}.xlsx`);
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

  /** Whether the locale writes the day or the month first — how a typed `3/4/2026` is read */
  private get dateOrder(): 'dmy' | 'mdy' {
    const parts = new Intl.DateTimeFormat(this.locale.intlLocale).formatToParts(new Date(2000, 10, 22));
    return parts.findIndex((p) => p.type === 'month') < parts.findIndex((p) => p.type === 'day') ? 'mdy' : 'dmy';
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

  private apply(data: WeSheetData, emit = true): void {
    this.sheet = data;
    this.evaluator = new WeGridSheetEvaluator(
      (c, r) => this.sheet.cells[weSheetAddress(c, r)]?.v ?? null,
      () => ({ cols: this.sheet.cols, rows: this.sheet.rows }),
      { sheet: (name) => this.otherSheet(name), parseNumbers: false }
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
    if (emit) this.emitChange();
  }

  private emitChange(): void {
    this.dataChange.emit(this.sheet);
    this.save$.next();
  }

  /** First column: categories; first row: series names when it holds text; numbers in between */
  private rebuildChart(): void {
    const chart = this.sheet.chart;
    const [a, b] = (chart?.range ?? '').split(':').map((x) => weSheetParseAddress(x));
    if (!chart || !a || !b) {
      this.chartData = null;
      return;
    }
    const r = weSheetNormalize(a, b);
    const text = (c: number, row: number) => this.view[row]?.[c]?.text ?? '';
    const headerIsText = r.r2 > r.r1 && Array.from({ length: r.c2 - r.c1 }, (_, i) => this.evaluator.value(r.c1 + 1 + i, r.r1)).every((v) => typeof v !== 'number');
    const firstRow = headerIsText ? r.r1 + 1 : r.r1;
    const categoryIsText = r.c2 > r.c1;
    const firstCol = categoryIsText ? r.c1 + 1 : r.c1;
    const categories: string[] = [];
    for (let row = firstRow; row <= r.r2; row++) categories.push(categoryIsText ? text(r.c1, row) : String(row + 1));
    const series = [];
    for (let c = firstCol; c <= r.c2; c++) {
      series.push({
        name: headerIsText ? text(c, r.r1) : weGridColumnLetter(c),
        values: categories.map((_, i) => {
          const v = this.evaluator.value(c, firstRow + i);
          return typeof v === 'number' && Number.isFinite(v) ? v : null;
        })
      });
    }
    this.chartData = { categories, series };
  }

  /**
   * Borders, drawn in the strong ink on the grid lines the cells already have: a cell's right and
   * bottom lines are its own, its top and left ones belong to the cells above and before it
   */
  private applyBorders(view: CellView[][]): void {
    const ink = 'var(--we-grid-font-color, #212529)';
    const merges = this.parseMerges();
    const paint = (r: number, c: number, side: 'right' | 'bottom') => {
      const m = merges.find((x) => c >= x.c1 && c <= x.c2 && r >= x.r1 && r <= x.r2);
      const target = m ? view[m.r1]?.[m.c1] : view[r]?.[c];
      if (target) target.css = { ...(target.css ?? {}), [`border-${side}-color`]: ink };
    };
    for (const [key, cell] of Object.entries(this.sheet.cells)) {
      if (!cell.b) continue;
      const at = weSheetParseAddress(key);
      if (!at) continue;
      if (cell.b.includes('r')) paint(at.row, at.col, 'right');
      if (cell.b.includes('b')) paint(at.row, at.col, 'bottom');
      if (cell.b.includes('t') && at.row > 0) paint(at.row - 1, at.col, 'bottom');
      if (cell.b.includes('l') && at.col > 0) paint(at.row, at.col - 1, 'right');
    }
  }

  /** Borders on the selection: every line, the outline, the bottom line, or none */
  setBorders(kind: 'all' | 'outside' | 'bottom' | 'none'): void {
    this.openPalette = null;
    if (this.readonly) return;
    this.commitEdit();
    const s = this.selection;
    const next = this.cloneForEdit(0, 0);
    for (let r = s.r1; r <= s.r2; r++) {
      if (this.hiddenRows.has(r)) continue;
      for (let c = s.c1; c <= s.c2; c++) {
        const key = weSheetAddress(c, r);
        const cell = next.cells[key] ?? {};
        // A merge's top-left cell stands for the whole merge: its right and bottom are the merge's
        const m = this.mergeAt({ col: c, row: r });
        const endCol = m && m.c1 === c && m.r1 === r ? m.c2 : c;
        const endRow = m && m.c1 === c && m.r1 === r ? m.r2 : r;
        let sides = kind === 'none' ? '' : kind === 'all' ? 'trbl' : cell.b ?? '';
        if (kind === 'outside') {
          if (r === s.r1) sides += 't';
          if (endRow === s.r2) sides += 'b';
          if (c === s.c1) sides += 'l';
          if (endCol === s.c2) sides += 'r';
        } else if (kind === 'bottom' && endRow === s.r2) sides += 'b';
        const b = weSheetBorderSides(sides);
        const { b: _b, ...rest } = cell;
        this.putCell(next, c, r, this.compact(b ? { ...rest, b } : rest));
      }
    }
    this.commit(next);
  }

  /** Conditional formatting over the computed values — over the cell's own style, as in Excel */
  private applyFormats(view: CellView[][]): void {
    const groups = new Map<string, WeSheetFormatRule[]>();
    for (const rule of this.sheet.formats ?? []) groups.set(rule.range, [...(groups.get(rule.range) ?? []), rule]);
    for (const [range, rules] of groups) {
      const [a, b] = range.split(':').map((p) => weSheetParseAddress(p));
      if (!a || !b) continue;
      const rows: number[] = [];
      for (let r = Math.min(a.row, b.row); r <= Math.min(Math.max(a.row, b.row), this.sheet.rows - 1); r++) rows.push(r);
      const field = rules[0].field;
      const resolved = weGridResolveFormats(rows, rules, [field], (r) => {
        const v = this.evaluator.value(a.col, r);
        return typeof v === 'object' && v !== null && !(v instanceof Date) ? null : v;
      });
      for (const [r, css] of resolved) {
        const target = view[r]?.[a.col];
        if (target && css[field]) target.css = { ...(target.css ?? {}), ...css[field] };
      }
    }
  }

  /** `next` with the cells under each merge's top-left cell as they were — what a fill must not change */
  private keepCovered(next: WeSheetData): WeSheetData {
    for (const m of this.mergeRanges) {
      for (let r = m.r1; r <= m.r2; r++) {
        for (let c = m.c1; c <= m.c2; c++) {
          if (r === m.r1 && c === m.c1) continue;
          const key = weSheetAddress(c, r);
          if (this.sheet.cells[key]) next.cells[key] = this.sheet.cells[key];
          else delete next.cells[key];
        }
      }
    }
    return next;
  }

  /** Merged cells: the top-left one spans the range (its shown rows), the others are not drawn */
  private parseMerges(): WeSheetRange[] {
    const out: WeSheetRange[] = [];
    for (const label of this.sheet.merges ?? []) {
      const [a, b] = label.split(':').map((p) => weSheetParseAddress(p));
      if (!a || !b) continue;
      const m = weSheetNormalize(a, b);
      if (m.r2 < this.sheet.rows && m.c2 < this.sheet.cols) out.push(m);
    }
    return out;
  }

  private applyMerges(): void {
    for (const m of this.mergeRanges) {
      let shown = 0;
      for (let r = m.r1; r <= m.r2; r++) if (!this.hiddenRows.has(r)) shown++;
      for (let r = m.r1; r <= m.r2; r++) {
        for (let c = m.c1; c <= m.c2; c++) {
          const cell = this.view[r][c];
          if (r === m.r1 && c === m.c1) {
            cell.colspan = m.c2 - m.c1 + 1;
            cell.rowspan = Math.max(shown, 1);
          } else cell.covered = true;
        }
      }
    }
  }

  /** The merge a cell is part of, or null */
  private mergeAt(p: Pos): WeSheetRange | null {
    return this.mergeRanges.find((m) => p.col >= m.c1 && p.col <= m.c2 && p.row >= m.r1 && p.row <= m.r2) ?? null;
  }

  /** `range` grown until it cuts no merge in two */
  private withMerges(range: WeSheetRange): WeSheetRange {
    let r = { ...range };
    for (let changed = true; changed; ) {
      changed = false;
      for (const m of this.mergeRanges) {
        if (m.c1 <= r.c2 && r.c1 <= m.c2 && m.r1 <= r.r2 && r.r1 <= m.r2 && (m.c1 < r.c1 || m.c2 > r.c2 || m.r1 < r.r1 || m.r2 > r.r2)) {
          r = { c1: Math.min(r.c1, m.c1), r1: Math.min(r.r1, m.r1), c2: Math.max(r.c2, m.c2), r2: Math.max(r.r2, m.r2) };
          changed = true;
        }
      }
    }
    return r;
  }

  /** The selection's bottom-right cell as drawn — a merge's top-left cell when the corner is under one */
  isCorner(col: number, row: number): boolean {
    const s = this.selection;
    const m = this.mergeAt({ col: s.c2, row: s.r2 });
    return m ? col === m.c1 && row === m.r1 : col === s.c2 && row === s.r2;
  }

  /** Merge & center: merges the selection (keeping the top-left value, centred), or splits the merge it is */
  toggleMerge(): void {
    if (this.readonly) return;
    this.commitEdit();
    const s = this.selection;
    const merges = this.sheet.merges ?? [];
    const own = this.mergeRanges.find((m) => m.c1 <= s.c2 && s.c1 <= m.c2 && m.r1 <= s.r2 && s.r1 <= m.r2 && m.c1 >= s.c1 && m.c2 <= s.c2 && m.r1 >= s.r1 && m.r2 <= s.r2);
    if (own && own.c1 === s.c1 && own.c2 === s.c2 && own.r1 === s.r1 && own.r2 === s.r2) {
      const label = weSheetRangeLabel(own);
      const next: WeSheetData = { ...this.sheet, merges: merges.filter((m) => m !== label) };
      if (!next.merges!.length) delete next.merges;
      this.commit(next);
      return;
    }
    if (s.c1 === s.c2 && s.r1 === s.r2) return;
    const next = this.cloneForEdit(0, 0);
    const keep = merges.filter((label) => {
      const [a, b] = label.split(':').map((p) => weSheetParseAddress(p));
      const m = a && b ? weSheetNormalize(a, b) : null;
      return !!m && !(m.c1 <= s.c2 && s.c1 <= m.c2 && m.r1 <= s.r2 && s.r1 <= m.r2);
    });
    // As in Excel, only the top-left value stays
    for (let r = s.r1; r <= s.r2; r++) {
      for (let c = s.c1; c <= s.c2; c++) {
        if (r === s.r1 && c === s.c1) continue;
        const key = weSheetAddress(c, r);
        const cell = next.cells[key];
        if (!cell) continue;
        const kept = this.compact({ ...cell, v: undefined });
        if (Object.keys(kept).length) next.cells[key] = kept;
        else delete next.cells[key];
      }
    }
    const anchor = weSheetAddress(s.c1, s.r1);
    next.cells[anchor] = { ...(next.cells[anchor] ?? {}), a: 'center' };
    next.merges = [...keep, weSheetRangeLabel(s)];
    this.commit(next);
  }

  /** Whether the selection is exactly one merge — the Merge button shows pressed */
  get selectionIsMerge(): boolean {
    const s = this.selection;
    return this.mergeRanges.some((m) => m.c1 === s.c1 && m.c2 === s.c2 && m.r1 === s.r1 && m.r2 === s.r2);
  }

  /** The rows the header-row filters hide, and the rows left to draw */
  private applyFilters(): void {
    const hidden = new Set<number>();
    const filters = this.sheet.headerRow && this.sheet.autoFilter ? Object.entries(this.sheet.filters ?? {}) : [];
    if (filters.length) {
      const used = this.usedSize();
      const columns = filters.map(([letter, texts]) => [weGridColumnIndex(letter), new Set(texts)] as const);
      for (let r = 1; r < used.rows; r++) {
        if (columns.some(([c, texts]) => texts.has(this.view[r]?.[c]?.text ?? ''))) hidden.add(r);
      }
      // A merge is shown or hidden whole, by its top-left row — never a row of it without the cell that spans it
      for (const m of this.mergeRanges) {
        const hide = hidden.has(m.r1);
        for (let r = m.r1 + 1; r <= m.r2; r++) {
          if (hide) hidden.add(r);
          else hidden.delete(r);
        }
      }
    }
    this.hiddenRows = hidden;
    this.visibleRows = hidden.size ? this.rowNumbers.filter((r) => !hidden.has(r)) : this.rowNumbers;
    // The active cell never stays on a row that just got hidden
    if (hidden.has(this.active.row)) {
      const p = this.toShown(this.active, 1);
      this.anchor = p;
      this.active = p;
      this.selection = weSheetNormalize(p, p);
    }
  }

  private rebuildView(): void {
    const view: CellView[][] = [];
    for (let r = 0; r < this.sheet.rows; r++) {
      const line: CellView[] = [];
      for (let c = 0; c < this.sheet.cols; c++) {
        const cell = this.sheet.cells[weSheetAddress(c, r)];
        const value = this.evaluator.value(c, r);
        const text = weSheetFormatValue(value, cell?.f, this.locale.intlLocale, this.currency, cell?.d);
        const error = typeof value === 'object' && value !== null && !(value instanceof Date);
        const numeric = typeof value === 'number' && cell?.f !== 'text';
        const css = cell?.s ? weGridCellStyleCss(cell.s) : null;
        const wrapCss = cell?.w ? { 'white-space': 'normal', 'overflow-wrap': 'anywhere', height: 'auto' } : null;
        line.push({ text, css: wrapCss ? { ...(css ?? {}), ...wrapCss } : css && Object.keys(css).length ? css : null, align: cell?.a ?? (numeric || error ? 'end' : 'start'), error, note: cell?.n ?? null });
      }
      view.push(line);
    }
    this.applyBorders(view);
    this.applyFormats(view);
    this.view = view;
    this.mergeRanges = this.parseMerges();
    this.applyFilters();
    this.applyMerges();
    this.rebuildChart();
  }

  private rawText(col: number, row: number): string {
    const v = this.sheet.cells[weSheetAddress(col, row)]?.v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number' && this.sheet.cells[weSheetAddress(col, row)]?.f === 'date') {
      const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      return new Intl.DateTimeFormat(this.locale.intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
    }
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
    const asText = target.cells[key]?.f === 'text' && typeof input === 'string' && !input.startsWith('=') && !input.startsWith("'");
    const parsed = asText ? { value: input === '' ? null : input } : typeof input === 'string' ? weSheetParseInput(input, this.decimalSeparator, this.dateOrder) : { value: input };
    const cell: WeSheetCell = { ...(target.cells[key] ?? {}) };
    if (parsed.value === null || parsed.value === undefined) delete cell.v;
    else cell.v = parsed.value;
    if (parsed.format) cell.f = parsed.format;
    this.putCell(target, col, row, cell);
  }

  private putCell(target: WeSheetData, col: number, row: number, cell: WeSheetCell | undefined): void {
    if (col >= target.cols || row >= target.rows) return;
    const m = this.mergeAt({ col, row });
    if (m && (m.c1 !== col || m.r1 !== row)) return;
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
      if (this.hiddenRows.has(r)) continue;
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
    if (cell.d !== undefined) out.d = cell.d;
    if (cell.l?.length) out.l = cell.l;
    if (cell.n) out.n = cell.n;
    if (cell.b) out.b = cell.b;
    if (cell.w) out.w = true;
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
    p = this.toShown(p, Math.sign(p.row - this.active.row));
    // Moving within the merge the cursor is on goes past it, as in Excel
    const here = this.mergeAt(this.active);
    if (here && this.mergeAt(p) === here && (p.col !== this.active.col || p.row !== this.active.row)) {
      const step = this.clamp({
        col: p.col > this.active.col ? here.c2 + 1 : p.col < this.active.col ? here.c1 - 1 : p.col,
        row: p.row > this.active.row ? here.r2 + 1 : p.row < this.active.row ? here.r1 - 1 : p.row
      });
      p = this.mergeAt(step) === here ? this.active : this.toShown(step, Math.sign(step.row - this.active.row));
    }
    const m = this.mergeAt(p);
    if (m) p = { col: m.c1, row: m.r1 };
    this.anchor = p;
    this.active = p;
    this.selection = m ?? weSheetNormalize(p, p);
    this.afterSelection();
  }

  private extendTo(p: Pos): void {
    p = this.toShown(p, Math.sign(p.row - this.focusCorner().row));
    this.selection = this.withMerges(weSheetNormalize(this.anchor, p));
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
    this.picker = null;
    if (!this.editing) this.barText = this.rawText(this.active.col, this.active.row);
    const values: unknown[] = [];
    const s = this.selection;
    const used = this.usedSize();
    for (let r = s.r1; r <= Math.min(s.r2, used.rows - 1); r++) {
      if (this.hiddenRows.has(r)) continue;
      for (let c = s.c1; c <= Math.min(s.c2, used.cols - 1); c++) values.push(this.evaluator.value(c, r));
    }
    this.stats = weSheetStats(values);
    this.cdr.markForCheck();
    if (scroll) {
      queueMicrotask(() => {
        // Only the sheet's own scroller moves — scrollIntoView would scroll the page around it too
        const box = this.scrollRef.nativeElement;
        const el = box.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(focus.col, focus.row)}"]`);
        if (!el) return;
        let headTop = box.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
        let headLeft = box.querySelector<HTMLElement>('.we-sheet__rowhead')?.offsetWidth ?? 0;
        // Frozen rows and columns cover the cells scrolled under them, too
        const stuckRows = Math.max(this.frozenRows, this.sheet.headerRow ? 1 : 0);
        if (focus.row >= stuckRows) {
          for (let r = 0; r < stuckRows; r++) {
            if (!this.hiddenRows.has(r)) headTop += box.querySelector<HTMLElement>(`[data-cell="${weSheetAddress(0, r)}"]`)?.offsetHeight ?? 28;
          }
        }
        if (focus.col >= this.frozenCols) for (let c = 0; c < this.frozenCols; c++) headLeft += this.width(c);
        const top = el.offsetTop - headTop;
        const bottom = el.offsetTop + el.offsetHeight;
        const left = el.offsetLeft - headLeft;
        const right = el.offsetLeft + el.offsetWidth;
        if (top < box.scrollTop) box.scrollTop = top;
        else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
        if (left < box.scrollLeft) box.scrollLeft = left;
        else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth;
      });
    }
  }
}
