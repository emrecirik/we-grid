import { firstValueFrom } from 'rxjs';
import {
  WeGridProtocolClient,
  WeGridProtocolDataSource,
  WeGridProtocolError,
  WeGridProtocolLayoutStore,
  weGridColumnsFromTable,
  weGridProtocolWhere
} from './we-grid-protocol';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(respond: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined
    };
    calls.push(call);
    const { status, body } = respond(call);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('we-grid protocol client', () => {
  it('maps grid filters to protocol conditions', () => {
    expect(
      weGridProtocolWhere([
        { field: 'name', operator: 'contains', value: 'ab' },
        { field: 'name2', operator: 'contains', value: '' },
        { field: 'city', operator: 'in', value: ['A', null, 'B'] },
        { field: 'note', operator: 'in', value: [null] },
        { field: 'qty', operator: 'between', value: 2, value2: 9 },
        { field: 'day', operator: 'after', value: new Date(Date.UTC(2026, 0, 2)) },
        { field: 'code', operator: 'equals', value: null }
      ])
    ).toEqual([
      { column: 'name', op: 'contains', value: 'ab' },
      { column: 'city', op: 'in', value: ['A', 'B'] },
      { column: 'note', op: 'isNull' },
      { column: 'qty', op: '>=', value: 2 },
      { column: 'qty', op: '<=', value: 9 },
      { column: 'day', op: '>', value: '2026-01-02T00:00:00.000Z' },
      { column: 'code', op: 'isNull' }
    ]);
  });

  it('loads a page with offset, sort, filters and the total', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { columns: [], rows: [{ id: 11 }], truncated: true, total: 40 } }));
    const client = new WeGridProtocolClient({ baseUrl: 'http://x:1/', token: 't', fetch: fn });
    const source = new WeGridProtocolDataSource(client, 'sample', 'customers');
    const page = await source.load({ page: 3, pageSize: 5, sort: { field: 'name', direction: 'desc' }, filters: [{ field: 'city', operator: 'equals', value: 'A' }] });
    expect(page).toEqual({ rows: [{ id: 11 }], total: 40 });
    expect(calls[0].url).toBe('http://x:1/v1/connections/sample/query');
    expect(calls[0].headers['Authorization']).toBe('Bearer t');
    expect(calls[0].body).toEqual({
      query: { table: 'customers', where: [{ column: 'city', op: '=', value: 'A' }], limit: 5, offset: 10, orderBy: [{ column: 'name', dir: 'desc' }] },
      count: true
    });
  });

  it('loads a window for [dataSource]: offset, the grid order with empty values placed, search on 1.2', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { columns: [], rows: [{ id: 1 }], truncated: true, total: 1_000_000_000 } }));
    const client = new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fn });
    const source = new WeGridProtocolDataSource(client, 'big', 'sales', undefined, { grid: true, search: true, groups: true });
    const page = await source.load({
      offset: 750_000_000,
      limit: 256,
      sort: [{ field: 'total', direction: 'desc' }, { field: 'id', direction: 'asc' }],
      filters: [{ field: 'city', operator: 'in', value: ['Van'] }],
      search: '  selin  ',
      groupBy: ['category'],
      columns: [{ field: 'customer', type: 'text' }, { field: 'total', type: 'currency' }]
    });
    expect(page).toEqual({ rows: [{ id: 1 }], total: 1_000_000_000 });
    expect(calls[0].body).toEqual({
      query: {
        table: 'sales',
        where: [{ column: 'city', op: 'in', value: ['Van'] }],
        // Text columns only — a number column has its own filter
        search: { text: 'selin', columns: ['customer'] },
        orderBy: [
          { column: 'category', nulls: 'first' },
          { column: 'total', dir: 'desc', nulls: 'last' },
          { column: 'id', dir: 'asc', nulls: 'first' }
        ],
        limit: 256,
        offset: 750_000_000
      },
      count: true
    });
    // The next window of the same query, sorted differently or not, isn't counted again — a filter is
    const request = { offset: 256, limit: 256, filters: [{ field: 'city', operator: 'in' as const, value: ['Van'] }], search: 'selin', columns: [{ field: 'customer', type: 'text' as const }] };
    await source.load({ ...request, groupBy: ['category'] });
    expect((calls[1].body as { count?: boolean }).count).toBeUndefined();
    expect((await source.load({ ...request, sort: [{ field: 'id', direction: 'asc' }] })).total).toBe(1_000_000_000);
    expect((calls[2].body as { count?: boolean }).count).toBeUndefined();
    await source.load({ ...request, filters: [] });
    expect((calls[3].body as { count?: boolean }).count).toBeTrue();
    const old = new WeGridProtocolDataSource(client, 'big', 'sales');
    expect(old.groups).toBeUndefined();
    await expectAsync(old.load({ offset: 0, limit: 10, search: 'x', columns: [{ field: 'customer', type: 'text' }] })).toBeRejectedWithError(/protocol 1\.2/);
  });

  it('builds nested groups from the database rows: counts, offsets, subtotals added up', async () => {
    const rows = [
      { region: null, city: 'Van', __count: 2, a0: 10, a1: 3, n1: 2 },
      { region: 'East', city: 'Kars', __count: 5, a0: 50, a1: 4, n1: 5 },
      { region: 'East', city: 'Van', __count: 3, a0: null, a1: 8, n1: 3 }
    ];
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { columns: [], rows, truncated: false } }));
    const source = new WeGridProtocolDataSource(new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fn }), 'c', 'sales', undefined, { groups: true });
    const groups = await source.groups!({
      groupBy: ['region', 'city'],
      aggregates: [{ field: 'total', fn: 'sum' }, { field: 'qty', fn: 'avg' }]
    });
    expect(calls[0].body).toEqual({
      query: {
        table: 'sales',
        where: [],
        groupBy: ['region', 'city'],
        aggregates: [
          { column: 'total', fn: 'sum', as: 'a0' },
          { column: 'qty', fn: 'avg', as: 'a1' },
          { column: 'qty', fn: 'count', as: 'n1' }
        ]
      }
    });
    expect(groups.map((g) => [g.key, g.start, g.count])).toEqual([['', 0, 2], ['East', 2, 8]]);
    expect(groups[1].children!.map((g) => [g.key, g.start, g.count])).toEqual([['Kars', 2, 5], ['Van', 7, 3]]);
    expect(groups[1].aggregates).toEqual({ total: 50, qty: (4 * 5 + 8 * 3) / 8 });
    expect(groups[1].children![1].aggregates).toEqual({ total: null, qty: 8 });
    const { fn: truncatedFetch } = fakeFetch(() => ({ status: 200, body: { columns: [], rows: [], truncated: true } }));
    const truncated = new WeGridProtocolDataSource(new WeGridProtocolClient({ baseUrl: 'http://x', fetch: truncatedFetch }), 'c', 'sales', undefined, { groups: true });
    await expectAsync(truncated.groups!({ groupBy: ['id'] })).toBeRejectedWithError(/Too many groups/);
  });

  it('serves checklist values as a distinct query narrowed by search', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { columns: [], rows: [{ city: 'A' }, { city: null }], truncated: false } }));
    const source = new WeGridProtocolDataSource(new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fn }), 'c', 't');
    const result = await firstValueFrom(source.checklistValues({ field: 'city', search: 'a', filters: [], limit: 50 }));
    expect(result).toEqual({ values: [{ value: 'A' }, { value: null }], hasMore: false });
    expect(calls[0].body).toEqual({
      query: { table: 't', columns: ['city'], distinct: true, where: [{ column: 'city', op: 'contains', value: 'a' }], orderBy: [{ column: 'city', dir: 'asc' }], limit: 50 }
    });
  });

  it('stores layouts under a prefix, reads a missing one as null and surfaces errors', async () => {
    const stored = new Map<string, unknown>();
    const { fn, calls } = fakeFetch((call) => {
      const key = decodeURIComponent(call.url.split('/v1/layouts/')[1]);
      if (call.method === 'PUT') {
        stored.set(key, call.body);
        return { status: 204 };
      }
      if (call.method === 'DELETE') {
        stored.delete(key);
        return { status: 204 };
      }
      return stored.has(key) ? { status: 200, body: stored.get(key) } : { status: 404, body: { error: 'none' } };
    });
    const client = new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fn });
    const store = new WeGridProtocolLayoutStore(client, 'u42:');
    expect(await firstValueFrom(store.load('orders'))).toBeNull();
    await firstValueFrom(store.save('orders::views', { gridKey: 'orders', version: 1, columns: [] }));
    expect(calls[1].url).toBe('http://x/v1/layouts/u42%3Aorders%3A%3Aviews');
    expect(await firstValueFrom(store.load('orders::views'))).toEqual({ gridKey: 'orders', version: 1, columns: [] });
    await firstValueFrom(store.reset('orders::views'));
    expect(stored.size).toBe(0);
    await firstValueFrom(store.save('ö / weird', { gridKey: 'x', version: 1, columns: [] }));
    expect([...stored.keys()][0]).toMatch(/^x-[0-9a-f]+$/);

    const failing = new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fakeFetch(() => ({ status: 403, body: { error: 'disabled' } })).fn });
    await expectAsync(failing.getLayout('k')).toBeRejectedWith(new WeGridProtocolError(403, 'disabled'));
  });

  it('builds grid columns from a table schema', () => {
    expect(
      weGridColumnsFromTable({
        name: 'orders',
        columns: [
          { name: 'order_date', type: 'date' },
          { name: 'creditLimit', type: 'number' },
          { name: 'status', type: 'string' }
        ]
      })
    ).toEqual([
      { field: 'order_date', header: 'Order date', type: 'date' },
      { field: 'creditLimit', header: 'Credit Limit', type: 'number', align: 'end' },
      { field: 'status', header: 'Status', type: 'text' }
    ]);
  });
});

describe('we-grid protocol layout keys', () => {
  it('gives long keys that share a beginning different URLs within the 100-character limit', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 204 }));
    const client = new WeGridProtocolClient({ baseUrl: 'http://x', fetch: fn });
    await client.putLayout('grid:user@example.com:department-reports:orders-2024', {});
    await client.putLayout('grid:user@example.com:department-reports:orders-2025', {});
    const keys = calls.map((c) => decodeURIComponent(c.url.split('/v1/layouts/')[1]));
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.every((k) => k.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(k))).toBeTrue();
  });
});
