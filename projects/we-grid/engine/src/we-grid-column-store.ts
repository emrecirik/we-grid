import { WeGridColumnType } from './we-grid-column-kind';
import {
  WeGridDataColumn,
  WeGridDataPage,
  WeGridDataRequest,
  WeGridDataSource,
  WeGridGroupAggregate,
  WeGridGroupNode,
  WeGridGroupRequest
} from './we-grid-data-source.model';
import { Observable, of } from 'rxjs';
import { WeGridChecklistValuesRequest, WeGridChecklistValuesResult, isWeGridFilterActive } from './we-grid-filter.model';
import { weGridFoldCase, weGridValueMatchesFilter } from './we-grid-filter-match';
import { formatWeGridColumnValue } from './we-grid-value.util';
import { WeGridRadixWord, weGridCompareGroupValues, weGridCompareSortValues, weGridFloatSortWords, weGridRadixSort } from './we-grid-sort.util';

type Codes = Uint8Array | Uint16Array | Uint32Array;

/**
 * How one column is held. Every encoding answers filters, search and sort on its own codes; rows
 * are only built as objects for the window the grid shows.
 */
type StoreColumn =
  /** `start + row * step` — an id column costs nothing */
  | { kind: 'seq'; start: number; step: number }
  /** Integers, or decimals with up to four places, as `(code - 1 + min) / scale`; code 0 is empty */
  | { kind: 'int'; codes: Codes; min: number; scale: number; top: number }
  /** Any other numbers; NaN is empty */
  | { kind: 'f64'; data: Float64Array }
  /** Dates as epoch ms; NaN is empty */
  | { kind: 'date'; data: Float64Array }
  /** Strings, booleans and other primitives: `values[codes[row]]`, `values[0]` is empty. Sorted values make the codes the sort key */
  | { kind: 'dict'; codes: Codes; values: unknown[]; sorted: boolean; index?: Map<unknown, number> }
  /** Objects and mixed values, as given */
  | { kind: 'any'; data: unknown[] };

/** A column handed in already dictionary-encoded — `dictionary[codes[row]]` */
export interface WeGridDictionaryColumn {
  dictionary: readonly unknown[];
  codes: Uint8Array | Uint16Array | Uint32Array;
}

/**
 * A number column handed in as integers and a scale — `fixed[row] / scale`, e.g. amounts in cents
 * with scale 100. Loads money without a Float64 copy; `emptyValue` marks the empty cells.
 */
export interface WeGridFixedPointColumn {
  fixed: Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;
  scale: number;
  emptyValue?: number;
}

/** How a column ended up stored — see `WeGridColumnStore.describe()` */
export interface WeGridStoredColumnInfo {
  field: string;
  encoding: StoreColumn['kind'];
  bytes: number;
  /** Distinct values of a dictionary column */
  distinct?: number;
}

const SCALES = [1, 10, 100, 1000, 10000];
/** More distinct groups than this is an error: a grouping that fine helps nobody and costs memory */
const GROUP_LIMIT = 200_000;
const MASK_CODE_LIMIT = 1 << 18;

function codesFor(maxCode: number, n: number): Codes {
  return maxCode <= 0xff ? new Uint8Array(n) : maxCode <= 0xffff ? new Uint16Array(n) : new Uint32Array(n);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

function encodeNumbers(values: ArrayLike<unknown>): StoreColumn {
  const n = values.length;
  const first = values[0] as number;
  if (n >= 2 && Number.isInteger(first) && Number.isInteger(values[1])) {
    const step = (values[1] as number) - first;
    let seq = true;
    for (let i = 0; i < n && seq; i++) seq = values[i] === first + i * step;
    if (seq) return { kind: 'seq', start: first, step };
  }
  for (const scale of SCALES) {
    let min = Infinity;
    let max = -Infinity;
    let fits = true;
    for (let i = 0; i < n && fits; i++) {
      const v = values[i] as number;
      if (isEmpty(v)) continue;
      const q = Math.round(v * scale);
      fits = q / scale === v && Number.isSafeInteger(q);
      if (q < min) min = q;
      if (q > max) max = q;
    }
    if (!fits) continue;
    if (min === Infinity) min = max = 0;
    if (max - min + 1 > 0xfffffffe) break;
    const codes = codesFor(max - min + 1, n);
    for (let i = 0; i < n; i++) {
      const v = values[i] as number;
      codes[i] = isEmpty(v) ? 0 : Math.round(v * scale) - min + 1;
    }
    return { kind: 'int', codes, min, scale, top: max - min + 1 };
  }
  return { kind: 'f64', data: Float64Array.from(values as ArrayLike<number>, (v) => (isEmpty(v) ? NaN : v)) };
}

function encodeDictionary(values: ArrayLike<unknown>): StoreColumn {
  const n = values.length;
  const index = new Map<unknown, number>([[null, 0]]);
  const dictionary: unknown[] = [null];
  const firstSeen = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const v = values[i] === undefined ? null : values[i];
    let code = index.get(v);
    if (code === undefined) {
      code = dictionary.length;
      index.set(v, code);
      dictionary.push(v);
    }
    firstSeen[i] = code;
  }
  return sortDictionary(dictionary, firstSeen, 0);
}

