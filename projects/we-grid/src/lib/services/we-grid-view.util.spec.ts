import { WeGridSavedView } from '../models/we-grid-view.model';
import { weGridDecodeView, weGridEncodeView, weGridSanitizeView } from './we-grid-view.util';

describe('weGridEncodeView / weGridDecodeView', () => {
  const view: WeGridSavedView = {
    name: 'Bekleyen kargolar — İstanbul',
    columns: [{ field: 'code', visible: true, order: 0, width: 120, pinned: 'left' }],
    density: 'compact',
    sort: { field: 'code', direction: 'desc' },
    filters: [
      { field: 'status', operator: 'in', value: ['shipped', null] },
      { field: 'total', operator: 'between', value: '100', value2: '500' }
    ],
    groupField: 'city',
    filterRowVisible: true
  };

  it('round-trips a view, non-ASCII names included, through a URL-safe token', () => {
    const token = weGridEncodeView(view);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(weGridDecodeView(token)).toEqual(view);
  });

  it('returns null for a token that is not a view', () => {
    expect(weGridDecodeView('')).toBeNull();
    expect(weGridDecodeView('not base64 at all!')).toBeNull();
    expect(weGridDecodeView(btoa('{"name": 1}'))).toBeNull();
    expect(weGridDecodeView('a'.repeat(30000))).toBeNull();
  });
});

describe('weGridSanitizeView', () => {
  it('keeps only fields with the expected shape', () => {
    const result = weGridSanitizeView({
      name: '  Mine  ',
      extra: 'dropped',
      columns: [
        { field: 'code', visible: true, order: 0, pinned: 'middle', width: -5, onclick: 'x' },
        { field: 42, visible: true, order: 1 },
        'nonsense'
      ],
      density: 'huge',
      sort: { field: 'code', direction: 'sideways' },
      filters: [
        { field: 'a', operator: 'contains', value: 'x' },
        { field: 'b', operator: 'drop table', value: 'x' },
        { field: 'c', operator: 'eq', value: { toString: 'x' } },
        { field: 'd', operator: 'in', value: 'not an array' }
      ],
      groupField: 7
    });

    expect(result).toEqual({
      name: 'Mine',
      columns: [{ field: 'code', visible: true, order: 0, pinned: null }],
      sort: null,
      filters: [{ field: 'a', operator: 'contains', value: 'x' }],
      groupField: null
    });
  });

  it('rejects input without a name or a column list', () => {
    expect(weGridSanitizeView(null)).toBeNull();
    expect(weGridSanitizeView({ name: '   ', columns: [] })).toBeNull();
    expect(weGridSanitizeView({ name: 'x' })).toBeNull();
  });
});
