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
  if (direction === 'desc') {
    for (const word of words) for (let i = 0; i < word.length; i++) word[i] = ~word[i] >>> 0;
  }
  return radixSort(order, words);
}

/** Unsigned keys whose order is the values' order, least significant word first — null when the column can't be encoded */
function encodeKey(column: unknown[]): Uint32Array[] | null {
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
  // IEEE 754 bits made sortable as unsigned: negative numbers get every bit flipped, the rest only the sign bit
  const floats = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = column[i];
    const x = v == null ? NaN : v instanceof Date ? v.getTime() : (v as number);
    floats[i] = Number.isNaN(x) ? -Infinity : x === 0 ? 0 : x;
  }
  const raw = new Uint32Array(floats.buffer);
  const lo = new Uint32Array(n);
  const hi = new Uint32Array(n);
  const little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  for (let i = 0; i < n; i++) {
    const h = raw[2 * i + (little ? 1 : 0)];
    const l = raw[2 * i + (little ? 0 : 1)];
    const negative = h >>> 31 === 1;
    hi[i] = negative ? ~h >>> 0 : (h | 0x80000000) >>> 0;
    lo[i] = negative ? ~l >>> 0 : l;
  }
  return [lo, hi];
}

/** Stable LSD radix sort of row indices by the words (least significant first), 16 bits a pass */
function radixSort(order: Uint32Array, words: Uint32Array[]): Uint32Array {
  const n = order.length;
  let src = order;
  let dst = new Uint32Array(n);
  const count = new Uint32Array(65536);
  for (const word of words) {
    for (let shift = 0; shift < 32; shift += 16) {
      count.fill(0);
      for (let i = 0; i < n; i++) count[(word[src[i]] >>> shift) & 0xffff]++;
      // Every row has the same digit — the pass would not move anything
      if (count[(word[src[0]] >>> shift) & 0xffff] === n) continue;
      let sum = 0;
      for (let d = 0; d < 65536; d++) {
        const c = count[d];
        count[d] = sum;
        sum += c;
      }
      for (let i = 0; i < n; i++) {
        const row = src[i];
        dst[count[(word[row] >>> shift) & 0xffff]++] = row;
      }
      [src, dst] = [dst, src];
    }
  }
  return src;
}
