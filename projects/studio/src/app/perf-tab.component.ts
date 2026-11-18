import { ChangeDetectorRef, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeGridColumnDef, WeGridComponent } from 'we-grid-angular';
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

interface PerfResult {
  rows: number;
  virtual: boolean;
  generateMs: number;
  renderMs: number;
  domRows: number;
  heapMb: number | null;
  sortMs: number | null;
  fps: number | null;
}

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Trabzon', 'Eskişehir', 'Kayseri'];
const CATEGORIES = ['Electronics', 'Books', 'Garden', 'Toys', 'Food', 'Clothing', 'Sports', 'Beauty'];
const NAMES = ['Ada', 'Deniz', 'Ekin', 'Kaan', 'Lale', 'Mert', 'Nehir', 'Ozan', 'Pelin', 'Rüzgar', 'Selin', 'Toprak', 'Umut', 'Yağmur'];

/** Fictional rows from a seeded PRNG, so every run measures the same data */
function generateRows(count: number): PerfRow[] {
  let seed = 42;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rows: PerfRow[] = new Array(count);
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < count; i++) {
    const qty = 1 + Math.floor(next() * 50);
    const price = Math.round(next() * 100_000) / 100;
    rows[i] = {
      id: i + 1,
      customer: `${NAMES[Math.floor(next() * NAMES.length)]} ${String.fromCharCode(65 + Math.floor(next() * 26))}.`,
      city: CITIES[Math.floor(next() * CITIES.length)],
      category: CATEGORIES[Math.floor(next() * CATEGORIES.length)],
      qty,
      price,
      total: Math.round(qty * price * 100) / 100,
      date: new Date(start + Math.floor(next() * 730) * 86_400_000).toISOString().slice(0, 10)
    };
  }
  return rows;
}

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => resolve(performance.now()))));

/**
 * Measures the grid in the visitor's own browser: how long a data set takes to appear, sort and
 * scroll, and how much memory it holds — with and without virtual scrolling.
 */
@Component({
  selector: 'studio-perf-tab',
  standalone: true,
  imports: [FormsModule, WeGridComponent],
  templateUrl: './perf-tab.component.html',
  styleUrl: './app.component.scss'
})
export class PerfTabComponent {
  @Input({ required: true }) text!: StudioText;
  @ViewChild('gridHost', { read: ElementRef }) gridHost?: ElementRef<HTMLElement>;

  readonly sizes = [10_000, 100_000, 1_000_000, 2_000_000];
  size = 1_000_000;
  virtual = true;
  data: PerfRow[] = [];
  busy = false;
  results: PerfResult[] = [];
  readonly columns: WeGridColumnDef<PerfRow>[] = [
    { field: 'id', header: '#', type: 'integer', width: 110 },
    { field: 'customer', header: 'Customer', width: 150 },
    { field: 'city', header: 'City', width: 130 },
    { field: 'category', header: 'Category', width: 140 },
    { field: 'qty', header: 'Qty', type: 'integer', width: 90 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 },
    { field: 'total', header: 'Total', type: 'currency', width: 130 },
    { field: 'date', header: 'Date', type: 'date', width: 120 }
  ];

  constructor(private readonly cdr: ChangeDetectorRef) {}

  /** Rendering every row of a big set without virtual scrolling freezes the tab — the point of the demo, but capped */
  get tooBigForPlain(): boolean {
    return !this.virtual && this.size > 10_000;
  }

  async run(): Promise<void> {
    if (this.busy || this.tooBigForPlain) return;
    this.busy = true;
    this.data = [];
    this.cdr.detectChanges();
    await nextFrame();

    const t0 = performance.now();
    const rows = generateRows(this.size);
    const generateMs = performance.now() - t0;

    const t1 = performance.now();
    this.data = rows;
    this.cdr.detectChanges();
    const renderMs = (await nextFrame()) - t1;

    const result: PerfResult = {
      rows: this.size,
      virtual: this.virtual,
      generateMs,
      renderMs,
      domRows: this.gridHost?.nativeElement.querySelectorAll('tbody > tr').length ?? 0,
      heapMb: this.heapMb(),
      sortMs: null,
      fps: null
    };
    this.results = [result, ...this.results].slice(0, 8);
    this.busy = false;
    this.cdr.detectChanges();
  }

  /** Clicks the Total header like a user would, and times until the sorted rows are painted */
  async sort(): Promise<void> {
    const label = Array.from(this.gridHost?.nativeElement.querySelectorAll<HTMLElement>('.we-grid__th-label') ?? []).find((el) => el.textContent?.trim() === 'Total');
    if (this.busy || !label || this.data.length === 0) return;
    this.busy = true;
    const t0 = performance.now();
    label.click();
    const ms = (await nextFrame()) - t0;
    if (this.results[0]) this.results[0] = { ...this.results[0], sortMs: ms };
    this.busy = false;
    this.cdr.detectChanges();
  }

  /** Scrolls top to bottom for two seconds and counts the frames the browser managed to paint */
  async scrollTest(): Promise<void> {
    const area = this.gridHost?.nativeElement.querySelector<HTMLElement>('.we-grid__scroll');
    if (this.busy || !area || this.data.length === 0) return;
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
    if (this.results[0]) this.results[0] = { ...this.results[0], fps };
    this.busy = false;
    this.cdr.detectChanges();
  }

  format(value: number | null, digits = 0): string {
    return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  /** Chromium only — other browsers don't expose the heap size */
  private heapMb(): number | null {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1_048_576 : null;
  }
}
