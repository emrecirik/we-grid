import { Observable, from, map } from 'rxjs';
import { WeGridColumnDef, WeGridColumnType, WeGridSortDirection, weGridValueKind } from '../models/we-grid-column.model';
import { WeGridChecklistValuesProvider, WeGridColumnFilterState } from '../models/we-grid-filter.model';
import { WeGridDataPage, WeGridDataRequest, WeGridDataSource, WeGridGroupNode, WeGridGroupRequest } from '../models/we-grid-data-source.model';
import { WeGridLayout, WeGridLayoutStore } from '../models/we-grid-layout.model';
import { WeSheetData, WeSheetStore } from '../we-sheet/we-sheet.model';

/**
 * Talks to a backend that speaks the **we-report data protocol** (1.1, 1.2) — the same small REST
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
  /** `search` and `groups` arrived with protocol 1.2 — a 1.1 backend leaves them out */
  capabilities: { webServiceFetch?: boolean; demo?: boolean; grid?: boolean; layouts?: boolean; search?: boolean; groups?: boolean };
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
  orderBy?: { column: string; dir?: 'asc' | 'desc'; nulls?: 'first' | 'last' }[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
  /** 1.2 — every word of `text` in some of `columns` */
  search?: { text: string; columns: string[] };
  /** 1.2 — one row per combination, with `__count` and the aggregates */
  groupBy?: string[];
  aggregates?: { column: string; fn: 'sum' | 'avg' | 'min' | 'max' | 'count'; as: string }[];
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
    // Grid keys such as "orders::views" fit the protocol's key rules; anything else is hex-encoded,
    // and a key too long for that keeps its first 32 bytes plus a hash of the whole key
    if (LAYOUT_KEY.test(key)) return encodeURIComponent(key);
    const bytes = new TextEncoder().encode(key);
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    const safe = bytes.length <= 49 ? `x-${hex(bytes)}` : `x-${hex(bytes.slice(0, 32))}-${hash53(key, 1).toString(16)}${hash53(key, 2).toString(16)}`;
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
 * A table on a protocol backend as a grid's data, filtering and sorting in the database:
 *
 * - `[dataSource]="source"` scrolls the whole table window by window — any number of rows. With a
 *   protocol 1.2 backend (pass its `capabilities`) the search box searches the table and grouping
 *   groups it, counts and group summaries worked out by the database.
 * - On a `serverSide` grid, `load({ page, pageSize, sort, filters })` returns one page and the total.
 *
 * `checklistValues` lists a header filter's values from the whole table.
 *
 * ```ts
 * const info = await client.info();
 * const source = new WeGridProtocolDataSource(client, 'sample', 'customers', undefined, info.capabilities);
 * ```
 */
export class WeGridProtocolDataSource<T = Record<string, unknown>> implements WeGridDataSource<T> {
  /** Groups the table in the database — only when the backend speaks protocol 1.2 `groups` */
  readonly groups?: (request: WeGridGroupRequest) => Promise<WeGridGroupNode[]>;

  constructor(
    private readonly client: WeGridProtocolClient,
    readonly connection: string,
    readonly table: string,
    /** Columns to fetch — all when omitted */
    readonly columns?: string[],
    /** The backend's `info().capabilities` — `search` and `groups` switch on what protocol 1.2 adds */
    readonly capabilities: WeGridProtocolInfo['capabilities'] = {}
  ) {
    if (capabilities.groups) this.groups = (request) => this.loadGroups(request);
  }

  /** A window of rows for `[dataSource]`, or a page for a `serverSide` grid */
  load(request: WeGridDataRequest): Promise<WeGridDataPage<T>>;
  load(request: WeGridServerRequest): Promise<{ rows: T[]; total: number }>;
  async load(request: WeGridServerRequest | WeGridDataRequest): Promise<{ rows: T[]; total: number }> {
    if ('offset' in request) return this.loadWindow(request);
    return this.loadPage(request);
  }

  private async loadWindow(request: WeGridDataRequest): Promise<WeGridDataPage<T>> {
    const query: WeGridProtocolQuery = {
      ...this.where(request),
      orderBy: [
        // Group by group, in the order groups() lists them — so a group's rows are one run of offsets
        ...(request.groupBy ?? []).map((column) => ({ column, nulls: 'first' as const })),
        // The grid's own order: empty values first ascending, last descending
        ...(request.sort ?? []).map((k) => ({ column: k.field, dir: k.direction, nulls: k.direction === 'asc' ? ('first' as const) : ('last' as const) }))
      ],
      limit: Math.max(1, Math.floor(request.limit)),
      offset: Math.max(0, Math.floor(request.offset))
    };
    if (!query.orderBy!.length) delete query.orderBy;
    if (this.columns?.length) query.columns = this.columns;
    // Counting scans the whole result — on a billion rows seconds per window — so once per query,
    // not once per window
    const key = JSON.stringify({ ...query, offset: undefined, limit: undefined, orderBy: undefined });
    const counted = this.lastCount?.key === key ? this.lastCount.total : undefined;
    const result = await this.client.query<T>(this.connection, query, counted === undefined);
    const total = counted ?? result.total ?? result.rows.length;
    this.lastCount = { key, total };
    return { rows: result.rows, total };
  }

  /** The total of the last query — the windows after its first don't count again */
  private lastCount: { key: string; total: number } | null = null;

  /** The table, the filters and — with protocol 1.2 — the search box as one query */
  private where(request: Omit<WeGridDataRequest, 'offset' | 'limit'>): WeGridProtocolQuery {
    const query: WeGridProtocolQuery = { table: this.table, where: weGridProtocolWhere(request.filters ?? []) };
    const text = request.search?.trim();
    if (text) {
      if (!this.capabilities.search) throw new WeGridProtocolError(400, 'This backend cannot search a table — it needs protocol 1.2.');
      // The text columns the grid shows: reading every number and date of a billion rows as text costs
      // more than the search is worth — their column filters find them instead
      const columns = (request.columns ?? [])
        .filter((c) => weGridValueKind(c.type) === 'text' && (!this.columns?.length || this.columns.includes(c.field)))
        .map((c) => c.field);
      if (columns.length) query.search = { text, columns };
    }
    return query;
  }

  /**
   * The groups of the filtered table: the database returns one row per combination of the group
   * fields (protocol 1.2 `groupBy`), these become the nested groups the grid shows — counts,
   * offsets and subtotals, outer levels added up from the inner ones.
   */
  private async loadGroups(request: WeGridGroupRequest): Promise<WeGridGroupNode[]> {
    const aggregates = request.aggregates ?? [];
    const query: WeGridProtocolQuery = {
      ...this.where(request),
      groupBy: [...request.groupBy],
      aggregates: aggregates.flatMap((a, i) => [
        { column: a.field, fn: a.fn, as: `a${i}` },
        // How many values each figure covers — what an outer level's average is weighed by
        ...(a.fn === 'avg' ? [{ column: a.field, fn: 'count' as const, as: `n${i}` }] : [])
      ])
    };
    const result = await this.client.query<Record<string, unknown>>(this.connection, query);
    if (result.truncated) throw new WeGridProtocolError(413, 'Too many groups for one answer — group by a coarser field.');
    const roots: WeGridGroupNode[] = [];
    const sums: { node: WeGridGroupNode; parts: Record<string, unknown>[] }[] = [];
    const stack: { node: WeGridGroupNode; key: string; parts: Record<string, unknown>[] }[] = [];
    let start = 0;
    for (const row of result.rows) {
      const count = Number(row['__count'] ?? 0);
      let depth = 0;
      while (depth < stack.length && stack[depth].key === groupKey(row[request.groupBy[depth]])) depth++;
      stack.length = depth;
      for (let level = depth; level < request.groupBy.length; level++) {
        const value = row[request.groupBy[level]] ?? null;
        const node: WeGridGroupNode = {
          field: request.groupBy[level],
          level,
          value,
          key: groupKey(value),
          start,
          count: 0,
          aggregates: {},
          ...(level < request.groupBy.length - 1 ? { children: [] } : {})
        };
        (level === 0 ? roots : stack[level - 1].node.children!).push(node);
        const entry = { node, key: node.key, parts: [] as Record<string, unknown>[] };
        stack.push(entry);
        sums.push(entry);
      }
      for (const entry of stack) {
        entry.node.count += count;
        entry.parts.push(row);
      }
      start += count;
    }
    for (const { node, parts } of sums) {
      aggregates.forEach((a, i) => (node.aggregates[a.key ?? a.field] = mergeAggregate(a.fn, parts, `a${i}`, `n${i}`)));
    }
    return roots;
  }

  private async loadPage(request: WeGridServerRequest): Promise<{ rows: T[]; total: number }> {
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

/** A group's key among its siblings: the value as text, '' for the empty group */
function groupKey(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

/** The database's figures for the innermost groups, added up for a group that covers several */
function mergeAggregate(fn: 'sum' | 'avg' | 'min' | 'max' | 'count', rows: Record<string, unknown>[], key: string, countKey: string): number | null {
  const values = rows.map((r) => (r[key] === null || r[key] === undefined ? null : Number(r[key])));
  const present = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (fn === 'count') return present.reduce((a, b) => a + b, 0);
  if (!present.length) return null;
  switch (fn) {
    case 'sum':
      return present.reduce((a, b) => a + b, 0);
    case 'min':
      return present.reduce((a, b) => (b < a ? b : a));
    case 'max':
      return present.reduce((a, b) => (b > a ? b : a));
    default: {
      // Each average weighed by the values it covers
      let total = 0;
      let n = 0;
      rows.forEach((r, i) => {
        const v = values[i];
        const c = Number(r[countKey] ?? 0);
        if (v === null || Number.isNaN(v) || !c) return;
        total += v * c;
        n += c;
      });
      return n ? total / n : null;
    }
  }
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

/** cyrb53 — a fast 53-bit string hash; two seeds make collisions between layout keys negligible */
function hash53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
