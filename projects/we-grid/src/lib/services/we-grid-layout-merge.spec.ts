import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WeGridLayout } from '../models/we-grid-layout.model';
import { mergeGridLayout, toColumnLayout } from './we-grid-layout-merge';

interface Row {
  code: string;
  name: string;
  status: string;
}

const baseColumns: WeGridColumnDef<Row>[] = [
  { field: 'code', header: 'Code' },
  { field: 'name', header: 'Name' },
  { field: 'status', header: 'Status' }
];

describe('mergeGridLayout', () => {
  it('uses the developer default order and visibility when there is no saved layout', () => {
    const result = mergeGridLayout(baseColumns, null, 1);

    expect(result.columns.map((c) => c.field)).toEqual(['code', 'name', 'status']);
    expect(result.columns.every((c) => c.visible)).toBeTrue();
    expect(result.density).toBeUndefined();
  });

  it('discards the saved layout entirely when version does not match', () => {
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'status', visible: false, order: 0, pinned: null },
        { field: 'code', visible: true, order: 1, pinned: null },
        { field: 'name', visible: true, order: 2, pinned: null }
      ]
    };

    const result = mergeGridLayout(baseColumns, saved, 2);

    expect(result.columns.map((c) => c.field)).toEqual(['code', 'name', 'status']);
    expect(result.columns.find((c) => c.field === 'status')?.visible).toBeTrue();
  });

  it('applies the saved order, visibility, and rename', () => {
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'status', visible: false, order: 0, pinned: 'left', headerOverride: 'State' },
        { field: 'code', visible: true, order: 1, pinned: null, width: 120 },
        { field: 'name', visible: true, order: 2, pinned: null }
      ]
    };

    const result = mergeGridLayout(baseColumns, saved, 1);

    expect(result.columns.map((c) => c.field)).toEqual(['status', 'code', 'name']);
    expect(result.columns[0].visible).toBeFalse();
    expect(result.columns[0].pinned).toBe('left');
    expect(result.columns[0].headerOverride).toBe('State');
    expect(result.columns[1].width).toBe(120);
  });

  it('appends a new column not present in the saved layout with default settings, at the end', () => {
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null },
        { field: 'name', visible: true, order: 1, pinned: null }
      ]
    };
    // status isn't in the saved layout — a newly added column scenario
    const result = mergeGridLayout(baseColumns, saved, 1);

    const statusCol = result.columns.find((c) => c.field === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol?.visible).toBeTrue();
    expect(result.columns[result.columns.length - 1].field).toBe('status');
  });

  it('silently drops a saved column no longer present in the columns definition', () => {
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null },
        { field: 'legacyField', visible: true, order: 1, pinned: null },
        { field: 'name', visible: true, order: 2, pinned: null },
        { field: 'status', visible: true, order: 3, pinned: null }
      ]
    };

    const result = mergeGridLayout(baseColumns, saved, 1);

    expect(result.columns.some((c) => c.field === 'legacyField')).toBeFalse();
    expect(result.columns.length).toBe(3);
  });

  it('takes density, sort, and pageSize from the saved layout', () => {
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      density: 'compact',
      sort: { field: 'name', direction: 'desc' },
      pageSize: 50,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null },
        { field: 'name', visible: true, order: 1, pinned: null },
        { field: 'status', visible: true, order: 2, pinned: null }
      ]
    };

    const result = mergeGridLayout(baseColumns, saved, 1);

    expect(result.density).toBe('compact');
    expect(result.sort).toEqual({ field: 'name', direction: 'desc' });
    expect(result.pageSize).toBe(50);
  });

  it('leaves every column\'s summary as "none" when there is no saved layout', () => {
    const result = mergeGridLayout(baseColumns, null, 1);
    expect(result.columns.every((c) => c.summary === 'none')).toBeTrue();
  });

  it('restores the saved summary function', () => {
    const numericColumns: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'code', header: 'Code' },
      { field: 'qty', header: 'Quantity', type: 'number' }
    ];
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null, summary: 'count' },
        { field: 'qty', visible: true, order: 1, pinned: null, summary: 'sum' }
      ]
    };

    const result = mergeGridLayout(numericColumns, saved, 1);

    expect(result.columns.find((c) => c.field === 'code')?.summary).toBe('count');
    expect(result.columns.find((c) => c.field === 'qty')?.summary).toBe('sum');
  });

  it('defensively falls back a saved sum/avg/min/max to "none" when the column type isn\'t numeric (count is always kept)', () => {
    // 'status' is a text type but was saved as 'avg' — the developer may have changed the column
    // type since; a meaningless "Average: NaN" must never leak through.
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null, summary: 'count' },
        { field: 'name', visible: true, order: 1, pinned: null },
        { field: 'status', visible: true, order: 2, pinned: null, summary: 'avg' }
      ]
    };

    const result = mergeGridLayout(baseColumns, saved, 1);

    expect(result.columns.find((c) => c.field === 'status')?.summary).toBe('none');
    expect(result.columns.find((c) => c.field === 'code')?.summary).toBe('count');
  });

  it('applies the developer\'s column-definition summary default when there is no saved choice', () => {
    const columns: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'code', header: 'Code' },
      { field: 'qty', header: 'Quantity', type: 'number', summary: 'sum' }
    ];

    const result = mergeGridLayout(columns, null, 1);

    expect(result.columns.find((c) => c.field === 'qty')?.summary).toBe('sum');
    expect(result.columns.find((c) => c.field === 'code')?.summary).toBe('none');
  });

  it('a deliberate saved "none" choice by the user overrides the developer default', () => {
    const columns: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'code', header: 'Code' },
      { field: 'qty', header: 'Quantity', type: 'number', summary: 'sum' }
    ];
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [
        { field: 'code', visible: true, order: 0, pinned: null, summary: 'none' },
        { field: 'qty', visible: true, order: 1, pinned: null, summary: 'none' }
      ]
    };

    const result = mergeGridLayout(columns, saved, 1);

    // Even though the developer default is 'sum', the user deliberately turned it off — it must not come back
    expect(result.columns.find((c) => c.field === 'qty')?.summary).toBe('none');
  });

  it('preserves the saved "none" choice when merged again', () => {
    const result = mergeGridLayout(baseColumns, null, 1);
    expect(result.columns.every((c) => c.summary === 'none')).toBeTrue();
  });

  it('lockVisible columns still remember the user\'s preference (only locked at the UI level)', () => {
    const columns: WeGridColumnDef<Row>[] = [
      { field: 'code', header: 'Code' },
      { field: 'name', header: 'Name' },
      { field: 'status', header: 'Status', lockVisible: true }
    ];

    const result = mergeGridLayout(columns, null, 1);

    expect(result.columns.find((c) => c.field === 'status')?.lockVisible).toBeTrue();
  });
});