function encodeFixed(column: WeGridFixedPointColumn): StoreColumn {
  const { fixed, scale, emptyValue } = column;
  const n = fixed.length;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = fixed[i];
    if (v === emptyValue) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) min = max = 0;
  // A span that leaves no room for the empty code is held like any other numbers
  if (max - min + 1 > 0xfffffffe) return encodeNumbers(Array.from(fixed, (v) => (v === emptyValue ? null : v / scale)));
  const codes = codesFor(max - min + 1, n);
  for (let i = 0; i < n; i++) codes[i] = fixed[i] === emptyValue ? 0 : fixed[i] - min + 1;
  return { kind: 'int', codes, min, scale, top: max - min + 1 };
}

/**
 * Puts the dictionary in sort order, so a code compares like its value — when the values share a
 * type. Row `i` has entry `rawCodes[i] + shift`.
 */
function sortDictionary(dictionary: readonly unknown[], rawCodes: ArrayLike<number>, shift: number): StoreColumn {
  const n = rawCodes.length;
  const types = new Set(dictionary.slice(1).map((v) => typeof v));
  const sorted = types.size <= 1;
  const order = dictionary.map((_, i) => i);
  if (sorted) order.sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : weGridCompareSortValues(dictionary[a], dictionary[b], 'asc')));
  const remap = new Uint32Array(dictionary.length);
  order.forEach((old, rank) => (remap[old] = rank));
  const codes = codesFor(dictionary.length - 1, n);
  for (let i = 0; i < n; i++) codes[i] = remap[rawCodes[i] + shift];
  return { kind: 'dict', codes, values: order.map((old) => (old === 0 ? null : dictionary[old])), sorted };
}

function encodeColumn(values: ArrayLike<unknown>): StoreColumn {
  let numbers = 0;
  let dates = 0;
  let primitives = 0;
  let objects = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') numbers++;
    else if (v instanceof Date) dates++;
    else if (typeof v === 'object' || typeof v === 'function') objects++;
    else primitives++;
  }
  if (objects === 0 && dates === 0 && primitives === 0 && numbers > 0) return encodeNumbers(values);
  if (objects === 0 && numbers === 0 && primitives === 0 && dates > 0) {
    return { kind: 'date', data: Float64Array.from(values as ArrayLike<unknown>, (v) => (v instanceof Date ? v.getTime() : NaN)) };
  }
  if (objects === 0 && dates === 0) return encodeDictionary(values);
  return { kind: 'any', data: Array.from(values) };
}

function decode(column: StoreColumn, row: number): unknown {
  switch (column.kind) {
    case 'seq':
      return column.start + row * column.step;
    case 'int': {
      const code = column.codes[row];
      return code === 0 ? null : (code - 1 + column.min) / column.scale;
    }
    case 'f64': {
      const v = column.data[row];
      return Number.isNaN(v) ? null : v;
    }
    case 'date': {
      const v = column.data[row];
      return Number.isNaN(v) ? null : new Date(v);
    }
    case 'dict':
      return column.values[column.codes[row]];
    default:
      return column.data[row] ?? null;
  }
}

function inferType(column: StoreColumn): WeGridColumnType {
  if (column.kind === 'seq' || column.kind === 'int' || column.kind === 'f64') return 'number';
  if (column.kind === 'date') return 'date';
  if (column.kind === 'dict' && column.values.length > 1 && column.values.slice(1).every((v) => typeof v === 'boolean')) return 'boolean';
  return 'text';
}

