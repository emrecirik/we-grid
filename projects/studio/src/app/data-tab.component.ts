import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  WeGridColumnDef,
  WeGridColumnFilterState,
  WeGridComponent,
  WeGridFilterChangeEvent,
  WeGridLayout,
  WeGridLayoutStore,
  WeGridPageChange,
  WeGridProtocolClient,
  WeGridProtocolConnection,
  WeGridProtocolDataSource,
  WeGridProtocolLayoutStore,
  WeGridProtocolTable,
  WeGridSortChange,
  WeGridSortDirection,
  WE_GRID_LAYOUT_STORE,
  LocalStorageGridLayoutStore,
  weGridColumnsFromTable
} from 'we-grid-angular';
import { StudioText } from './studio-text';

type Row = Record<string, unknown>;

const URL_KEY = 'we-grid-studio:backend';

/**
 * Connects the grid to a backend that speaks the we-report data protocol — any of the sample
 * backends (.NET, Spring Boot, Node.js, Python, Go, PHP) running on the visitor's own machine.
 */
@Component({
  selector: 'studio-data-tab',
  standalone: true,
  imports: [FormsModule, WeGridComponent],
  // The grid's layout goes to the backend once connected, so it follows the user to any browser —
  // resolved per call, because the store changes when the user connects
  providers: [
    {
      provide: WE_GRID_LAYOUT_STORE,
      useValue: {
        load: (key: string) => DataTabComponent.layoutStore.load(key),
        save: (key: string, layout: WeGridLayout) => DataTabComponent.layoutStore.save(key, layout),
        reset: (key: string) => DataTabComponent.layoutStore.reset(key)
      } satisfies WeGridLayoutStore
    }
  ],
  templateUrl: './data-tab.component.html',
  styleUrl: './app.component.scss'
})
export class DataTabComponent {
  @Input({ required: true }) text!: StudioText;

  /** Switched to the backend's store on connect — read by the provider when the grid is created */
  static layoutStore: WeGridProtocolLayoutStore | LocalStorageGridLayoutStore = new LocalStorageGridLayoutStore();

  baseUrl = this.read(URL_KEY) ?? 'http://127.0.0.1:5480';
  token = '';
  status: 'idle' | 'connecting' | 'connected' | 'error' = 'idle';
  error = '';
  server = '';
  layoutsOnServer = false;
  connections: WeGridProtocolConnection[] = [];
  tables: WeGridProtocolTable[] = [];
  connection = '';
  table = '';

  source: WeGridProtocolDataSource<Row> | null = null;
  columns: WeGridColumnDef<Row>[] = [];
  rows: Row[] = [];
  totalCount = 0;
  page = 1;
  pageSize = 25;
  sortField: string | null = null;
  sortDirection: WeGridSortDirection = null;
  filters: WeGridColumnFilterState[] = [];
  loading = false;
  private client: WeGridProtocolClient | null = null;
  private loadSeq = 0;

  get snippet(): string {
    return `WE_REPORT_CORS_ORIGINS=${location.origin} npm start   # samples/backends/node of we-report`;
  }

  async connect(): Promise<void> {
    this.status = 'connecting';
    this.error = '';
    this.source = null;
    try {
      this.client = new WeGridProtocolClient({ baseUrl: this.baseUrl.trim(), token: this.token.trim() || undefined });
      const info = await this.client.info();
      this.server = info.server;
      this.layoutsOnServer = !!info.capabilities.layouts;
      if (!info.capabilities.grid) throw new Error(this.text.dataNeedsGrid);
      this.connections = await this.client.connections();
      this.write(URL_KEY, this.baseUrl.trim());
      this.status = 'connected';
      if (this.connections.length) await this.pickConnection(this.connections[0].id);
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async pickConnection(id: string): Promise<void> {
    this.connection = id;
    this.tables = await this.client!.tables(id);
    if (this.tables.length) this.pickTable(this.tables.find((t) => t.name === 'orders')?.name ?? this.tables[0].name);
  }

  pickTable(name: string): void {
    const table = this.tables.find((t) => t.name === name);
    if (!table || !this.client) return;
    DataTabComponent.layoutStore = this.layoutsOnServer ? new WeGridProtocolLayoutStore(this.client, 'studio:') : new LocalStorageGridLayoutStore();
    this.table = name;
    this.columns = weGridColumnsFromTable<Row>(table);
    this.source = new WeGridProtocolDataSource<Row>(this.client, this.connection, name);
    this.page = 1;
    this.sortField = null;
    this.sortDirection = null;
    this.filters = [];
    void this.load();
  }

  onPageChange(e: WeGridPageChange): void {
    this.page = e.page;
    this.pageSize = e.pageSize;
    void this.load();
  }

  onSortChange(e: WeGridSortChange): void {
    this.sortField = e.field;
    this.sortDirection = e.direction;
    this.page = 1;
    void this.load();
  }

  onFilterChange(e: WeGridFilterChangeEvent): void {
    this.filters = [...e];
    if (e.resetPage) this.page = 1;
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.source) return;
    const seq = ++this.loadSeq;
    this.loading = true;
    try {
      const result = await this.source.load({
        page: this.page,
        pageSize: this.pageSize,
        sort: { field: this.sortField, direction: this.sortDirection },
        filters: this.filters
      });
      // A slower earlier answer must not overwrite a newer one
      if (seq !== this.loadSeq) return;
      this.rows = result.rows;
      this.totalCount = result.total;
      this.error = '';
    } catch (e) {
      if (seq === this.loadSeq) this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq === this.loadSeq) this.loading = false;
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage blocked — the address is asked for again next time
    }
  }
}
