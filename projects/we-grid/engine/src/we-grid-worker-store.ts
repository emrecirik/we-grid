import { Observable, from } from 'rxjs';
import { WeGridDataPage, WeGridDataRequest, WeGridDataSource } from './we-grid-data-source.model';
import { WeGridChecklistValuesRequest, WeGridChecklistValuesResult } from './we-grid-filter.model';
import { WeGridColumnStore, WeGridDictionaryColumn, WeGridFixedPointColumn, WeGridStoredColumnInfo } from './we-grid-column-store';

type ColumnsInput = Record<string, ArrayLike<unknown> | WeGridDictionaryColumn | WeGridFixedPointColumn>;
type Query = Omit<WeGridDataRequest, 'offset' | 'limit'>;

/** What crosses between the page and the worker */
type WorkerCall =
  | { op: 'fromColumns'; columns: ColumnsInput }
  | { op: 'fromRows'; rows: object[]; fields?: readonly string[] }
  | { op: 'load'; request: WeGridDataRequest }
  | { op: 'checklist'; request: WeGridChecklistValuesRequest }
  | { op: 'aggregate'; field: string; fn: 'sum' | 'avg' | 'min' | 'max' | 'count'; request: Query }
  | { op: 'distinct'; field: string; request: Query; limit: number }
  | { op: 'set'; row: number; field: string; value: unknown }
  | { op: 'describe' };

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

/** The end of a worker or port the store talks through — a `Worker`, or a `MessagePort` in tests */
export interface WeGridWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/**
 * Runs a `WeGridColumnStore` inside a Web Worker — the whole worker file is:
 *
 * ```ts
 * // grid.worker.ts
 * import { weGridServeColumnStore } from 'we-grid-angular/engine';
 * weGridServeColumnStore();
 * ```
 *
 * The page talks to it through `WeGridWorkerStore`. Calls are answered in order.
 */
export function weGridServeColumnStore(scope: WorkerScope = self as unknown as WorkerScope): void {
  let store: WeGridColumnStore<object> | null = null;
  scope.onmessage = (event: MessageEvent<{ id: number; call: WorkerCall }>) => {
    const { id, call } = event.data;
    try {
      let result: unknown;
      if (call.op === 'fromColumns' || call.op === 'fromRows') {
        const built: WeGridColumnStore<object> = call.op === 'fromColumns' ? WeGridColumnStore.fromColumns(call.columns) : WeGridColumnStore.fromRows(call.rows, call.fields);
        store = built;
        result = { length: built.length, fields: built.fields };
      } else if (!store) {
        throw new Error('WeGridWorkerStore: the store was not built yet');
      } else if (call.op === 'load') result = store.load(call.request);
      else if (call.op === 'checklist') result = store.checklist(call.request);
      else if (call.op === 'aggregate') result = store.aggregate(call.field, call.fn, call.request);
      else if (call.op === 'distinct') result = store.distinct(call.field, call.request, call.limit);
      else if (call.op === 'set') result = store.set(call.row, call.field, call.value);
      else result = store.describe();
      scope.postMessage({ id, result });
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  };
}

/** The buffers behind the typed arrays of a columns input — handed over to the worker, not copied */
function transferables(columns: ColumnsInput): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const c of Object.values(columns)) {
    const array = 'codes' in c && 'dictionary' in c ? c.codes : 'fixed' in c ? c.fixed : c;
    if (ArrayBuffer.isView(array) && array.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
  }
  return Array.from(buffers);
}

/** A request with the column formatters left out — a function can't be posted; the worker formats from `formatSpec` */
function postable(request: Query): Query {
  return request.columns ? { ...request, columns: request.columns.map(({ format: _format, ...column }) => column) } : request;
}

/**
 * A `WeGridColumnStore` living in a Web Worker, as a `dataSource`: sorting, filtering and searching
 * tens of millions of rows happens off the page's thread, so scrolling and typing never stall. Only
 * the rows of the window in view cross back.
 *
 * ```ts
 * const worker = new Worker(new URL('./grid.worker', import.meta.url), { type: 'module' });
 * store = await WeGridWorkerStore.fromColumns<Order>(worker, { id, city: { dictionary, codes } });
 * ```
 *
 * Typed arrays passed to `fromColumns` are transferred: they are empty on the page afterwards.
 * Search formats cells with the grid's built-in formatting there; a column's own `formatter` isn't
 * applied in the worker.
 */