function setNested(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    node = (node[parts[i]] ??= {}) as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

function readNested(row: unknown, path: string): unknown {
  let node = row as Record<string, unknown> | null | undefined;
  for (const part of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = node[part] as Record<string, unknown> | undefined;
  }
  return node;
}

/**
 * An in-browser columnar table — the engine behind a `[dataSource]` grid. Each column is stored in
 * the smallest typed array its values allow (an id sequence takes no memory, a city column one
 * byte a row, prices with cents four), so tens of millions of rows fit where row objects would
 * not. Filters, search and sort work on the encoded columns: a filter is decided once per distinct
 * value, a search formats each dictionary value once, and sorting is a radix sort straight over
 * the codes. Only the rows in view are built as objects.
 *
 * ```ts
 * const store = WeGridColumnStore.fromRows(rows);   // then drop `rows`
 * <we-grid [dataSource]="store" ... />
 * ```
 */
export class WeGridColumnStore<T extends object = Record<string, unknown>> implements WeGridDataSource<T> {
  private lastQuery: { key: string; order: Uint32Array | null } | null = null;
  private lastMatch: { key: string; rows: Uint32Array | null } | null = null;
  /** Group order of each row, by column and locale — see `groupRanks` */
  private readonly rankCache = new Map<string, { ranks: Uint32Array; values: unknown[] }>();

  /** Forgets everything worked out from the data — after an edit */
  private invalidate(): void {
    this.lastQuery = null;
    this.lastMatch = null;
    this.rankCache.clear();
  }

  private constructor(
    readonly fields: readonly string[],
    private readonly columns: StoreColumn[],
    private size: number
  ) {}

  /** Encodes rows column by column — the rows can be dropped afterwards. `fields` default to the keys of the first rows */
  static fromRows<R extends object>(rows: readonly R[], fields?: readonly string[]): WeGridColumnStore<R> {
    const names = fields ?? Array.from(new Set(rows.slice(0, 1000).flatMap((r) => Object.keys(r))));
    const columns = names.map((field) => {
      const values = new Array<unknown>(rows.length);
      const nested = field.includes('.');
      for (let i = 0; i < rows.length; i++) values[i] = nested ? readNested(rows[i], field) : (rows[i] as Record<string, unknown>)[field];
      return encodeColumn(values);
    });
    return new WeGridColumnStore<R>(names, columns, rows.length);
  }

  /**
   * Builds the store from columns of equal length — plain arrays, typed arrays, or a column already
   * dictionary-encoded. The way to load more rows than fit as objects.
   */
  static fromColumns<R extends object = Record<string, unknown>>(
    columns: Record<string, ArrayLike<unknown> | WeGridDictionaryColumn | WeGridFixedPointColumn>
  ): WeGridColumnStore<R> {
    const names = Object.keys(columns);
    const lengths = names.map((f) => {
      const c = columns[f];
      return 'codes' in c && 'dictionary' in c ? c.codes.length : 'fixed' in c ? c.fixed.length : (c as ArrayLike<unknown>).length;
    });
    if (new Set(lengths).size > 1) throw new Error(`WeGridColumnStore.fromColumns: columns differ in length (${names.map((f, i) => `${f}=${lengths[i]}`).join(', ')})`);
    const encoded = names.map((f) => {
      const c = columns[f];
      // Shifted by one so code 0 stays the empty value
      if ('codes' in c && 'dictionary' in c) return sortDictionary([null, ...c.dictionary], c.codes, 1);
      if ('fixed' in c) return encodeFixed(c);
      return encodeColumn(c as ArrayLike<unknown>);
    });
    return new WeGridColumnStore<R>(names, encoded, lengths[0] ?? 0);
  }

  get length(): number {
    return this.size;
  }

  value(row: number, field: string): unknown {
    const i = this.fields.indexOf(field);
    return i < 0 ? undefined : decode(this.columns[i], row);
  }

  /** The row as an object — a new one each call */
  row(index: number): T {
    const out: Record<string, unknown> = {};
    for (let c = 0; c < this.fields.length; c++) {
      const field = this.fields[c];
      const v = decode(this.columns[c], index);
      if (field.includes('.')) setNested(out, field, v);
      else out[field] = v;
    }
    return out as T;
  }

  /** Changes one cell. A value the column's encoding can't hold widens the column */
  set(row: number, field: string, value: unknown): void {
    const c = this.fields.indexOf(field);
    if (c < 0 || row < 0 || row >= this.size) throw new RangeError(`WeGridColumnStore.set: no cell ${field}[${row}]`);
    const column = this.columns[c];
    this.invalidate();
    const v = value === undefined ? null : value;
    if (column.kind === 'int' && (v === null || typeof v === 'number')) {
      const q = v === null ? null : Math.round((v as number) * column.scale);
      const code = q === null ? 0 : q - column.min + 1;
      const max = column.codes instanceof Uint8Array ? 0xff : column.codes instanceof Uint16Array ? 0xffff : 0xffffffff;
      if (q === null || (q / column.scale === v && code >= 1 && code <= max)) {
        column.codes[row] = code;
        column.top = Math.max(column.top, code);
        return;
      }
    }
    if ((column.kind === 'f64' && (v === null || typeof v === 'number')) || (column.kind === 'date' && (v === null || v instanceof Date))) {
      column.data[row] = v === null ? NaN : v instanceof Date ? v.getTime() : (v as number);
      return;
    }
    if (column.kind === 'any') {
      column.data[row] = v;
      return;
    }
    if (column.kind === 'dict' && (v === null || typeof v !== 'object')) {
      column.index ??= new Map(column.values.map((x, i) => [x, i]));
      const code = column.index.get(v);
      if (code !== undefined) {
        column.codes[row] = code;
        return;
      }
    }
    // Re-encode the column with the new value in it
    const values = new Array<unknown>(this.size);
    for (let i = 0; i < this.size; i++) values[i] = decode(column, i);
    values[row] = v;
    this.columns[c] = encodeColumn(values);
  }

  /** How each column is stored and what it costs — for a memory readout */
  describe(): WeGridStoredColumnInfo[] {
    return this.fields.map((field, i) => {
      const c = this.columns[i];
      const bytes = c.kind === 'seq' ? 0 : c.kind === 'int' || c.kind === 'dict' ? c.codes.byteLength : c.kind === 'any' ? c.data.length * 8 : c.data.byteLength;
      return { field, encoding: c.kind, bytes, ...(c.kind === 'dict' ? { distinct: c.values.length - 1 } : {}) };
    });
  }

  /** Rows of the sorted, filtered and searched result — the `WeGridDataSource` the grid calls */
  load(request: WeGridDataRequest): WeGridDataPage<T> {
    const order = this.order(request);
    const total = order ? order.length : this.size;
    const start = Math.max(0, Math.min(total, Math.floor(request.offset)));
    const end = Math.max(start, Math.min(total, start + Math.floor(request.limit)));
    const rows = new Array<T>(end - start);
    for (let i = start; i < end; i++) rows[i - start] = this.row(order ? order[i] : i);
    return { rows, total };
  }

  /**
   * Row indices of the result in display order; null means every row in stored order. The last
   * query is kept, so scrolling through the same result doesn't repeat the work.
   */
  order(request: Omit<WeGridDataRequest, 'offset' | 'limit'>): Uint32Array | null {
    const groupBy = request.groupBy ?? [];
    const unknown = groupBy.filter((f) => !this.fields.includes(f));
    if (unknown.length) throw new Error(`WeGridColumnStore: no field ${unknown.join(', ')} to group by`);
    const key = JSON.stringify([request.sort ?? [], request.filters ?? [], request.search ?? '', request.locale ?? '', groupBy]);
    if (this.lastQuery?.key === key) return this.lastQuery.order;
    let order = this.match(request);
    if (request.sort?.length || groupBy.length) {
      if (!order) {
        order = new Uint32Array(this.size);
        for (let i = 0; i < this.size; i++) order[i] = i;
      }
      for (let k = (request.sort?.length ?? 0) - 1; k >= 0; k--) order = this.sortBy(order, request.sort![k].field, request.sort![k].direction);
      // Then group by group, innermost level first — each pass is stable, so the sort holds inside a group
      for (let level = groupBy.length - 1; level >= 0; level--) {
        order = weGridRadixSort(order, [this.groupRanks(this.fields.indexOf(groupBy[level]), request.locale).ranks]);
      }
    }
    this.lastQuery = { key, order };
    return order;
  }

  /** Distinct values of a column within the result of the filters, sorted — a checklist's options */
  distinct(field: string, request: Omit<WeGridDataRequest, 'offset' | 'limit'> = {}, limit = Infinity): unknown[] {
    const c = this.fields.indexOf(field);
    if (c < 0) return [];
    const column = this.columns[c];
    const order = this.match(request);
    const count = order ? order.length : this.size;
    const seen = new Set<unknown>();
    if (column.kind === 'dict') {
      const hit = new Uint8Array(column.values.length);
      for (let i = 0; i < count; i++) hit[column.codes[order ? order[i] : i]] = 1;
      column.values.forEach((v, code) => hit[code] && seen.add(v));
    } else {
      for (let i = 0; i < count; i++) seen.add(decode(column, order ? order[i] : i));
    }
    return Array.from(seen)
      .sort((a, b) => weGridCompareSortValues(a, b, 'asc'))
      .slice(0, limit);
  }

  /** The grid's checklist header filter, listing values across the whole store */
  readonly checklistValues = (request: WeGridChecklistValuesRequest): Observable<WeGridChecklistValuesResult> => of(this.checklist(request));

  /** What `checklistValues` answers, synchronously — a worker store asks this across the thread */
  checklist(request: WeGridChecklistValuesRequest): WeGridChecklistValuesResult {
    const needle = weGridFoldCase(request.search ?? '');
    const values = this.distinct(request.field, { filters: request.filters }).filter(
      (v) => !needle || weGridFoldCase(String(v ?? '')).includes(needle)
    );
    return { values: values.slice(0, request.limit).map((value) => ({ value })), hasMore: values.length > request.limit };
  }

  /**
   * sum / avg / min / max / count of a column over the result of the filters and search — by the
   * summary row's rules: count counts the non-empty cells, the rest take the cells that are numbers.
   */
  aggregate(
    field: string,
    fn: 'sum' | 'avg' | 'min' | 'max' | 'count',
    request: Omit<WeGridDataRequest, 'offset' | 'limit'> = {},
    weightField?: string
  ): number | null {
    if (!this.fields.includes(field)) return null;
    const rows = this.match(request);
    const acc = this.accumulator({ field, fn, weightField });
    const count = rows ? rows.length : this.size;
    for (let i = 0; i < count; i++) acc.add(0, rows ? rows[i] : i);
    return acc.result(0);
  }

  // ─── Grouping ─────────────────────────────────────────────────────

  /**
   * The groups of the filtered and searched result, nested by `groupBy`, with their row counts,
   * offsets into `load({ groupBy })` and the requested subtotals. A hash aggregation over the
   * columns' codes: fifty million rows by two dictionary columns is one pass.
   */
  groups(request: WeGridGroupRequest): WeGridGroupNode[] {
    const unknown = request.groupBy.filter((f) => !this.fields.includes(f));
    if (unknown.length) throw new Error(`WeGridColumnStore.groups: no field ${unknown.join(', ')} to group by`);
    const levels = request.groupBy.map((f) => this.fields.indexOf(f));
    if (levels.length === 0) return [];
    const rows = this.match(request);
    const count = rows ? rows.length : this.size;
    const ranked = levels.map((c) => this.groupRanks(c, request.locale));
    const sizes = ranked.map((r) => r.values.length);
    const specs = (request.aggregates ?? []).filter((a) => this.fields.includes(a.field));
    const accs = specs.map((spec) => this.accumulator(spec));

    // One id per distinct combination of the levels' ranks — a table when the combinations are few
    const combos = sizes.reduce((a, b) => a * b, 1);
    if (combos > Number.MAX_SAFE_INTEGER) throw new Error('WeGridColumnStore.groups: too many fields with too many values to group by at once');
    const table = combos <= 1 << 24 ? new Int32Array(combos).fill(-1) : null;
    const map = table ? null : new Map<number, number>();
    const keys: number[] = [];
    const counts: number[] = [];
    for (let i = 0; i < count; i++) {
      const row = rows ? rows[i] : i;
      let key = 0;
      for (let l = 0; l < ranked.length; l++) key = key * sizes[l] + ranked[l].ranks[row];
      let id = table ? table[key] : (map!.get(key) ?? -1);
      if (id < 0) {
        id = keys.length;
        if (id >= GROUP_LIMIT) throw new Error(`WeGridColumnStore.groups: more than ${GROUP_LIMIT} groups — group by a coarser field`);
        keys.push(key);
        counts.push(0);
        if (table) table[key] = id;
        else map!.set(key, id);
      }
      counts[id]++;
      for (const acc of accs) acc.add(id, row);
    }

    // Combination keys sort in group order, level by level, since ranks do
    const ids = keys.map((_, id) => id).sort((a, b) => keys[a] - keys[b]);
    const roots: WeGridGroupNode[] = [];
    const stack: { node: WeGridGroupNode; rank: number; ids: number[] }[] = [];
    const covered: { node: WeGridGroupNode; ids: number[] }[] = [];
    let start = 0;
    for (const id of ids) {
      // Ranks of this combination, outermost first
      const path: number[] = new Array(ranked.length);
      for (let l = ranked.length - 1, k = keys[id]; l >= 0; l--) {
        path[l] = k % sizes[l];
        k = Math.floor(k / sizes[l]);
      }
      let depth = 0;
      while (depth < stack.length && stack[depth].rank === path[depth]) depth++;
      stack.length = depth;
      for (let l = depth; l < ranked.length; l++) {
        const value = ranked[l].values[path[l]];
        const node: WeGridGroupNode = {
          field: this.fields[levels[l]],
          level: l,
          value: value === undefined ? null : value,
          key: value === null || value === undefined || value === '' ? '' : String(value),
          start,
          count: 0,
          aggregates: {},
          ...(l < ranked.length - 1 ? { children: [] } : {})
        };
        (l === 0 ? roots : stack[l - 1].node.children!).push(node);
        const entry = { node, rank: path[l], ids: [] as number[] };
        stack.push(entry);
        covered.push(entry);
      }
      for (const entry of stack) {
        entry.node.count += counts[id];
        entry.ids.push(id);
      }
      start += counts[id];
    }
    // Subtotals: every node merges the combinations under it
    for (const { node, ids: under } of covered) specs.forEach((spec, k) => (node.aggregates[spec.key ?? spec.field] = accs[k].merge(under)));
    return roots;
  }

  /**
   * Each row's group rank for a column — 0 for the empty group, then in `weGridCompareGroupValues`
   * order — and the value of every rank. Values that read the same (5 and '5') share a group.
   */
  private groupRanks(c: number, locale?: string): { ranks: Uint32Array; values: unknown[] } {
    const cacheKey = `${c}|${locale ?? ''}`;
    const cached = this.rankCache.get(cacheKey);
    if (cached) return cached;
    const column = this.columns[c];
    const keyOf = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v));
    const n = this.size;
    // Distinct values first: per code where the column has codes, per row otherwise
    let codeValues: unknown[] | null = null;
    let codes: Codes | null = null;
    if (column.kind === 'dict') {
      codeValues = column.values;
      codes = column.codes;
    } else if (column.kind === 'int' && column.top < MASK_CODE_LIMIT) {
      codeValues = Array.from({ length: column.top + 1 }, (_, code) => (code === 0 ? null : (code - 1 + column.min) / column.scale));
      codes = column.codes;
    }
    const idOfKey = new Map<string, number>([['', 0]]);
    const reps: unknown[] = [null];
    const idOf = (v: unknown): number => {
      const k = keyOf(v);
      let id = idOfKey.get(k);
      if (id === undefined) {
        id = reps.length;
        if (id >= GROUP_LIMIT) throw new Error(`WeGridColumnStore.groups: more than ${GROUP_LIMIT} groups in ${this.fields[c]} — group by a coarser field`);
        idOfKey.set(k, id);
        reps.push(v);
      }
      return id;
    };
    const rawIds = new Uint32Array(n);
    if (codeValues && codes) {
      const idOfCode = Uint32Array.from(codeValues, (v) => idOf(v));
      for (let i = 0; i < n; i++) rawIds[i] = idOfCode[codes[i]];
    } else {
      for (let i = 0; i < n; i++) rawIds[i] = idOf(decode(column, i));
    }
    // Ranks in group order; the empty group stays rank 0
    const order = reps.map((_, id) => id).sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : weGridCompareGroupValues(reps[a], reps[b], locale)));
    const rankOfId = new Uint32Array(reps.length);
    order.forEach((id, rank) => (rankOfId[id] = rank));
    for (let i = 0; i < n; i++) rawIds[i] = rankOfId[rawIds[i]];
    const result = { ranks: rawIds, values: order.map((id) => reps[id]) };
    this.rankCache.set(cacheKey, result);
    return result;
  }

  /**
   * Running subtotal of one column, per group id, by the summary row's rules — `add` a row to a
   * group, `merge` groups into one figure
   */
  private accumulator(spec: WeGridGroupAggregate): { add(id: number, row: number): void; result(id: number): number | null; merge(ids: number[]): number | null } {
    const read = this.numberReader(this.fields.indexOf(spec.field), spec.numbersOnly);
    const present = spec.numbersOnly ? (row: number) => !Number.isNaN(read(row)) : this.presenceReader(this.fields.indexOf(spec.field));
    const weight = spec.fn === 'avg' && spec.weightField && this.fields.includes(spec.weightField) ? this.numberReader(this.fields.indexOf(spec.weightField)) : null;
    const n: number[] = [];
    const sum: number[] = [];
    const min: number[] = [];
    const max: number[] = [];
    const weights: number[] = [];
    const add = (id: number, row: number): void => {
      if (n[id] === undefined) {
        n[id] = sum[id] = weights[id] = 0;
        min[id] = Infinity;
        max[id] = -Infinity;
      }
      if (spec.fn === 'count') {
        if (present(row)) n[id]++;
        return;
      }
      const x = read(row);
      if (Number.isNaN(x)) return;
      if (weight) {
        const w = weight(row);
        if (Number.isNaN(w)) return;
        sum[id] += x * w;
        weights[id] += w;
        return;
      }
      n[id]++;
      sum[id] += x;
      if (x < min[id]) min[id] = x;
      if (x > max[id]) max[id] = x;
    };
    const finish = (count: number, total: number, low: number, high: number, w: number): number | null => {
      if (spec.fn === 'count') return count;
      if (weight) return w === 0 ? null : total / w;
      if (count === 0) return null;
      return spec.fn === 'sum' ? total : spec.fn === 'avg' ? total / count : spec.fn === 'min' ? low : high;
    };
    return {
      add,
      result: (id) => finish(n[id] ?? 0, sum[id] ?? 0, min[id] ?? Infinity, max[id] ?? -Infinity, weights[id] ?? 0),
      merge: (ids) => {
        let count = 0;
        let total = 0;
        let low = Infinity;
        let high = -Infinity;
        let w = 0;
        for (const id of ids) {
          if (n[id] === undefined) continue;
          count += n[id];
          total += sum[id];
          w += weights[id];
          if (min[id] < low) low = min[id];
          if (max[id] > high) high = max[id];
        }
        return finish(count, total, low, high, w);
      }
    };
  }

  /**
   * A cell as a number the way the summary row reads it — NaN for an empty or non-numeric cell. With
   * `numbersOnly`, only a cell that holds a number reads as one (no numeric text, no dates).
   */
  private numberReader(c: number, numbersOnly = false): (row: number) => number {
    const column = this.columns[c];
    const toNumber = (v: unknown): number =>
      numbersOnly
        ? typeof v === 'number' ? v : NaN
        : v === null || v === undefined || v === '' ? NaN : v instanceof Date ? v.getTime() : Number(v);
    if (numbersOnly && column.kind === 'date') return () => NaN;
    switch (column.kind) {
      case 'int':
        return (row) => {
          const code = column.codes[row];
          return code === 0 ? NaN : (code - 1 + column.min) / column.scale;
        };
      case 'f64':
      case 'date':
        return (row) => column.data[row];
      case 'seq':
        return (row) => column.start + row * column.step;
      case 'dict': {
        const numbers = Float64Array.from(column.values, toNumber);
        return (row) => numbers[column.codes[row]];
      }
      default:
        return (row) => toNumber(column.data[row]);
    }
  }

  /** Whether a cell has a value — what count counts */
  private presenceReader(c: number): (row: number) => boolean {
    const column = this.columns[c];
    switch (column.kind) {
      case 'int':
        return (row) => column.codes[row] !== 0;
      case 'f64':
      case 'date':
        return (row) => !Number.isNaN(column.data[row]);
      case 'seq':
        return () => true;
      case 'dict': {
        const has = Uint8Array.from(column.values, (v) => (v === null || v === undefined || v === '' ? 0 : 1));
        return (row) => has[column.codes[row]] === 1;
      }
      default:
        return (row) => {
          const v = column.data[row];
          return v !== null && v !== undefined && v !== '';
        };
    }
  }

  // ─── Filtering and search ─────────────────────────────────────────

  /** Rows that pass the filters and the search, in stored order; null when nothing narrows them */
  private match(request: Omit<WeGridDataRequest, 'offset' | 'limit'>): Uint32Array | null {
    const key = JSON.stringify([request.filters ?? [], request.search ?? '', request.locale ?? '', request.columns?.map((c) => [c.field, c.type]) ?? []]);
    if (this.lastMatch?.key === key) return this.lastMatch.rows;
    const rows = this.matchRows(request);
    this.lastMatch = { key, rows };
    return rows;
  }

  private matchRows(request: Omit<WeGridDataRequest, 'offset' | 'limit'>): Uint32Array | null {
    const filters = (request.filters ?? []).filter((f) => isWeGridFilterActive(f) && this.fields.includes(f.field));
    const words = weGridFoldCase(request.search ?? '', request.locale).split(/\s+/).filter(Boolean);
    if (filters.length === 0 && words.length === 0) return null;
    const keep = new Uint8Array(this.size).fill(1);
    const typeOf = (field: string): WeGridColumnType =>
      request.columns?.find((c) => c.field === field)?.type ?? inferType(this.columns[this.fields.indexOf(field)]);
    // What the text filters lowercase with
    const locale = { intlLocale: request.locale ?? 'en-US' };
    for (const filter of filters) {
      const type = typeOf(filter.field);
      this.narrow(keep, this.fields.indexOf(filter.field), (v) => weGridValueMatchesFilter(v, filter, type, locale));
    }
    if (words.length > 0) this.search(keep, words, request);
    let count = 0;
    for (let i = 0; i < this.size; i++) count += keep[i];
    const order = new Uint32Array(count);
    for (let i = 0, j = 0; i < this.size; i++) if (keep[i]) order[j++] = i;
    return order;
  }

  /** Clears `keep` for rows whose value fails — tested once per distinct code where the column has codes */
  private narrow(keep: Uint8Array, c: number, test: (value: unknown) => boolean): void {
    const column = this.columns[c];
    const mask = this.codeMask(column, test);
    if (mask && (column.kind === 'dict' || column.kind === 'int')) {
      const codes = column.codes;
      for (let i = 0; i < this.size; i++) if (keep[i] && !mask[codes[i]]) keep[i] = 0;
      return;
    }
    for (let i = 0; i < this.size; i++) if (keep[i] && !test(decode(column, i))) keep[i] = 0;
  }

  /** One pass/fail per code of a dictionary or a narrow integer column; null when a per-row test is cheaper */
  private codeMask(column: StoreColumn, test: (value: unknown) => boolean): Uint8Array | null {
    if (column.kind === 'dict') return Uint8Array.from(column.values, (v) => (test(v) ? 1 : 0));
    if (column.kind === 'int') {
      if (column.top >= MASK_CODE_LIMIT) return null;
      const mask = new Uint8Array(column.top + 1);
      for (let code = 0; code <= column.top; code++) mask[code] = test(code === 0 ? null : (code - 1 + column.min) / column.scale) ? 1 : 0;
      return mask;
    }
    return null;
  }

  /** Every word must appear in the cell text of some searched column */
  private search(keep: Uint8Array, words: string[], request: Omit<WeGridDataRequest, 'offset' | 'limit'>): void {
    const columns: WeGridDataColumn[] = request.columns?.length ? [...request.columns] : this.fields.map((field) => ({ field, type: 'text' as const }));
    const lower = (s: string): string => weGridFoldCase(s, request.locale);
    for (const word of words) {
      const found = new Uint8Array(this.size);
      for (const col of columns) {
        const c = this.fields.indexOf(col.field);
        if (c < 0) continue;
        const column = this.columns[c];
        const spec = col.formatSpec;
        const show = col.format ?? (spec ? (v: unknown) => formatWeGridColumnValue(v, { type: col.type, format: spec.format, minorUnits: spec.minorUnits }, spec.options) : String);
        const text = (v: unknown): string => lower(v === null || v === undefined ? '' : show(v));
        if (!this.mayContain(column, text, word)) continue;
        const mask = this.codeMask(column, (v) => text(v).includes(word));
        if (mask && (column.kind === 'dict' || column.kind === 'int')) {
          const codes = column.codes;
          for (let i = 0; i < this.size; i++) if (keep[i] && mask[codes[i]]) found[i] = 1;
        } else {
          for (let i = 0; i < this.size; i++) if (keep[i] && !found[i] && text(decode(column, i)).includes(word)) found[i] = 1;
        }
      }
      for (let i = 0; i < this.size; i++) keep[i] &= found[i];
    }
  }

  /**
   * shortcut: a number or date column is formatted row by row, so it is skipped when the word has a
   * character that none of its sampled cell texts (first 256 rows) has — a formatter whose output
   * characters vary by value beyond that sample could be missed; sample every distinct value if one does.
   */
  private mayContain(column: StoreColumn, text: (v: unknown) => string, word: string): boolean {
    if (column.kind === 'dict' || column.kind === 'any') return true;
    const chars = new Set('0123456789');
    for (let i = 0; i < Math.min(256, this.size); i++) for (const ch of text(decode(column, i))) chars.add(ch);
    for (const ch of word) if (!chars.has(ch)) return false;
    return true;
  }

  // ─── Sorting ──────────────────────────────────────────────────────

  private sortBy(order: Uint32Array, field: string, direction: 'asc' | 'desc'): Uint32Array {
    const c = this.fields.indexOf(field);
    if (c < 0) return order;
    const column = this.columns[c];
    const descending = direction === 'desc';
    let words: WeGridRadixWord[] | null = null;
    let flip = false;
    switch (column.kind) {
      case 'int':
        words = [column.codes];
        break;
      case 'dict':
        words = column.sorted ? [column.codes] : null;
        break;
      case 'f64':
      case 'date':
        words = weGridFloatSortWords(column.data);
        break;
      case 'seq': {
        // Row order is value order (reversed for a falling sequence)
        const rows = new Uint32Array(this.size);
        for (let i = 0; i < this.size; i++) rows[i] = i;
        words = [rows];
        flip = column.step < 0;
        break;
      }
    }
    if (words) return weGridRadixSort(order, words, descending !== flip);
    const position = new Uint32Array(this.size);
    order.forEach((row, i) => (position[row] = i));
    return Uint32Array.from(
      Array.from(order).sort((a, b) => weGridCompareSortValues(decode(column, a), decode(column, b), direction) || position[a] - position[b])
    );
  }
}
