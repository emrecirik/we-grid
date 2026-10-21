import { weGridSafeIcon } from '../services/we-grid-icon.util';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Inject, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { WeSheetComponent } from './we-sheet.component';
import { WeGridXlsxCellSheet } from '../services/we-grid-xlsx.util';
import { WE_GRID_FORMAT_COLORS, WeGridFormatColor } from '../models/we-grid-format.model';
import { weGridFormatFg, weGridNearestFormatColor } from '../services/we-grid-format.util';
import { WE_SHEET_STORE, WeSheetCell, WeSheetData, WeSheetStore } from './we-sheet.model';
import { weSheetEmpty, weSheetFromCells, weSheetMoveSheetReferences, weSheetNameRef, weSheetRenameReferences, weSheetRenameSheets, weSheetReplaceRange, weSheetSanitize } from './we-sheet.util';

/** A workbook: named sheets in order, like the tabs at the bottom of Excel */
export interface WeWorkbookData {
  version: 1;
  /** `color`: the tab's colour, from the format palette */
  sheets: { name: string; data: WeSheetData; color?: WeGridFormatColor }[];
  /** Index of the sheet shown */
  active: number;
}

const MAX_SHEETS = 50;

/** Rebuilds a workbook from untrusted input — a stored record or a file — or null when it isn't one */
export function weWorkbookSanitize(input: unknown): WeWorkbookData | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o['sheets'])) return null;
  const sheets: WeWorkbookData['sheets'] = [];
  for (const item of o['sheets'].slice(0, MAX_SHEETS)) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, data, color } = item as Record<string, unknown>;
    const clean = weSheetSanitize(data);
    if (typeof name === 'string' && clean) {
      sheets.push({
        name: name.trim().slice(0, 60) || `Sheet${sheets.length + 1}`,
        data: clean,
        ...(typeof color === 'string' && (WE_GRID_FORMAT_COLORS as readonly string[]).includes(color) ? { color: color as WeGridFormatColor } : {})
      });
    }
  }
  if (!sheets.length) return null;
  const active = typeof o['active'] === 'number' && Number.isInteger(o['active']) ? Math.max(0, Math.min(sheets.length - 1, o['active'])) : 0;
  return { version: 1, sheets, active };
}

/**
 * `<we-workbook>` — several `<we-sheet>`s behind tabs: add, rename (double-click), duplicate,
 * delete and reorder sheets, all saved together under one `workbookKey` through `WE_SHEET_STORE`.
 * Formulas refer to cells of their own sheet.
 */
