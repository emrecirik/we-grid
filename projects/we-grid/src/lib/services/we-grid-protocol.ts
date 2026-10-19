import { Observable, from, map } from 'rxjs';
import { WeGridColumnDef, WeGridColumnType, WeGridSortDirection } from '../models/we-grid-column.model';
import { WeGridChecklistValuesProvider, WeGridColumnFilterState } from '../models/we-grid-filter.model';
import { WeGridLayout, WeGridLayoutStore } from '../models/we-grid-layout.model';
import { WeSheetData, WeSheetStore } from '../we-sheet/we-sheet.model';

/**
 * Talks to a backend that speaks the **we-report data protocol** (1.1) — the same small REST
 * contract the we-report designer uses, with sample backends for .NET, Spring Boot, Node.js,
 * Python, Go and PHP. Nothing in the grid calls it on its own: you create a client and hand its
 * pieces (a data source, a layout store, a sheet store) to the components. See docs/data-sources.md.
 */
export interface WeGridProtocolOptions {
  /** e.g. `http://127.0.0.1:5480` — no trailing slash needed */
  baseUrl: string;
  /** Sent as `Authorization: Bearer …` when the backend runs with WE_REPORT_AUTH_TOKEN */
  token?: string;
  /** Your own fetch (an interceptor, a test double) — the global one otherwise */
  fetch?: typeof fetch;
}

export interface WeGridProtocolInfo {
  protocol: number;
  server: string;
  capabilities: { webServiceFetch?: boolean; demo?: boolean; grid?: boolean; layouts?: boolean };
}

export interface WeGridProtocolConnection {
  id: string;
  name: string;
  dialect: string;
  freeSql: boolean;
}

export interface WeGridProtocolTable {
  name: string;
  columns: { name: string; type: 'string' | 'number' | 'boolean' | 'date' | 'unknown' }[];
}

export type WeGridProtocolOperator = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'like' | 'contains' | 'startsWith' | 'in' | 'isNull' | 'notNull';

export interface WeGridProtocolQuery {
  table: string;
  columns?: string[];
  where?: { column: string; op: WeGridProtocolOperator; value?: unknown }[];
  orderBy?: { column: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
}

export interface WeGridProtocolResult<T = Record<string, unknown>> {
  columns: { name: string; type: string }[];
  rows: T[];
  truncated: boolean;
  total?: number;
}

/** An HTTP answer that wasn't 2xx — `message` is the backend's `{ error }` text */
export class WeGridProtocolError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'WeGridProtocolError';
  }
}

const LAYOUT_KEY = /^[A-Za-z0-9_:-][A-Za-z0-9_.:-]{0,99}$/;

export class WeGridProtocolClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: WeGridProtocolOptions) {
    this.base = options.baseUrl.replace(/\/+$/, '');
    this.doFetch = options.fetch ?? ((...args) => fetch(...args));
  }

  info(): Promise<WeGridProtocolInfo> {
    return this.request('GET', '/v1/info');
  }

  connections(): Promise<WeGridProtocolConnection[]> {
    return this.request('GET', '/v1/connections');
  }

  async tables(connection: string): Promise<WeGridProtocolTable[]> {
    const schema = await this.request<{ tables: WeGridProtocolTable[] }>('GET', `/v1/connections/${encodeURIComponent(connection)}/schema`);
    return schema.tables;
  }

  query<T = Record<string, unknown>>(connection: string, query: WeGridProtocolQuery, count = false): Promise<WeGridProtocolResult<T>> {
    return this.request('POST', `/v1/connections/${encodeURIComponent(connection)}/query`, count ? { query, count: true } : { query });
  }

  /** A saved document, or null when none is stored under the key */
  async getLayout<D = unknown>(key: string): Promise<D | null> {
    try {
      return await this.request<D>('GET', `/v1/layouts/${this.layoutKey(key)}`);
    } catch (e) {
      if (e instanceof WeGridProtocolError && e.status === 404) return null;
      throw e;
    }
  }

  putLayout(key: string, doc: object): Promise<void> {
    return this.request('PUT', `/v1/layouts/${this.layoutKey(key)}`, doc);
  }

  deleteLayout(key: string): Promise<void> {
    return this.request('DELETE', `/v1/layouts/${this.layoutKey(key)}`);
  }

  private layoutKey(key: string): string {
    // Grid keys such as "orders::views" fit the protocol's key rules; anything else is hex-encoded
    const safe = LAYOUT_KEY.test(key) ? key : `x-${Array.from(new TextEncoder().encode(key), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 98)}`;
    return encodeURIComponent(safe);
  }

  private async request<R>(method: string, path: string, body?: unknown): Promise<R> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.options.token) headers['Authorization'] = `Bearer ${this.options.token}`;
    const res = await this.doFetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const message = typeof (json as { error?: unknown })?.error === 'string' ? (json as { error: string }).error : `HTTP ${res.status}`;
      throw new WeGridProtocolError(res.status, message);
    }
    return json as R;
  }
}

/** What a server-side grid asks for — its `page`, `pageSize`, sort and filters */
export interface WeGridServerRequest {
  page: number;
  pageSize: number;
  sort?: { field: string | null; direction: WeGridSortDirection } | null;
  filters?: readonly WeGridColumnFilterState[];
}

/**
 * A table on a protocol backend as a server-side grid's data: `load()` returns one page and the
 * total, filtering and sorting in the database. `checklistValues` plugs into the grid's
 * `checklistValuesProvider`, so a header filter lists values from the whole table.
 *
 * ```ts
 * const source = new WeGridProtocolDataSource(client, 'sample', 'customers');
 * const { rows, total } = await source.load({ page, pageSize, sort, filters });
 * ```
 */
