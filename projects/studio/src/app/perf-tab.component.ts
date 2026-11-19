import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import type { GridApi } from 'ag-grid-community';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { WE_GRID_LAYOUT_STORE, WeGridColumnDef, WeGridColumnStore, WeGridComponent, WeGridDataSource, WeGridLayoutStore, WeGridWorkerStore } from 'we-grid-angular';
import { StudioText } from './studio-text';

interface PerfRow {
  id: number;
  customer: string;
  city: string;
  category: string;
  qty: number;
  price: number;
  total: number;
  date: string;
}

type Mode = 'rows' | 'engine' | 'aggrid';

interface PerfResult {
  rows: number;
  mode: Mode;
  virtual: boolean;
  generateMs: number;
  renderMs: number;
  domRows: number;
  dataMb: number | null;
  /** The longest the page went without painting a frame, per step — what the user feels as a freeze */
  renderFreezeMs: number;
  sortFreezeMs: number | null;
  filterFreezeMs: number | null;
  searchFreezeMs: number | null;
  worker: boolean;
  heapMb: number | null;
  sortMs: number | null;
  filterMs: number | null;
  searchMs: number | null;
  fps: number | null;
}

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Trabzon', 'Eskişehir', 'Kayseri'];
const CATEGORIES = ['Electronics', 'Books', 'Garden', 'Toys', 'Food', 'Clothing', 'Sports', 'Beauty'];
const FIRST_NAMES = ['Ada', 'Deniz', 'Ekin', 'Kaan', 'Lale', 'Mert', 'Nehir', 'Ozan', 'Pelin', 'Rüzgar', 'Selin', 'Toprak', 'Umut', 'Yağmur'];
const CUSTOMERS = FIRST_NAMES.flatMap((name) => Array.from({ length: 26 }, (_, c) => `${name} ${String.fromCharCode(65 + c)}.`));
const DAYS = Array.from({ length: 730 }, (_, d) => new Date(Date.UTC(2024, 0, 1) + d * 86_400_000).toISOString().slice(0, 10));

/** Seeded PRNG, so every run measures the same fictional data */
function prng(): () => number {
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function generateRows(count: number): PerfRow[] {
  const next = prng();
  const rows: PerfRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const qty = 1 + Math.floor(next() * 50);
    const cents = Math.floor(next() * 100_000);
    rows[i] = {
      id: i + 1,
      customer: CUSTOMERS[Math.floor(next() * CUSTOMERS.length)],
      city: CITIES[Math.floor(next() * CITIES.length)],
      category: CATEGORIES[Math.floor(next() * CATEGORIES.length)],
      qty,
      price: cents / 100,
      total: (qty * cents) / 100,
      date: DAYS[Math.floor(next() * DAYS.length)]
    };
  }
  return rows;
}

/** The same data straight into columns — never a row object, so tens of millions fit */
function generateColumns(count: number): Parameters<typeof WeGridColumnStore.fromColumns>[0] {
  const next = prng();
  const id = new Int32Array(count);
  const customer = new Uint16Array(count);
  const city = new Uint8Array(count);
  const category = new Uint8Array(count);
  const qty = new Uint8Array(count);
  const price = new Int32Array(count);
  const total = new Int32Array(count);
  const date = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const q = 1 + Math.floor(next() * 50);
    const cents = Math.floor(next() * 100_000);
    id[i] = i + 1;
    customer[i] = Math.floor(next() * CUSTOMERS.length);
    city[i] = Math.floor(next() * CITIES.length);
    category[i] = Math.floor(next() * CATEGORIES.length);
    qty[i] = q;
    price[i] = cents;
    total[i] = q * cents;
    date[i] = Math.floor(next() * DAYS.length);
  }
  return {
    id,
    customer: { dictionary: CUSTOMERS, codes: customer },
    city: { dictionary: CITIES, codes: city },
    category: { dictionary: CATEGORIES, codes: category },
    qty,
    price: { fixed: price, scale: 100 },
    total: { fixed: total, scale: 100 },
    date: { dictionary: DAYS, codes: date }
  };
}

