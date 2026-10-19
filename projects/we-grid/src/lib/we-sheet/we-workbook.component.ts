import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Inject, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { WeSheetComponent } from './we-sheet.component';
import { WE_SHEET_STORE, WeSheetData, WeSheetStore } from './we-sheet.model';
import { weSheetEmpty, weSheetRenameReferences, weSheetSanitize } from './we-sheet.util';

/** A workbook: named sheets in order, like the tabs at the bottom of Excel */
export interface WeWorkbookData {
  version: 1;
  sheets: { name: string; data: WeSheetData }[];
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
    const { name, data } = item as Record<string, unknown>;
    const clean = weSheetSanitize(data);
    if (typeof name === 'string' && clean) sheets.push({ name: name.trim().slice(0, 60) || `Sheet${sheets.length + 1}`, data: clean });
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
  /** Saves and restores the whole workbook under this key */
  @Input() workbookKey?: string;
  /** The content — wins over a stored workbook */
  @Input() data?: WeWorkbookData | null;
  @Input() readonly = false;
  @Input() height: number | string = 420;
  /** Size of a new sheet */
  @Input() rows = 50;
  @Input() cols = 12;
  @Input() exportFileName = 'workbook';

  @Output() dataChange = new EventEmitter<WeWorkbookData>();

  book: WeWorkbookData = { version: 1, sheets: [], active: 0 };
  /** Index of the tab being renamed */
  renaming: number | null = null;
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
      // The sheet store carries any JSON object under a key — a workbook rides it unchanged
      if (this.workbookKey) this.store.save(`book:${this.workbookKey}`, this.book as unknown as WeSheetData).pipe(takeUntil(this.destroy$)).subscribe();
    });
    if (this.data) {
      this.load(this.data);
    } else {
      this.load(null);
      if (this.workbookKey) {
        this.store
          .load(`book:${this.workbookKey}`)
          .pipe(takeUntil(this.destroy$))
          .subscribe((stored) => {
            if (stored && !this.data) this.load(stored as unknown as WeWorkbookData);
          });
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && !changes['data'].firstChange && this.data && this.data !== this.book) this.load(this.data);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeSheet(): WeSheetData {
    return this.book.sheets[this.book.active].data;
  }

  /** What the active sheet's formulas can read of the others — a new function whenever the book changes */
  resolveSheet: (name: string) => WeSheetData | null = () => null;

  private refreshResolver(): void {
    const byName = new Map(this.book.sheets.map((s) => [s.name.toLocaleLowerCase(), s.data] as const));
    this.resolveSheet = (name) => byName.get(name.toLocaleLowerCase()) ?? null;
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  getData(): WeWorkbookData {
    return this.book;
  }

  activate(index: number): void {
    if (index === this.book.active || index < 0 || index >= this.book.sheets.length) return;
    this.renaming = null;
    this.update({ ...this.book, active: index });
  }

  addSheet(): void {
    if (this.readonly || this.book.sheets.length >= MAX_SHEETS) return;
    const sheets = [...this.book.sheets, { name: this.freeName(`${this.locale.workbookSheetName}${this.book.sheets.length + 1}`), data: weSheetEmpty(this.rows, this.cols) }];
    this.update({ ...this.book, sheets, active: sheets.length - 1 });
  }

  duplicateSheet(index = this.book.active): void {
    if (this.readonly || this.book.sheets.length >= MAX_SHEETS) return;
    const source = this.book.sheets[index];
    const copy = { name: this.freeName(source.name), data: JSON.parse(JSON.stringify(source.data)) as WeSheetData };
    const sheets = [...this.book.sheets.slice(0, index + 1), copy, ...this.book.sheets.slice(index + 1)];
    this.update({ ...this.book, sheets, active: index + 1 });
  }

  deleteSheet(index = this.book.active): void {
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
    this.cdr.markForCheck();
    queueMicrotask(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>('.we-book__rename');
      input?.focus();
      input?.select();
    });
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
    const sheets = this.book.sheets.map((s, i) => {
      const cells: WeSheetData['cells'] = {};
      let changed = false;
      for (const [key, cell] of Object.entries(s.data.cells)) {
        const v = typeof cell.v === 'string' && cell.v.startsWith('=') ? weSheetRenameReferences(cell.v, oldName, newName) : cell.v;
        if (v !== cell.v) changed = true;
        cells[key] = v === cell.v ? cell : { ...cell, v };
      }
      const data = changed ? { ...s.data, cells } : s.data;
      return i === index ? { name: newName, data } : changed ? { ...s, data } : s;
    });
    this.update({ ...this.book, sheets });
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next = index + (event.key === 'ArrowRight' ? 1 : -1);
      if (event.altKey || event.ctrlKey) this.moveSheet(index, event.key === 'ArrowRight' ? 1 : -1);
      else this.activate(next);
      event.preventDefault();
      queueMicrotask(() => (event.currentTarget as HTMLElement | null)?.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[this.book.active]?.focus());
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

  private update(book: WeWorkbookData): void {
    this.book = book;
    this.refreshResolver();
    this.dataChange.emit(book);
    this.save$.next();
    this.cdr.markForCheck();
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
