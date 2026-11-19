import { firstValueFrom } from 'rxjs';
import { WeGridColumnStore } from './we-grid-column-store';
import { WeGridWorkerStore, weGridServeColumnStore } from './we-grid-worker-store';

interface Row {
  id: number;
  city: string;
  price: number;
}

const CITIES = ['Ankara', 'Bursa', 'İzmir', 'Van'];

/** Both ends of a MessageChannel stand in for the page and the worker */
function channel(): MessagePort {
  const { port1, port2 } = new MessageChannel();
  weGridServeColumnStore(port2 as unknown as Parameters<typeof weGridServeColumnStore>[0]);
  return port1;
}

function columns(n: number): { id: Int32Array; city: { dictionary: string[]; codes: Uint8Array }; price: { fixed: Int32Array; scale: number } } {
  return {
    id: Int32Array.from({ length: n }, (_, i) => i),
    city: { dictionary: CITIES, codes: Uint8Array.from({ length: n }, (_, i) => i % 4) },
    price: { fixed: Int32Array.from({ length: n }, (_, i) => (i * 7919) % 100_000), scale: 100 }
  };
}

describe('WeGridWorkerStore', () => {
  it('answers like the store it runs, and hands the typed arrays over instead of copying', async () => {
    const local = WeGridColumnStore.fromColumns<Row>(columns(5000));
    const input = columns(5000);
    const remote = await WeGridWorkerStore.fromColumns<Row>(channel(), input);
    expect(remote.length).toBe(5000);
    expect(remote.fields).toEqual(['id', 'city', 'price']);
    expect(input.id.byteLength).toBe(0);
    const request = {
      offset: 100,
      limit: 30,
      sort: [{ field: 'price', direction: 'desc' as const }],
      filters: [{ field: 'city', operator: 'in' as const, value: ['Van', 'İzmir'] }]
    };
    expect(await remote.load(request)).toEqual(local.load(request));
    expect(await remote.aggregate('price', 'sum', request)).toBe(local.aggregate('price', 'sum', request));
    expect(await remote.distinct('city')).toEqual(local.distinct('city'));
    const listed = await firstValueFrom(remote.checklistValues({ field: 'city', search: 'a', filters: [], limit: 2 }));
    expect(listed).toEqual({ values: [{ value: 'Ankara' }, { value: 'Bursa' }], hasMore: true });
    remote.close();
  });

  it('searches with the built-in formatting when the formatter function cannot cross', async () => {
    const remote = await WeGridWorkerStore.fromRows<Row>(channel(), [
      { id: 1, city: 'Van', price: 1234.5 },
      { id: 2, city: 'Van', price: 99 }
    ]);
    const page = await remote.load({
      offset: 0,
      limit: 10,
      search: '1.234,50',
      locale: 'tr-TR',
      columns: [
        { field: 'price', type: 'currency', format: () => 'never posted', formatSpec: { options: { locale: 'tr-TR', currency: 'TRY' } } }
      ]
    });
    expect(page.rows.map((r) => r.id)).toEqual([1]);
    remote.close();
  });

  it('edits through the worker and passes errors back', async () => {
    const remote = await WeGridWorkerStore.fromColumns<Row>(channel(), columns(10));
    await remote.set(2, 'city', 'Rize');
    expect((await remote.load({ offset: 2, limit: 1 })).rows[0].city).toBe('Rize');
    await expectAsync(remote.set(99, 'city', 'x')).toBeRejectedWithError(/no cell city\[99\]/);
    expect((await remote.describe()).map((c) => c.encoding)).toEqual(['seq', 'dict', 'int']);
    remote.close();
    await expectAsync(remote.load({ offset: 0, limit: 1 })).toBeRejectedWithError(/closed/);
  });
});