describe('toColumnLayout', () => {
  it('includes a summary field the user changed — must survive a save/load round trip', () => {
    const merged = mergeGridLayout(baseColumns, null, 1);
    merged.columns[0].summary = 'count';

    const layout = toColumnLayout(merged.columns, baseColumns);

    expect(layout.find((c) => c.field === merged.columns[0].field)?.summary).toBe('count');
  });

  it('never writes summary for an untouched column — so a later merge can apply the developer default', () => {
    // None of baseColumns declares a summary → the default is 'none' for all of them. If the user
    // saves a layout change without ever touching the Summary menu (e.g. just dragging a column
    // wider), 'none' must not end up in the JSON — otherwise a summary default the developer adds
    // later would never reach this user (a regression scenario).
    const merged = mergeGridLayout(baseColumns, null, 1);
    merged.columns[0].width = 250; // a layout change unrelated to summary

    const layout = toColumnLayout(merged.columns, baseColumns);

    expect(layout.find((c) => c.field === merged.columns[0].field)?.summary).toBeUndefined();

    // If the developer later adds a summary default to this column (e.g. 'sum'), the old record
    // — since it never touched this field — must not override it; the new default should apply after re-merging.
    const columnsWithNewDefault: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'code', header: 'Code', type: 'number', summary: 'sum' },
      { field: 'name', header: 'Name' },
      { field: 'status', header: 'Status' }
    ];
    const savedFromLayout: WeGridLayout = { gridKey: 'test', version: 1, columns: layout };
    const remerged = mergeGridLayout(columnsWithNewDefault, savedFromLayout, 1);
    expect(remerged.columns.find((c) => c.field === 'code')?.summary).toBe('sum');
  });

  it('a deliberate "none" chosen by the user over a "sum" developer default is saved and preserved', () => {
    const columns: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'code', header: 'Code' },
      { field: 'qty', header: 'Quantity', type: 'number', summary: 'sum' }
    ];
    const merged = mergeGridLayout(columns, null, 1);
    expect(merged.columns.find((c) => c.field === 'qty')?.summary).toBe('sum');

    // The user picks "None" from the header menu
    const qtyCol = merged.columns.find((c) => c.field === 'qty')!;
    qtyCol.summary = 'none';

    const layout = toColumnLayout(merged.columns, columns);
    expect(layout.find((c) => c.field === 'qty')?.summary).toBe('none');

    // On the next merge, the developer default ('sum') must not override the deliberate choice
    const savedFromLayout: WeGridLayout = { gridKey: 'test', version: 1, columns: layout };
    const remerged = mergeGridLayout(columns, savedFromLayout, 1);
    expect(remerged.columns.find((c) => c.field === 'qty')?.summary).toBe('none');
  });

  it('an "avg" choice by the user is saved and preserved', () => {
    const columns: WeGridColumnDef<Row & { qty: number }>[] = [
      { field: 'qty', header: 'Quantity', type: 'number' }
    ];
    const merged = mergeGridLayout(columns, null, 1);
    merged.columns[0].summary = 'avg';

    const layout = toColumnLayout(merged.columns, columns);
    expect(layout.find((c) => c.field === 'qty')?.summary).toBe('avg');

    const savedFromLayout: WeGridLayout = { gridKey: 'test', version: 1, columns: layout };
    const remerged = mergeGridLayout(columns, savedFromLayout, 1);
    expect(remerged.columns.find((c) => c.field === 'qty')?.summary).toBe('avg');
  });
});