export class WeGridProtocolDataSource<T = Record<string, unknown>> {
  constructor(
    private readonly client: WeGridProtocolClient,
    readonly connection: string,
    readonly table: string,
    /** Columns to fetch — all when omitted */
    readonly columns?: string[]
  ) {}

  async load(request: WeGridServerRequest): Promise<{ rows: T[]; total: number }> {
    const pageSize = Math.max(1, Math.floor(request.pageSize));
    const page = Math.max(1, Math.floor(request.page));
    const query: WeGridProtocolQuery = {
      table: this.table,
      where: weGridProtocolWhere(request.filters ?? []),
      limit: pageSize,
      offset: (page - 1) * pageSize
    };
    if (this.columns?.length) query.columns = this.columns;
    if (request.sort?.field && request.sort.direction) query.orderBy = [{ column: request.sort.field, dir: request.sort.direction }];
    const result = await this.client.query<T>(this.connection, query, true);
    return { rows: result.rows, total: result.total ?? result.rows.length };
  }

  /** A `checklistValuesProvider` for the grid — distinct values of the column across the table */
  readonly checklistValues: WeGridChecklistValuesProvider = (request) =>
    from(
      this.client.query<Record<string, unknown>>(
        this.connection,
        {
          table: this.table,
          columns: [request.field],
          distinct: true,
          where: [
            ...weGridProtocolWhere(request.filters),
            ...(request.search ? [{ column: request.field, op: 'contains' as const, value: request.search }] : [])
          ],
          orderBy: [{ column: request.field, dir: 'asc' }],
          limit: request.limit
        }
      )
    ).pipe(map((result) => ({ values: result.rows.map((r) => ({ value: r[request.field] ?? null })), hasMore: result.truncated })));
}

/** Grid filters as protocol conditions — every operator the grid's filter row and popovers produce */
export function weGridProtocolWhere(filters: readonly WeGridColumnFilterState[]): NonNullable<WeGridProtocolQuery['where']> {
  const where: NonNullable<WeGridProtocolQuery['where']> = [];
  for (const f of filters) {
    const value = f.value instanceof Date ? f.value.toISOString() : f.value;
    const value2 = f.value2 instanceof Date ? f.value2.toISOString() : f.value2;
    switch (f.operator) {
      case 'contains':
      case 'startsWith':
        if (value !== null && value !== undefined && value !== '') where.push({ column: f.field, op: f.operator, value });
        break;
      case 'equals':
      case 'eq':
        where.push(value === null || value === undefined || value === '' ? { column: f.field, op: 'isNull' } : { column: f.field, op: '=', value });
        break;
      case 'gt':
      case 'after':
        where.push({ column: f.field, op: '>', value });
        break;
      case 'lt':
      case 'before':
        where.push({ column: f.field, op: '<', value });
        break;
      case 'between':
        if (value !== null && value !== undefined) where.push({ column: f.field, op: '>=', value });
        if (value2 !== null && value2 !== undefined) where.push({ column: f.field, op: '<=', value: value2 });
        break;
      case 'in': {
        const list = Array.isArray(value) ? value : [];
        const present = list.filter((v) => v !== null && v !== undefined && v !== '');
        // "(Empty)" ticked alongside values can't be one condition (conditions are ANDed) — the values win
        if (present.length) where.push({ column: f.field, op: 'in', value: present });
        else if (list.length) where.push({ column: f.field, op: 'isNull' });
        break;
      }
    }
  }
  return where;
}

/** Grid columns for a table — types from the schema, headers from the column names (`order_date` → "Order date") */
export function weGridColumnsFromTable<T = Record<string, unknown>>(table: WeGridProtocolTable): WeGridColumnDef<T>[] {
  const type = (t: string): WeGridColumnType => (t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'boolean' ? 'boolean' : 'text');
  return table.columns.map((c) => {
    const words = c.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
    const header = words.charAt(0).toUpperCase() + words.slice(1);
    return { field: c.name, header, type: type(c.type), ...(c.type === 'number' ? { align: 'end' as const } : {}) };
  });
}

/** Keeps a grid's layout (and views) on the backend — provide it as `WE_GRID_LAYOUT_STORE` */
export class WeGridProtocolLayoutStore implements WeGridLayoutStore {
  constructor(
    private readonly client: WeGridProtocolClient,
    /** Prefixed to every key — e.g. the signed-in user's id, so users don't share layouts */
    private readonly prefix = 'grid:'
  ) {}

  load(gridKey: string): Observable<WeGridLayout | null> {
    return from(this.client.getLayout<WeGridLayout>(this.prefix + gridKey));
  }

  save(gridKey: string, layout: WeGridLayout): Observable<void> {
    return from(this.client.putLayout(this.prefix + gridKey, layout));
  }

  reset(gridKey: string): Observable<void> {
    return from(this.client.deleteLayout(this.prefix + gridKey));
  }
}

/** Keeps `<we-sheet sheetKey>` sheets on the backend — provide it as `WE_SHEET_STORE` */
export class WeSheetProtocolStore implements WeSheetStore {
  constructor(
    private readonly client: WeGridProtocolClient,
    private readonly prefix = 'sheet:'
  ) {}

  load(sheetKey: string): Observable<WeSheetData | null> {
    return from(this.client.getLayout<WeSheetData>(this.prefix + sheetKey));
  }

  save(sheetKey: string, data: WeSheetData): Observable<void> {
    return from(this.client.putLayout(this.prefix + sheetKey, data));
  }
}
