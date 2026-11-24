import { weGridHeaderBands } from './we-grid-header-bands.util';

describe('weGridHeaderBands', () => {
  const col = (field: string, headerGroup: string | null, pinned: 'left' | 'right' | null = null) => ({ field, headerGroup, pinned });
  const shape = (cols: ReturnType<typeof col>[]) => weGridHeaderBands(cols).map((b) => [b.label, b.columns.map((c) => c.field)]);

  it('joins neighbours of the same group and leaves empty bands over ungrouped columns', () => {
    expect(shape([col('id', null), col('q1', 'Sales'), col('q2', 'Sales'), col('cost', 'Costs'), col('note', null), col('memo', null)])).toEqual([
      [null, ['id']],
      ['Sales', ['q1', 'q2']],
      ['Costs', ['cost']],
      [null, ['note', 'memo']]
    ]);
  });

  it('splits a group that a moved column or a pin cuts through', () => {
    expect(shape([col('q1', 'Sales'), col('x', null), col('q2', 'Sales')])).toEqual([
      ['Sales', ['q1']],
      [null, ['x']],
      ['Sales', ['q2']]
    ]);
    expect(shape([col('q1', 'Sales', 'left'), col('q2', 'Sales')])).toEqual([
      ['Sales', ['q1']],
      ['Sales', ['q2']]
    ]);
  });

  it('gives nothing for no columns', () => {
    expect(weGridHeaderBands([])).toEqual([]);
  });
});