/** Times an async step and the longest gap between painted frames while it ran */
function frameWatch(): () => { ms: number; freezeMs: number } {
  const start = performance.now();
  let last = start;
  let freeze = 0;
  let on = true;
  const tick = (): void => {
    const now = performance.now();
    freeze = Math.max(freeze, now - last);
    last = now;
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    on = false;
    const now = performance.now();
    return { ms: now - start, freezeMs: Math.max(freeze, now - last) };
  };
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => resolve(performance.now()))));

/**
 * Measures the grid in the visitor's own browser: how long a data set takes to appear, sort, filter,
 * search and scroll, and how much memory it holds — as row objects or in the column engine.
 */
@Component({
  selector: 'studio-perf-tab',
  standalone: true,
  imports: [FormsModule, WeGridComponent],
  templateUrl: './perf-tab.component.html',
  styleUrl: './app.component.scss',
  // Every run starts from the same grid: no sort or width carried over from the run before
  providers: [{ provide: WE_GRID_LAYOUT_STORE, useValue: { load: () => of(null), save: () => of(undefined), reset: () => of(undefined) } satisfies WeGridLayoutStore }]
})
export class PerfTabComponent implements OnDestroy {
  @Input({ required: true }) text!: StudioText;
  @ViewChild('gridHost', { read: ElementRef }) gridHost?: ElementRef<HTMLElement>;
  @ViewChild('agHost', { read: ElementRef }) agHost?: ElementRef<HTMLElement>;
  /** AG Grid Community, loaded only when its mode is picked — the comparison, not part of we-grid */
  private agApi: GridApi<PerfRow> | null = null;
  private agSearch = '';
  @ViewChild(WeGridComponent) grid?: WeGridComponent<PerfRow>;

  readonly sizesByMode: Record<Mode, number[]> = {
    rows: [10_000, 100_000, 1_000_000, 2_000_000],
    engine: [1_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000],
    aggrid: [10_000, 100_000, 1_000_000, 2_000_000]
  };
  mode: Mode = 'engine';
  size = 10_000_000;
  virtual = true;
  data: PerfRow[] = [];
  store: WeGridDataSource<PerfRow> | null = null;
  /** Engine mode: run the store in a Web Worker */
  useWorker = true;
  private worker: Worker | null = null;
  busy = false;
  results: PerfResult[] = [];
  /** A new number per run re-creates the grid, so no sort, filter or search survives into the next */
  runId = 0;
  readonly columns: WeGridColumnDef<PerfRow>[] = [
    { field: 'id', header: '#', type: 'integer', width: 120 },
    { field: 'customer', header: 'Customer', width: 150 },
    { field: 'city', header: 'City', width: 130, headerFilterMode: 'checklist' },
    { field: 'category', header: 'Category', width: 140, headerFilterMode: 'checklist' },
    { field: 'qty', header: 'Qty', type: 'integer', width: 90 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 },
    { field: 'total', header: 'Total', type: 'currency', width: 130 },
    { field: 'date', header: 'Date', type: 'date', width: 120 }
  ];

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get sizes(): number[] {
    return this.sizesByMode[this.mode];
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    if (!this.sizes.includes(this.size)) this.size = mode === 'engine' ? 10_000_000 : 1_000_000;
  }

  ngOnDestroy(): void {
    this.agApi?.destroy();
    this.worker?.terminate();
  }

  private async ensureAgGrid(): Promise<typeof import('ag-grid-community')> {
    const ag = await import('ag-grid-community');
    ag.ModuleRegistry.registerModules([ag.AllCommunityModule]);
    return ag;
  }

  /** AG Grid with the same columns and display formats — its defaults otherwise */
  private createAgGrid(ag: typeof import('ag-grid-community'), rows: PerfRow[]): void {
    this.agApi?.destroy();
    const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TRY' });
    const money = (p: { value: unknown }): string => (typeof p.value === 'number' ? currency.format(p.value) : '');
    this.agApi = ag.createGrid<PerfRow>(this.agHost!.nativeElement, {
      rowData: rows,
      columnDefs: [
        { field: 'id', headerName: '#', width: 120 },
        { field: 'customer', headerName: 'Customer', width: 150 },
        { field: 'city', headerName: 'City', width: 130, filter: 'agTextColumnFilter' },
        { field: 'category', headerName: 'Category', width: 140 },
        { field: 'qty', headerName: 'Qty', width: 90 },
        { field: 'price', headerName: 'Price', width: 120, valueFormatter: money },
        { field: 'total', headerName: 'Total', width: 130, valueFormatter: money },
        { field: 'date', headerName: 'Date', width: 120 }
      ]
    });
  }

