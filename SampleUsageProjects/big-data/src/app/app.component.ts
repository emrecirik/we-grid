import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  WeGridColumnDef,
  WeGridComponent,
  WeGridDataSource,
  WeGridProtocolClient,
  WeGridProtocolDataSource,
  WePivotComponent,
  WePivotConfig
} from 'we-grid-angular';
import { WeGridWorkerStore } from 'we-grid-angular/engine';

import { generateSales, Sale } from './sales-data';

type Where = 'browser' | 'database';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, WeGridComponent, WePivotComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  readonly sizes = [1_000_000, 10_000_000, 50_000_000];
  where: Where = 'browser';
  size = 10_000_000;
  backendUrl = 'http://127.0.0.1:5480';
  connection = 'big';

  /** What the grid and the pivot read: the rows stay in the worker or in the database */
  source: WeGridDataSource<Sale> | null = null;
  busy = false;
  status = '';
  private worker: Worker | null = null;

  readonly columns: WeGridColumnDef<Sale>[] = [
    { field: 'id', header: '#', type: 'integer', width: 130 },
    { field: 'customer', header: 'Customer', width: 150 },
    { field: 'city', header: 'City', width: 130, headerFilterMode: 'checklist' },
    { field: 'category', header: 'Category', width: 140, headerFilterMode: 'checklist' },
    { field: 'qty', header: 'Qty', type: 'integer', width: 90 },
    { field: 'price', header: 'Price', type: 'currency', width: 120 },
    { field: 'total', header: 'Total', type: 'currency', width: 140, groupSummary: 'sum' },
    { field: 'order_date', header: 'Date', type: 'date', width: 120 }
  ];
  readonly pivotConfig: WePivotConfig = { rows: ['city'], columns: ['category'], values: [{ field: 'total', aggregate: 'sum' }] };

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.source = null;
    this.worker?.terminate();
    this.worker = null;
    const start = performance.now();
    try {
      if (this.where === 'browser') {
        this.source = await this.inBrowser();
        this.status = `Ready in ${((performance.now() - start) / 1000).toFixed(1)} s`;
      } else {
        this.source = await this.inDatabase();
        this.status = 'Connected — the database answers as you scroll';
      }
    } catch (e) {
      this.status = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }

  /** Generated here, stored compressed in a Web Worker: sorting, filtering and grouping never block the page */
  private async inBrowser(): Promise<WeGridDataSource<Sale>> {
    this.status = `Generating ${this.size.toLocaleString('en-US')} rows…`;
    await new Promise((resolve) => setTimeout(resolve));
    this.worker = new Worker(new URL('./sales.worker', import.meta.url), { type: 'module' });
    return WeGridWorkerStore.fromColumns<Sale>(this.worker, generateSales(this.size));
  }

  /**
   * A table on a we-report data backend: the grid asks for the rows in view, and on a protocol 1.2
   * backend the database also searches and groups. The Node.js sample serves a billion fictional
   * sales from DuckDB — see this app's README.
   */
  private async inDatabase(): Promise<WeGridDataSource<Sale>> {
    this.status = 'Connecting…';
    const client = new WeGridProtocolClient({ baseUrl: this.backendUrl.trim() });
    const info = await client.info();
    if (!info.capabilities.grid) throw new Error('This backend is older than protocol 1.1 and cannot page a grid.');
    return new WeGridProtocolDataSource<Sale>(client, this.connection.trim(), 'sales', undefined, info.capabilities);
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
  }
}
