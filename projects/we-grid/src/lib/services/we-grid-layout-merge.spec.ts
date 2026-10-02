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

describe('mergeGridLayout — header filter mode', () => {
  it('defaults every column to the checklist, except a custom column', () => {
    const columns = mergeGridLayout<Row>(
      [...baseColumns, { field: 'actions', header: '', type: 'custom' }, { field: 'status2', header: 'S', headerFilterMode: 'operator' }],
      null,
      1
    ).columns;
    expect(columns.map((c) => c.headerFilterMode)).toEqual(['checklist', 'checklist', 'checklist', 'operator', 'operator']);
  });

  it('uses the grid-wide default passed in, while a column\'s own choice still wins', () => {
    const columns = mergeGridLayout<Row>([baseColumns[0], { ...baseColumns[1], headerFilterMode: 'checklist' }], null, 1, 'operator').columns;
    expect(columns.map((c) => c.headerFilterMode)).toEqual(['operator', 'checklist']);
  });

  it('carries minorUnits and formatter over', () => {
    const formatter = (v: unknown): string => String(v);
    const [col] = mergeGridLayout<Row>([{ field: 'code', header: 'C', type: 'currency', minorUnits: true, formatter }], null, 1).columns;
    expect(col.minorUnits).toBeTrue();
    expect(col.formatter).toBe(formatter);
  });
});

describe('mergeGridLayout — auto fit', () => {
  it('marks only columns without a developer or saved width as pending a fit', () => {
    const columns: WeGridColumnDef<Row>[] = [
      { field: 'code', header: 'Code', width: 90 },
      { field: 'name', header: 'Name' },
      { field: 'status', header: 'Status' }
    ];
    const saved: WeGridLayout = {
      gridKey: 'test',
      version: 1,
      columns: [{ field: 'status', visible: true, order: 2, width: 210, pinned: null }]
    };

    const result = mergeGridLayout(columns, saved, 1);
    const pending = (field: string) => result.columns.find((c) => c.field === field)?.autoFitPending;

    expect(pending('code')).toBeFalse();
    expect(pending('name')).toBeTrue();
    expect(pending('status')).toBeFalse();
  });

  it('does not save the placeholder width of a column still pending a fit', () => {
    const merged = mergeGridLayout(baseColumns, null, 1);
    merged.columns[1].autoFitPending = false;
    merged.columns[1].width = 222;

    const layout = toColumnLayout(merged.columns, baseColumns);

    expect(layout.find((c) => c.field === 'code')?.width).toBeUndefined();
    expect(layout.find((c) => c.field === 'name')?.width).toBe(222);
  });
});

describe('mergeGridLayout — a v1 layout written by another source', () => {
  // Only some columns, pinned: null everywhere — what a screen that saved its own layout before
  // moving to the grid typically stored.
  const defs: WeGridColumnDef<Row & { total: number }>[] = [
    { field: 'code', header: 'Code', pinned: 'left', width: 120, fixed: true },
    { field: 'name', header: 'Name', width: 200 },
    { field: 'status', header: 'Status', visible: false },
    { field: 'total', header: 'Total', pinned: 'right', width: 90 }
  ];
  const external: WeGridLayout = {
    gridKey: 'external',
    version: 1,
    columns: [
      { field: 'status', visible: true, order: 0, width: 140, pinned: null },
      { field: 'name', visible: false, order: 1, pinned: null },
      { field: 'legacy', visible: true, order: 2, width: 50, pinned: null }
    ]
  };

  it('12. keeps the stored order, widths and visibility, adds missing columns from the definitions and drops unknown ones', () => {
    const result = mergeGridLayout(defs, external, 1);
    const byField = new Map(result.columns.map((c) => [c.field, c]));

    expect(result.columns.map((c) => c.field)).toEqual(['code', 'status', 'name', 'total']);
    expect(byField.get('status')).toEqual(jasmine.objectContaining({ visible: true, width: 140 }));
    expect(byField.get('name')).toEqual(jasmine.objectContaining({ visible: false, width: 200 }));
    // Missing from the record — taken from the definitions, pinning included
    expect(byField.get('code')).toEqual(jasmine.objectContaining({ pinned: 'left', width: 120, visible: true }));
    expect(byField.get('total')).toEqual(jasmine.objectContaining({ pinned: 'right', width: 90, visible: true }));
    expect(byField.has('legacy')).toBeFalse();
  });

  it('12. a stored pinned: null does not unpin a lockPinned column', () => {
    const withPin: WeGridLayout = { ...external, columns: [{ field: 'code', visible: true, order: 3, pinned: null }] };
    const code = mergeGridLayout(defs, withPin, 1).columns.find((c) => c.field === 'code')!;
    expect(code.pinned).toBe('left');
    expect(code.order).toBe(0);
  });

  it('12. a version mismatch discards the whole record', () => {
    const result = mergeGridLayout(defs, { ...external, version: 2 }, 1);
    expect(result.columns.map((c) => c.field)).toEqual(['code', 'name', 'status', 'total']);
    expect(result.columns.find((c) => c.field === 'status')!.visible).toBeFalse();
    expect(result.columns.find((c) => c.field === 'name')!.visible).toBeTrue();
  });
});