  /** Rendering every row of a big set without virtual scrolling freezes the tab — the point of the demo, but capped */
  get tooBigForPlain(): boolean {
    return this.mode === 'rows' && !this.virtual && this.size > 10_000;
  }

  async run(): Promise<void> {
    if (this.busy || this.tooBigForPlain) return;
    this.busy = true;
    this.data = [];
    this.store = null;
    this.runId++;
    this.worker?.terminate();
    this.worker = null;
    this.cdr.detectChanges();
    await nextFrame();

    this.agApi?.destroy();
    this.agApi = null;
    const ag = this.mode === 'aggrid' ? await this.ensureAgGrid() : null;
    const worker = this.mode === 'engine' && this.useWorker;

    const t0 = performance.now();
    const rows = this.mode !== 'engine' ? generateRows(this.size) : null;
    const columns = this.mode === 'engine' ? generateColumns(this.size) : null;
    const generateMs = performance.now() - t0;

    const t1 = performance.now();
    const done = frameWatch();
    let store: WeGridDataSource<PerfRow> | null = null;
    let dataBytes: number | null = null;
    if (columns && worker) {
      this.worker = new Worker(new URL('./perf.worker', import.meta.url), { type: 'module' });
      const remote = await WeGridWorkerStore.fromColumns<PerfRow>(this.worker, columns);
      dataBytes = (await remote.describe()).reduce((sum, c) => sum + c.bytes, 0);
      store = remote;
    } else if (columns) {
      const local = WeGridColumnStore.fromColumns<PerfRow>(columns);
      dataBytes = local.describe().reduce((sum, c) => sum + c.bytes, 0);
      store = local;
    }
    if (ag && rows) this.createAgGrid(ag, rows);
    else if (rows) this.data = rows;
    this.store = store;
    this.cdr.detectChanges();
    await nextFrame();
    // The rows are on screen once AG Grid has drawn them, or the grid's placeholders are gone
    for (let frame = 0; frame < 3600 && !this.rowsShown(); frame++) await nextFrame();
    const { ms: renderMs, freezeMs } = done();

    const result: PerfResult = {
      rows: this.size,
      mode: this.mode,
      virtual: this.mode === 'engine' || this.virtual,
      generateMs,
      renderMs,
      domRows: ag
        ? (this.agHost?.nativeElement.querySelectorAll('.ag-row').length ?? 0)
        : (this.gridHost?.nativeElement.querySelectorAll('tbody > tr').length ?? 0),
      dataMb: dataBytes === null ? null : dataBytes / 1_048_576,
      renderFreezeMs: freezeMs,
      sortFreezeMs: null,
      filterFreezeMs: null,
      searchFreezeMs: null,
      worker,
      heapMb: this.heapMb(),
      sortMs: null,
      filterMs: null,
      searchMs: null,
      fps: null
    };
    this.results = [result, ...this.results].slice(0, 10);
    this.busy = false;
    this.cdr.detectChanges();
  }

  /** Clicks the Total header like a user would, and times until the sorted rows are painted */
  sort(): Promise<void> {
    return this.measure('sortMs', true, () => {
      if (this.agApi) {
        const sort = this.agApi.getColumnState().find((c) => c.colId === 'total')?.sort;
        this.agApi.applyColumnState({ state: [{ colId: 'total', sort: sort === 'asc' ? 'desc' : 'asc' }], defaultState: { sort: null } });
        return;
      }
      const label = Array.from(this.gridHost?.nativeElement.querySelectorAll<HTMLElement>('.we-grid__th-label') ?? []).find((el) => el.textContent?.trim() === 'Total');
      label?.click();
    });
  }

