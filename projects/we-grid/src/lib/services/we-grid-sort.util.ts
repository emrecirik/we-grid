import { WeGridSortDirection } from '../models/we-grid-column.model';

/** Empty values sort first ascending and last descending; everything else by `<` */
export function weGridCompareSortValues(va: unknown, vb: unknown, direction: WeGridSortDirection): number {
  if (va == null && vb == null) return 0;
  if (va == null) return direction === 'asc' ? -1 : 1;
  if (vb == null) return direction === 'asc' ? 1 : -1;
  if ((va as never) < (vb as never)) return direction === 'asc' ? -1 : 1;
  if ((va as never) > (vb as never)) return direction === 'asc' ? 1 : -1;
  return 0;
}

/**
 * The order of rows sorted by one or more key columns (`keys[k][row]`), stable — the same order
 * weGridCompareSortValues gives, without comparing. Number, Date and string columns become
 * unsigned integer keys (strings through a sorted dictionary) and go through an LSD radix sort,
 * one stable pass per key from the last to the first; a million rows take tens of milliseconds
 * instead of seconds. Columns of other or mixed types fall back to a stable comparison sort.
 * NaN and invalid dates sort with the empty values.
 */
export function weGridSortedIndices(keys: unknown[][], directions: WeGridSortDirection[]): Uint32Array {
  const n = keys.length > 0 ? keys[0].length : 0;
  let order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  if (n < 2) return order;
  for (let k = keys.length - 1; k >= 0; k--) order = sortByKey(order, keys[k], directions[k]);
  return order;
}

function sortByKey(order: Uint32Array, column: unknown[], direction: WeGridSortDirection): Uint32Array {
  const words = encodeKey(column);
  if (!words) {
    const position = new Uint32Array(order.length);
    order.forEach((row, i) => (position[row] = i));
    return Uint32Array.from(Array.from(order).sort((a, b) => weGridCompareSortValues(column[a], column[b], direction) || position[a] - position[b]));
  }
  return weGridRadixSort(order, words, direction === 'desc');
}

/** Unsigned keys whose order is the values' order, least significant word first — null when the column can't be encoded */
function encodeKey(column: unknown[]): WeGridRadixWord[] | null {
  const n = column.length;
  let kind: 'number' | 'string' | null = null;
  for (let i = 0; i < n; i++) {
    const v = column[i];
    if (v == null) continue;
    const k = typeof v === 'number' || v instanceof Date ? 'number' : typeof v === 'string' ? 'string' : null;
    if (k === null || (kind !== null && kind !== k)) return null;
    kind = k;
  }
  if (kind === 'string') {
    const unique = Array.from(new Set(column.filter((v): v is string => typeof v === 'string'))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const rank = new Map(unique.map((v, i) => [v, i + 1]));
    // 0 is the empty value, so it sorts first
    return [Uint32Array.from(column, (v) => (typeof v === 'string' ? (rank.get(v) as number) : 0))];
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = column[i];
    values[i] = v == null ? NaN : v instanceof Date ? v.getTime() : (v as number);
  }
  return weGridFloatSortWords(values);
}

/** A key word the radix sort reads by row index — a typed array of unsigned values below 2^32 */
export type WeGridRadixWord = Uint8Array | Uint16Array | Uint32Array;

/**
 * Stable LSD radix sort of row indices (`order`) by unsigned key words read as `word[row]`, least
 * significant word first, 16 bits a pass. Descending runs the buckets from the top, so a column's
 * own code array can be the key without a flipped copy.
 */
export function weGridRadixSort(order: Uint32Array, words: readonly WeGridRadixWord[], descending = false): Uint32Array {
  const n = order.length;
  if (n < 2) return order;
  let src = order;
  let dst = new Uint32Array(n);
  // The key travels with the order, so passes read it in sequence instead of jumping through `word`
  let keys = new Uint32Array(n);
  let keysDst = new Uint32Array(n);
  const count = new Uint32Array(65536);
  for (const word of words) {
    const bits = word.BYTES_PER_ELEMENT * 8;
    for (let i = 0; i < n; i++) keys[i] = word[src[i]];
    for (let shift = 0; shift < bits; shift += 16) {
      count.fill(0);
      for (let i = 0; i < n; i++) count[(keys[i] >>> shift) & 0xffff]++;
      // Every row has the same digit — the pass would not move anything
      if (count[(keys[0] >>> shift) & 0xffff] === n) continue;
      let sum = 0;
      if (descending) {
        for (let d = 65535; d >= 0; d--) {
          const c = count[d];
          count[d] = sum;
          sum += c;
        }
      } else {
        for (let d = 0; d < 65536; d++) {
          const c = count[d];
          count[d] = sum;
          sum += c;
        }
      }
      for (let i = 0; i < n; i++) {
        const key = keys[i];
        const at = count[(key >>> shift) & 0xffff]++;
        dst[at] = src[i];
        keysDst[at] = key;
      }
      [src, dst] = [dst, src];
      [keys, keysDst] = [keysDst, keys];
    }
  }
  return src;
}

/** IEEE 754 doubles as two unsigned words (low, high) in numeric order — NaN as -Infinity */
export function weGridFloatSortWords(values: ArrayLike<number>): [Uint32Array, Uint32Array] {
  const n = values.length;
  const floats = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = values[i];
    floats[i] = Number.isNaN(x) ? -Infinity : x === 0 ? 0 : x;
  }
  const raw = new Uint32Array(floats.buffer);
  const lo = new Uint32Array(n);
  const hi = new Uint32Array(n);
  const little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  // Negative numbers get every bit flipped, the rest only the sign bit
  for (let i = 0; i < n; i++) {
    const h = raw[2 * i + (little ? 1 : 0)];
    const l = raw[2 * i + (little ? 0 : 1)];
    const negative = h >>> 31 === 1;
    hi[i] = negative ? ~h >>> 0 : (h | 0x80000000) >>> 0;
    lo[i] = negative ? ~l >>> 0 : l;
  }
  return [lo, hi];
}
