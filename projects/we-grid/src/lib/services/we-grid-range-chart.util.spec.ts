import { weGridRangeChartData, weGridRangeChartRepeats, weGridRangeChartSheet, WeGridRangeChartSpec } from './we-grid-range-chart.util';

interface Sale {
  city: string;
  code: number;
  qty: number | null;
  amount: number;
}

describe('we-grid-range-chart.util', () => {
  const rows: Sale[] = [
    { city: 'İzmir', code: 35, qty: 2, amount: 10 },
    { city: 'Ankara', code: 6, qty: null, amount: 4 },
    { city: 'İzmir', code: 35, qty: 5, amount: 1 }
  ];
  const spec = (over: Partial<WeGridRangeChartSpec<Sale>> = {}): WeGridRangeChartSpec<Sale> => ({
    category: { label: (r) => r.city, raw: (r) => r.code },
    series: [
      { name: 'Qty', value: (r) => r.qty },
      { name: 'Amount', value: (r) => r.amount }
    ],
    aggregate: 'none',
    ...over
  });

  it('charts one point per row without combining', () => {
    const { data, raws } = weGridRangeChartData(rows, spec());
    expect(data.categories).toEqual(['İzmir', 'Ankara', 'İzmir']);
    expect(data.series[0].values).toEqual([2, null, 5]);
    expect(raws).toEqual([35, 6, 35]);
  });

  it('combines rows of the same category with each function, first-seen order', () => {
    const run = (aggregate: WeGridRangeChartSpec<Sale>['aggregate']) => weGridRangeChartData(rows, spec({ aggregate })).data;
    expect(run('sum').categories).toEqual(['İzmir', 'Ankara']);
    expect(run('sum').series.map((s) => s.values)).toEqual([[7, null], [11, 4]]);
    expect(run('avg').series[1].values).toEqual([5.5, 4]);
    expect(run('count').series[0].values).toEqual([2, 0]);
    expect(run('min').series[1].values).toEqual([1, 4]);
    expect(run('max').series[1].values).toEqual([10, 4]);
    expect(weGridRangeChartData(rows, spec({ aggregate: 'sum' })).raws).toEqual([35, 6]);
  });

  it('numbers the rows when there is no category column', () => {
    const { data, raws } = weGridRangeChartData(rows, spec({ category: null }));
    expect(data.categories).toEqual(['1', '2', '3']);
    expect(raws).toEqual([]);
  });

  it('swaps series and categories', () => {
    const { data, raws } = weGridRangeChartData(rows, spec({ aggregate: 'sum', switched: true }));
    expect(data.categories).toEqual(['Qty', 'Amount']);
    expect(data.series).toEqual([
      { name: 'İzmir', values: [7, 11] },
      { name: 'Ankara', values: [null, 4] }
    ]);
    expect(raws).toEqual([]);
  });

  it('tells whether a category repeats', () => {
    expect(weGridRangeChartRepeats(rows, (r) => r.city)).toBeTrue();
    expect(weGridRangeChartRepeats(rows.slice(0, 2), (r) => r.city)).toBeFalse();
  });

  it('writes the data as a table with a native Excel chart beside it', () => {
    const data = weGridRangeChartData(rows, spec({ aggregate: 'sum' })).data;
    const sheet = weGridRangeChartSheet('Chart', 'City', data, 'column');
    expect(sheet.cells.find((c) => c.ref === 'C3')?.value).toBe(4);
    expect(sheet.chart).toEqual({
      type: 'column',
      categories: 'A2:A3',
      series: [
        { name: 'B1', values: 'B2:B3' },
        { name: 'C1', values: 'C2:C3' }
      ],
      at: { col: 4, row: 1 }
    });
    expect(weGridRangeChartSheet('Chart', 'City', data, 'pie').chart?.series.length).toBe(1);
    expect(weGridRangeChartSheet('Chart', 'City', data, 'funnel').chart).toBeUndefined();
  });
});