  /** City = Ankara through the checklist filter, or back to all cities — only switching it on is timed */
  filter(): Promise<void> {
    return this.measure('filterMs', !this.filterActive, () => {
      if (this.agApi) {
        const on = !!this.agApi.getFilterModel()['city'];
        this.agApi.setFilterModel(on ? null : { city: { filterType: 'text', type: 'equals', filter: 'Ankara' } });
        return;
      }
      const grid = this.grid;
      const city = grid?.internalColumns.find((c) => c.field === 'city');
      if (!grid || !city) return;
      if (grid.hasActiveFilters) grid.clearAllFilters();
      else grid.setChecklistFilter(city, ['Ankara']);
    });
  }

  /** Two words that must both appear — a customer name and a city; only starting the search is timed */
  search(): Promise<void> {
    return this.measure('searchMs', !this.searchActive, () => {
      if (this.agApi) {
        // AG Grid's quick filter: every word must match some column, like the grid's search box
        this.agSearch = this.agSearch ? '' : 'selin izmir';
        this.agApi.setGridOption('quickFilterText', this.agSearch);
        return;
      }
      const grid = this.grid;
      if (!grid) return;
      grid.setSearch(grid.searchText ? '' : 'selin izmir');
    });
  }

  /** Scrolls top to bottom for two seconds and counts the frames the browser managed to paint */
  async scrollTest(): Promise<void> {
    const area = this.agApi
      ? this.agHost?.nativeElement.querySelector<HTMLElement>('.ag-grid-viewport')
      : this.gridHost?.nativeElement.querySelector<HTMLElement>('.we-grid__scroll');
    if (this.busy || !area || !this.hasData) return;
    this.busy = true;
    area.scrollTop = 0;
    const duration = 2000;
    const fps = await new Promise<number>((resolve) => {
      let frames = 0;
      const start = performance.now();
      const step = (now: number): void => {
        frames++;
        const t = Math.min(1, (now - start) / duration);
        area.scrollTop = t * (area.scrollHeight - area.clientHeight);
        if (t < 1) requestAnimationFrame(step);
        else resolve((frames * 1000) / (now - start));
      };
      requestAnimationFrame(step);
    });
    this.patchResult({ fps });
    this.busy = false;
    this.cdr.detectChanges();
  }

  get hasData(): boolean {
    return this.data.length > 0 || !!this.store || !!this.agApi;
  }

  /** What the footer of either grid says — the visible row count after filters and search */
  get agCount(): number {
    return this.agApi?.getDisplayedRowCount() ?? 0;
  }

  format(value: number | null, digits = 0): string {
    return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  get filterActive(): boolean {
    return this.agApi ? !!this.agApi.getFilterModel()['city'] : !!this.grid?.hasActiveFilters;
  }

  get searchActive(): boolean {
    return this.agApi ? !!this.agSearch : !!this.grid?.searchText;
  }

  /** "532 ms · 26 ms": how long the step took, and the longest the page froze meanwhile */
  timing(ms: number | null, freezeMs: number | null): string {
    return ms === null ? '—' : `${this.format(ms)} ms · ${this.format(freezeMs)} ms`;
  }

  private async measure(key: 'sortMs' | 'filterMs' | 'searchMs', record: boolean, action: () => void): Promise<void> {
    if (this.busy || !this.hasData) return;
    this.busy = true;
    const done = frameWatch();
    action();
    this.cdr.detectChanges();
    await nextFrame();
    for (let frame = 0; frame < 3600 && !this.rowsShown(); frame++) await nextFrame();
    const { ms, freezeMs } = done();
    if (record) this.patchResult({ [key]: ms, [key.replace('Ms', 'FreezeMs')]: freezeMs });
    this.busy = false;
    this.cdr.detectChanges();
  }

  /** Whether the result is on screen — no placeholder rows waiting for the worker, AG Grid's rows drawn */
  private rowsShown(): boolean {
    if (this.agApi) return !!this.agHost?.nativeElement.querySelector('.ag-row') || this.agApi.getDisplayedRowCount() === 0;
    return !this.gridHost?.nativeElement.querySelector('tbody > tr.we-grid__skeleton-row');
  }

  private patchResult(patch: Partial<PerfResult>): void {
    if (this.results[0]) this.results[0] = { ...this.results[0], ...patch };
  }

  /** Chromium only — other browsers don't expose the heap size */
  private heapMb(): number | null {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1_048_576 : null;
  }
}