@Component({
  selector: 'we-workbook',
  standalone: true,
  imports: [CommonModule, WeSheetComponent],
  templateUrl: './we-workbook.component.html',
  styleUrls: ['./we-workbook.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeWorkbookComponent implements OnInit, OnChanges, OnDestroy {
  /** Saves and restores the whole workbook under this key, as `book:<workbookKey>` in the store */
  @Input() workbookKey?: string;
  /** Where `workbookKey` saves — wins over the `WE_SHEET_STORE` token, so one screen can keep its workbook in a record of its own */
  @Input() store?: WeSheetStore;
  /** The content. Given at start, the stored workbook is not loaded at all (saving still goes on) */
  @Input() data?: WeWorkbookData | null;
  @Input() readonly = false;
  @Input() height: number | string = 420;
  /** Size of a new sheet */
  @Input() rows = 50;
  @Input() cols = 12;
  @Input() exportFileName = 'workbook';

  /** Every change, switching tabs included */
  @Output() dataChange = new EventEmitter<WeWorkbookData>();
  /** Changes worth saving: cells, sheets, names, colours — not switching tabs */
  @Output() contentChange = new EventEmitter<WeWorkbookData>();
  /** The store failed to load or save the workbook — the tab bar also shows a notice */
  @Output() storeError = new EventEmitter<{ action: 'load' | 'save'; error: unknown }>();

  @ViewChild(WeSheetComponent) private sheetRef?: WeSheetComponent;
  /** The store's failure, shown in the tab bar until the next save goes through */
  storeNotice: string | null = null;

  book: WeWorkbookData = { version: 1, sheets: [], active: 0 };
  /** Index of the tab being renamed */
  renaming: number | null = null;
  private readonly save$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    @Inject(WE_SHEET_STORE) private readonly defaultStore: WeSheetStore,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.save$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.flushSave());
    if (this.data) {
      this.load(this.data);
    } else {
      this.load(null);
      if (this.workbookKey) {
        (this.store ?? this.defaultStore)
          .load(`book:${this.workbookKey}`)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (stored) => {
              if (stored && !this.data) this.load(stored as unknown as WeWorkbookData);
            },
            error: (error: unknown) => this.storeFailed('load', error)
          });
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && !changes['data'].firstChange && this.data && this.data !== this.book) this.load(this.data);
  }

  ngOnDestroy(): void {
    // A change still waiting out the debounce is written now, not dropped with the component
    this.flushSave();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeSheet(): WeSheetData {
    return this.book.sheets[this.book.active].data;
  }

  /** What the active sheet's formulas can read of the others — a new function whenever the book changes */
  resolveSheet: (name: string) => WeSheetData | null = () => null;
  /** Every sheet, for the Excel export */
  readonly xlsxSheets = () => this.book.sheets;

  /**
   * The sheets of an opened Excel file, added after the workbook's own (as many as fit). A name
   * already taken gets a number, and the file's formulas that point at it follow.
   */
  readonly importSheets = (sheets: readonly (Pick<WeGridXlsxCellSheet, 'name' | 'cells'> & Partial<WeGridXlsxCellSheet>)[]): void => {
    if (this.readonly) return;
    const taken = new Set(this.book.sheets.map((s) => s.name.toLocaleLowerCase()));
    const added: WeWorkbookData['sheets'] = [];
    const renames = new Map<string, string>();
    for (const sheet of sheets.slice(0, MAX_SHEETS - this.book.sheets.length)) {
      const base = sheet.name.trim().slice(0, 60) || `${this.locale.workbookSheetName}${this.book.sheets.length + added.length + 1}`;
      let name = base;
      for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${base} ${n}`;
      taken.add(name.toLocaleLowerCase());
      if (name !== sheet.name) renames.set(sheet.name, name);
      const color = sheet.tabColor ? weGridNearestFormatColor(sheet.tabColor, 'fg') : null;
      added.push({ name, data: { ...weSheetFromCells(sheet.cells, '.', this.rows, this.cols, sheet.merges, sheet.formats, sheet).data, headerRow: true }, ...(color ? { color } : {}) });
    }
    if (!added.length) return;
    const fixed = added.map((s) => {
      if (!renames.size) return s;
      const cells: WeSheetData['cells'] = {};
      for (const [key, cell] of Object.entries(s.data.cells)) {
        const v = typeof cell.v === 'string' && cell.v.startsWith('=') ? weSheetRenameSheets(cell.v, renames) : cell.v;
        cells[key] = v === cell.v ? cell : { ...cell, v };
      }
      return { ...s, data: { ...s.data, cells } };
    });
    const all = [...this.book.sheets, ...fixed];
    this.update({ ...this.book, sheets: all, active: this.book.sheets.length });
  };

  private refreshResolver(): void {
    const byName = new Map(this.book.sheets.map((s) => [s.name.toLocaleLowerCase(), s.data] as const));
    this.resolveSheet = (name) => byName.get(name.toLocaleLowerCase()) ?? null;
    // Names are the workbook's: one sheet's name reads, from another, as that sheet's range
    const names = new Map<string, string>();
    for (const s of this.book.sheets) {
      for (const [n, target] of Object.entries(s.data.names ?? {})) if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), `${weSheetNameRef(s.name)}!${target}`);
    }
    this.resolveName = (name) => names.get(name.toLowerCase()) ?? null;
  }

  resolveName: (name: string) => string | null = () => null;

  /** The palette under the tab-colour button, while open */
  colorMenu = false;
  readonly tabColors = WE_GRID_FORMAT_COLORS;

  /** A press anywhere outside the palette closes it, as the sheet's own palettes close */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.colorMenu && !(event.target as Element | null)?.closest?.('.we-book__color-wrap')) {
      this.colorMenu = false;
      this.cdr.markForCheck();
    }
  }

  /** Esc closes the palette and the delete question wherever the focus is */
  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (!this.colorMenu && !this.confirmingDelete) return;
    this.colorMenu = false;
    this.confirmingDelete = false;
    this.cdr.markForCheck();
  }

  /** Colours the active sheet's tab, or takes its colour away */
  setTabColor(color: WeGridFormatColor | null): void {
    this.colorMenu = false;
    if (this.readonly) return;
    const sheets = this.book.sheets.map((s, i) => {
      if (i !== this.book.active) return s;
      const { color: _old, ...rest } = s;
      return color ? { ...rest, color } : rest;
    });
    this.update({ ...this.book, sheets });
  }

  tabColor(color: WeGridFormatColor | undefined): string | null {
    return color ? `inset 0 -3px 0 ${weGridFormatFg(color)}` : null;
  }

  fg(color: WeGridFormatColor): string {
    return weGridFormatFg(color);
  }

  icon(key: string): SafeHtml {
    return weGridSafeIcon(this.sanitizer, this.icons, key);
  }

  getData(): WeWorkbookData {
    return this.book;
  }

  activate(index: number): void {
    if (index === this.book.active || index < 0 || index >= this.book.sheets.length) return;
    this.renaming = null;
    this.confirmingDelete = false;
    this.update({ ...this.book, active: index }, false);
  }

  addSheet(): void {
    if (this.readonly || this.book.sheets.length >= MAX_SHEETS) return;
    const sheets = [...this.book.sheets, { name: this.freeName(`${this.locale.workbookSheetName}${this.book.sheets.length + 1}`), data: weSheetEmpty(this.rows, this.cols) }];
    this.update({ ...this.book, sheets, active: sheets.length - 1 });
  }

  duplicateSheet(index = this.book.active): void {
    if (this.readonly || this.book.sheets.length >= MAX_SHEETS) return;
    const source = this.book.sheets[index];
    // As Excel names a copy: "Budget (2)", "Budget (3)" …
    const taken = new Set(this.book.sheets.map((s) => s.name.toLocaleLowerCase()));
    const stem = source.name.replace(/ \(\d+\)$/, '').slice(0, 54);
    let n = 2;
    while (taken.has(`${stem} (${n})`.toLocaleLowerCase())) n++;
    const copy = { name: `${stem} (${n})`, data: JSON.parse(JSON.stringify(source.data)) as WeSheetData, ...(source.color ? { color: source.color } : {}) };
    const sheets = [...this.book.sheets.slice(0, index + 1), copy, ...this.book.sheets.slice(index + 1)];
    this.update({ ...this.book, sheets, active: index + 1 });
  }

  /** The delete button was pressed on a sheet with content — the tab bar asks before deleting it */
  confirmingDelete = false;

  /** The tab bar's delete button: an empty sheet goes at once, one with content after a confirmation */
  requestDelete(): void {
    if (!Object.keys(this.activeSheet.cells).length) return this.deleteSheet();
    this.confirmingDelete = true;
    // The pressed button is gone — keyboard focus moves to the safe answer
    this.cdr.detectChanges();
    this.host.nativeElement.querySelector<HTMLElement>('.we-book__confirm-no')?.focus();
  }

  deleteSheet(index = this.book.active): void {
    this.confirmingDelete = false;
    if (this.readonly || this.book.sheets.length <= 1) return;
    const sheets = this.book.sheets.filter((_, i) => i !== index);
    this.update({ ...this.book, sheets, active: Math.min(this.book.active >= index ? Math.max(0, this.book.active - 1) : this.book.active, sheets.length - 1) });
  }

  /** Moves a sheet one place left (-1) or right (+1) */
  moveSheet(index: number, delta: -1 | 1): void {
    const to = index + delta;
    if (this.readonly || to < 0 || to >= this.book.sheets.length) return;
    const sheets = [...this.book.sheets];
    [sheets[index], sheets[to]] = [sheets[to], sheets[index]];
    this.update({ ...this.book, sheets, active: this.book.active === index ? to : this.book.active === to ? index : this.book.active });
  }

  startRename(index: number): void {
    if (this.readonly) return;
    this.renaming = index;
    // Rendered now: with event coalescing a microtask would run before the input exists
    this.cdr.detectChanges();
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('.we-book__rename');
    input?.focus();
    input?.select();
  }

  finishRename(index: number, name: string): void {
    if (this.renaming !== index) return;
    this.renaming = null;
    const clean = name.trim().slice(0, 60);
    if (!clean || clean === this.book.sheets[index].name) {
      this.cdr.markForCheck();
      return;
    }
    const oldName = this.book.sheets[index].name;
    const newName = this.freeName(clean, index);
    // Formulas that pointed at the sheet follow it to its new name, as in Excel
    const sheets = this.rewriteFormulas((f) => weSheetRenameReferences(f, oldName, newName)).map((s, i) => (i === index ? { ...s, name: newName } : s));
    this.update({ ...this.book, sheets });
  }

  /** Rows or columns of the active sheet moved — the other sheets' references to it follow */
  onStructureChange(index: number, change: { axis: 'row' | 'col'; at: number; count: number }): void {
    const name = this.book.sheets[index].name;
    const sheets = this.rewriteFormulas((f) => weSheetMoveSheetReferences(f, name, change.axis, change.at, change.count), index);
    if (sheets.some((s, i) => s !== this.book.sheets[i])) this.update({ ...this.book, sheets });
  }

  /** Every sheet with `map` run over its formulas (but the sheet `except`); unchanged sheets stay the same objects */
  private rewriteFormulas(map: (formula: string) => string, except = -1): WeWorkbookData['sheets'] {
    return this.book.sheets.map((s, i) => {
      if (i === except) return s;
      const cells: WeSheetData['cells'] = {};
      let changed = false;
      for (const [key, cell] of Object.entries(s.data.cells)) {
        const v = typeof cell.v === 'string' && cell.v.startsWith('=') ? map(cell.v) : cell.v;
        if (v !== cell.v) changed = true;
        cells[key] = v === cell.v ? cell : { ...cell, v };
      }
      return changed ? { ...s, data: { ...s.data, cells } } : s;
    });
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next = index + (event.key === 'ArrowRight' ? 1 : -1);
      if (event.altKey || event.ctrlKey) this.moveSheet(index, event.key === 'ArrowRight' ? 1 : -1);
      else this.activate(next);
      event.preventDefault();
      const tab = event.currentTarget as HTMLElement | null;
      queueMicrotask(() => tab?.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[this.book.active]?.focus());
    } else if (event.key === 'F2') {
      this.startRename(index);
      event.preventDefault();
    }
  }

  onRenameKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') this.finishRename(index, (event.target as HTMLInputElement).value);
    else if (event.key === 'Escape') {
      this.renaming = null;
      this.cdr.markForCheck();
    }
  }

  /** A sheet changed its content — kept in the workbook without reloading that sheet */
  onSheetChange(index: number, data: WeSheetData): void {
    if (this.book.sheets[index]?.data === data) return;
    const sheets = this.book.sheets.map((s, i) => (i === index ? { ...s, data } : s));
    this.book = { ...this.book, sheets };
    this.refreshResolver();
    this.dataChange.emit(this.book);
    this.contentChange.emit(this.book);
    this.savePending = true;
    this.save$.next();
  }

  private load(input: WeWorkbookData | null): void {
    this.book = (input && weWorkbookSanitize(input)) || {
      version: 1,
      sheets: [{ name: `${this.locale.workbookSheetName}1`, data: weSheetEmpty(this.rows, this.cols) }],
      active: 0
    };
    this.refreshResolver();
    this.cdr.markForCheck();
  }

  private update(book: WeWorkbookData, content = true): void {
    this.book = book;
    this.refreshResolver();
    this.dataChange.emit(book);
    if (content) this.contentChange.emit(book);
    this.savePending = true;
    this.save$.next();
    this.cdr.markForCheck();
  }

  private savePending = false;

  /** Writes the workbook if a change waits — not tied to destroy$, so a request in flight isn't cancelled */
  private flushSave(): void {
    if (!this.savePending || !this.workbookKey) return;
    this.savePending = false;
    // The sheet store carries any JSON object under a key — a workbook rides it unchanged
    (this.store ?? this.defaultStore).save(`book:${this.workbookKey}`, this.book as unknown as WeSheetData).subscribe({
      next: () => {
        if (!this.storeNotice) return;
        this.storeNotice = null;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => this.storeFailed('save', error)
    });
  }

  private storeFailed(action: 'load' | 'save', error: unknown): void {
    this.storeNotice = action === 'save' ? this.locale.sheetSaveFailed : this.locale.sheetLoadFailed;
    this.cdr.markForCheck();
    this.storeError.emit({ action, error });
  }

  /**
   * Refreshes a block the app wrote earlier on `sheetName` with new `values`, keeping what the user
   * added — cells around it, formats, other sheets, names (see `weSheetReplaceRange`). Rows inserted
   * or deleted to fit move the references of every sheet. One undoable step when the sheet is open.
   * Returns the new block's range — pass it next time — or null for an unknown sheet or a bad range.
   */
  replaceRange(sheetName: string, range: string, values: readonly (readonly WeSheetCell['v'][])[]): string | null {
    const index = this.book.sheets.findIndex((s) => s.name.toLocaleLowerCase() === sheetName.toLocaleLowerCase());
    if (index < 0) return null;
    // The open sheet does it itself, for its undo history; its structureChange moves the others' references
    if (index === this.book.active && this.sheetRef) return this.sheetRef.replaceRange(range, values);
    const result = weSheetReplaceRange(this.book.sheets[index].data, range, values);
    const clean = result && weSheetSanitize(result.data);
    if (!result || !clean) return null;
    const { change } = result;
    const name = this.book.sheets[index].name;
    const moved = change ? this.rewriteFormulas((f) => weSheetMoveSheetReferences(f, name, change.axis, change.at, change.count), index) : this.book.sheets;
    this.update({ ...this.book, sheets: moved.map((s, i) => (i === index ? { ...s, data: clean } : s)) });
    return result.range;
  }

  /** `base`, or `base2`, `base3` … — names stay unique, case-insensitively */
  private freeName(base: string, except = -1): string {
    const taken = new Set(this.book.sheets.filter((_, i) => i !== except).map((s) => s.name.toLocaleLowerCase()));
    const stem = base.replace(/\s*\d+$/, '') || base;
    if (!taken.has(base.toLocaleLowerCase())) return base;
    let n = 2;
    while (taken.has(`${stem}${n}`.toLocaleLowerCase())) n++;
    return `${stem}${n}`;
  }
}
