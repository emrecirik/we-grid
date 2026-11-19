import { weGridCompareSortValues, weGridSortedIndices } from './we-grid-sort.util';

describe('weGridSortedIndices', () => {
  it('sorts numbers both ways with empty values first ascending and last descending', () => {
    const values = [3, null, 1, undefined, 2, NaN];
    expect(Array.from(weGridSortedIndices([values], ['asc']))).toEqual([1, 3, 5, 2, 4, 0]);
    expect(Array.from(weGridSortedIndices([values], ['desc']))).toEqual([0, 4, 2, 1, 3, 5]);
  });

  it('is stable and uses the next key for ties', () => {
    const city = ['B', 'A', 'B', 'A'];
    const qty = [1, 5, 9, 5];
    expect(Array.from(weGridSortedIndices([city], ['asc']))).toEqual([1, 3, 0, 2]);
    expect(Array.from(weGridSortedIndices([city, qty], ['asc', 'desc']))).toEqual([1, 3, 2, 0]);
  });

  // Values no typed key can hold (booleans here) take the comparison sort — mixing strings and numbers
  // would make `<` itself inconsistent ('b' and 2 compare equal), and then no order is the right one
  it('falls back to the generic comparison, stable, for values it cannot encode', () => {
    const values: unknown[] = [true, null, false, true, undefined, false, true];
    const generic = values.map((_, i) => i).sort((a, b) => weGridCompareSortValues(values[a], values[b], 'asc') || a - b);
    expect(Array.from(weGridSortedIndices([values], ['asc']))).toEqual(generic);
    expect(generic).toEqual([1, 4, 2, 5, 0, 3, 6]);
    expect(Array.from(weGridSortedIndices([values], ['desc']))).toEqual([0, 3, 6, 2, 5, 1, 4]);
  });

  it('gives the comparison order for random numbers, strings and dates over several keys', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = <V>(make: () => V): (V | null)[] => Array.from({ length: 3000 }, () => (rnd() < 0.05 ? null : make()));
    const columns: unknown[][] = [
      pick(() => Math.floor(rnd() * 20) - 10),
      pick(() => (rnd() < 0.1 ? -0 : (rnd() - 0.5) * 1e12 * rnd() ** 8)),
      pick(() => ['', 'a', 'B', 'ç', 'z', 'Ab'][Math.floor(rnd() * 6)]),
      pick(() => new Date(Math.floor(rnd() * 1e12)))
    ];
    for (const dirs of [['asc', 'desc', 'asc', 'desc'], ['desc', 'asc', 'desc', 'asc']] as ('asc' | 'desc')[][]) {
      for (const order of [[0, 1], [2, 3, 0], [1], [3, 2]]) {
        const keys = order.map((c) => columns[c]);
        const d = order.map((c) => dirs[c]);
        const expected = columns[0].map((_, i) => i).sort((a, b) => {
          for (let k = 0; k < keys.length; k++) {
            const c = weGridCompareSortValues(keys[k][a], keys[k][b], d[k]);
            if (c) return c;
          }
          return a - b;
        });
        expect(Array.from(weGridSortedIndices(keys, d))).withContext(`${order} ${d}`).toEqual(expected);
      }
    }
  });

  it('handles an empty set', () => {
    expect(weGridSortedIndices([[]], ['asc']).length).toBe(0);
    expect(weGridSortedIndices([], []).length).toBe(0);
  });
});