export class WeGridWorkerStore<T extends object = Record<string, unknown>> implements WeGridDataSource<T> {
  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly listener = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>): void => {
    const entry = this.pending.get(event.data?.id);
    if (!entry) return;
    this.pending.delete(event.data.id);
    if (event.data.error !== undefined) entry.reject(new Error(event.data.error));
    else entry.resolve(event.data.result);
  };

  private constructor(
    private readonly port: WeGridWorkerPort,
    /** Rows in the store */
    readonly length: number,
    readonly fields: readonly string[]
  ) {}

  /** Builds the store in the worker from columns — see `WeGridColumnStore.fromColumns` */
  static async fromColumns<R extends object = Record<string, unknown>>(port: WeGridWorkerPort, columns: ColumnsInput): Promise<WeGridWorkerStore<R>> {
    return WeGridWorkerStore.open<R>(port, { op: 'fromColumns', columns }, transferables(columns));
  }

  /** Builds the store in the worker from rows, which are copied across once — see `WeGridColumnStore.fromRows` */
  static async fromRows<R extends object>(port: WeGridWorkerPort, rows: readonly R[], fields?: readonly string[]): Promise<WeGridWorkerStore<R>> {
    return WeGridWorkerStore.open<R>(port, { op: 'fromRows', rows: rows as unknown as object[], fields }, []);
  }

  private static async open<R extends object>(port: WeGridWorkerPort, call: WorkerCall, transfer: Transferable[]): Promise<WeGridWorkerStore<R>> {
    const store = new WeGridWorkerStore<R>(port, 0, []);
    port.addEventListener('message', store.listener);
    // A MessagePort only delivers to addEventListener once started; a Worker has no start()
    (port as { start?: () => void }).start?.();
    const info = (await store.call(call, transfer)) as { length: number; fields: string[] };
    return Object.assign(store, { length: info.length, fields: info.fields }) as WeGridWorkerStore<R>;
  }

  load(request: WeGridDataRequest): Promise<WeGridDataPage<T>> {
    return this.call({ op: 'load', request: { ...postable(request), offset: request.offset, limit: request.limit } }) as Promise<WeGridDataPage<T>>;
  }

  readonly checklistValues = (request: WeGridChecklistValuesRequest): Observable<WeGridChecklistValuesResult> =>
    from(this.call({ op: 'checklist', request }) as Promise<WeGridChecklistValuesResult>);

  aggregate(field: string, fn: 'sum' | 'avg' | 'min' | 'max' | 'count', request: Query = {}): Promise<number | null> {
    return this.call({ op: 'aggregate', field, fn, request: postable(request) }) as Promise<number | null>;
  }

  distinct(field: string, request: Query = {}, limit = Infinity): Promise<unknown[]> {
    return this.call({ op: 'distinct', field, request: postable(request), limit }) as Promise<unknown[]>;
  }

  /** Changes one cell — call the grid's `refreshDataSource()` once the promise settles */
  set(row: number, field: string, value: unknown): Promise<void> {
    return this.call({ op: 'set', row, field, value }) as Promise<void>;
  }

  describe(): Promise<WeGridStoredColumnInfo[]> {
    return this.call({ op: 'describe' }) as Promise<WeGridStoredColumnInfo[]>;
  }

  /** Stops listening; calls still waiting are rejected. The worker itself is the caller's to terminate */
  close(): void {
    this.closed = true;
    this.port.removeEventListener('message', this.listener);
    for (const entry of this.pending.values()) entry.reject(new Error('WeGridWorkerStore: closed'));
    this.pending.clear();
  }

  private call(call: WorkerCall, transfer: Transferable[] = []): Promise<unknown> {
    // Nothing would ever answer: the listener is gone
    if (this.closed) return Promise.reject(new Error('WeGridWorkerStore: closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ id, call }, transfer);
    });
  }
}
