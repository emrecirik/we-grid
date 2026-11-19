import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnStore } from 'we-grid-angular/engine';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridDataPage, WeGridDataRequest, WeGridDataSource } from './models/we-grid-data-source.model';

interface Row {
  id: number;
  city: string;
  amount: number;
}

const CITIES = ['Ankara', 'Bursa', 'İzmir', 'Van'];

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid gridKey="ds-spec" [columns]="columns" [dataSource]="source" trackByField="id" [maxHeight]="300" [rowHeight]="30" [search]="true" />
  `
})
class DataSourceHostComponent {
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
  columns: WeGridColumnDef<Row>[] = [
    { field: 'id', header: 'Id', type: 'integer', width: 90 },
    { field: 'city', header: 'City', width: 120, headerFilterMode: 'checklist' },
    { field: 'amount', header: 'Amount', type: 'number', width: 120 }
  ];
  source: WeGridDataSource<Row> | null = WeGridColumnStore.fromRows<Row>(
    Array.from({ length: 200_000 }, (_, i) => ({ id: i, city: CITIES[i % 4], amount: (i * 7919) % 1000 }))
  );
}

describe('WeGridComponent dataSource', () => {
  let fixture: ComponentFixture<DataSourceHostComponent>;
  let host: DataSourceHostComponent;

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__row'));
  const firstCells = (): string[] => rows().map((r) => r.querySelector('td')?.textContent?.trim() ?? '');
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [DataSourceHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DataSourceHostComponent);
    host = fixture.componentInstance;
    await settle();
  });

  it('shows a window of the source and its total, without a pager', () => {
    expect(rows().length).toBeGreaterThan(5);
    expect(rows().length).toBeLessThan(60);
    expect(firstCells()[0]).toBe('0');
    expect(fixture.nativeElement.querySelector('.we-grid__footer-info').textContent).toContain('200,000 records');
    expect(fixture.nativeElement.querySelector('.we-grid__pager')).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-grid__table').getAttribute('aria-rowcount')).toBe('200000');
    // The summary row counts the source's rows, not the window's
    expect(host.grid.totalRecordCountForSummary).toBe(200_000);
  });

  it('hands sorting to the source', async () => {
    const label = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.we-grid__th-label')).find((el) => el.textContent?.trim() === 'Amount')!;
    label.click();
    label.click();
    await settle();
    const amounts = rows().map((r) => Number(r.querySelectorAll('td')[2].textContent?.replace(/\D/g, '')));
    expect(amounts[0]).toBe(999);
    expect(amounts.every((a, i) => i === 0 || a <= amounts[i - 1])).toBeTrue();
  });

  it('hands search and checklist filters to the source and lists checklist values from all of it', async () => {
    const grid = host.grid;
    grid.setSearch('van');
    await settle();
    expect(rows().every((r) => r.textContent?.includes('Van'))).toBeTrue();
    expect(fixture.nativeElement.querySelector('.we-grid__footer-info').textContent).toContain('50');
    grid.setSearch('');
    const city = grid.internalColumns.find((c) => c.field === 'city')!;
    grid.setChecklistFilter(city, ['Bursa']);
    await settle();
    expect(rows().every((r) => r.textContent?.includes('Bursa'))).toBeTrue();
    const store = host.source as WeGridColumnStore<Row>;
    const listed = await firstValueFrom(store.checklistValues({ field: 'city', search: null, filters: [], limit: 10 }));
    expect(listed.values.map((v) => v.value)).toEqual(['Ankara', 'Bursa', 'Van', 'İzmir']);
  });

  it('shows placeholders while an asynchronous source answers', async () => {
    const resolvers: ((page: WeGridDataPage<Row>) => void)[] = [];
    const requests: WeGridDataRequest[] = [];
    host.source = {
      load: (request) => {
        requests.push(request);
        return new Promise<WeGridDataPage<Row>>((resolve) => resolvers.push(resolve));
      }
    };
    await settle();
    expect(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__skeleton-row').length).toBeGreaterThan(0);
    resolvers.shift()!({ rows: [{ id: 42, city: 'Van', amount: 1 }], total: 1 });
    await settle();
    expect(firstCells()).toEqual(['42']);
    expect(requests[0].offset).toBe(0);
  });

  describe('grouped', () => {
    const groupRows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__group-row'));
    const bodyOutline = (): string[] =>
      Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('tbody > tr:not(.we-grid__virtual-pad)')).map((tr) =>
        tr.classList.contains('we-grid__group-row')
          ? `G:${tr.querySelector('.we-grid__group-label')!.textContent!.trim()} ${tr.querySelector('.we-grid__group-count')!.textContent!.trim()}`
          : `R:${tr.querySelectorAll('td')[1]?.textContent?.trim()}`
      );

    beforeEach(async () => {
      host.source = WeGridColumnStore.fromRows<Row>(Array.from({ length: 400 }, (_, i) => ({ id: i, city: CITIES[i % 4], amount: i })));
      await settle();
    });

    it('asks the source for groups and shows each group with its own rows, counted by the source', async () => {
      host.grid.setGrouping(['city']);
      await settle();
      const outline = bodyOutline();
      expect(outline[0]).toBe('G:City: Ankara 100 records');
      expect(outline.slice(1, 6).every((l) => l === 'R:Ankara')).toBeTrue();
      expect(fixture.nativeElement.querySelector('.we-grid__footer-info').textContent).toContain('400');
    });

    it('collapses a group without asking again, and the next group follows right after', async () => {
      host.grid.setGrouping(['city']);
      await settle();
      const spy = spyOn(host.source as WeGridColumnStore<Row>, 'groups').and.callThrough();
      host.grid.toggleGroupCollapse(host.grid.groupedSections![0]);
      await settle();
      expect(spy).not.toHaveBeenCalled();
      expect(bodyOutline().slice(0, 3)).toEqual(['G:City: Ankara 100 records', 'G:City: Bursa 100 records', 'R:Bursa']);
      host.grid.collapseAllGroups();
      await settle();
      expect(groupRows().length).toBe(4);
      expect(bodyOutline().every((l) => l.startsWith('G:'))).toBeTrue();
    });

    it('with footers, a closed group shows its header only', async () => {
      // Five rows a city, so an open group and its footer fit in view
      host.source = WeGridColumnStore.fromRows<Row>(Array.from({ length: 20 }, (_, i) => ({ id: i, city: CITIES[i % 4], amount: i })));
      await settle();
      host.grid.groupSummaryPosition = 'both';
      host.grid.groupAutoSummary = true;
      host.grid.setGrouping(['city']);
      await settle();
      host.grid.collapseAllGroups();
      await settle();
      expect(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__group-footer-row').length).toBe(0);
      host.grid.toggleGroupCollapse(host.grid.groupedSections![3]);
      await settle();
      const body = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('tbody > tr:not(.we-grid__virtual-pad)'));
      expect(body.filter((tr) => tr.classList.contains('we-grid__group-footer-row')).length).toBe(1);
      expect(body[body.length - 1].classList.contains('we-grid__group-footer-row')).toBeTrue();
    });

    it('shows the subtotals the source worked out', async () => {
      // Numeric columns sum per group — set directly, as a saved layout would bring back a column's own summary
      host.grid.groupAutoSummary = true;
      host.grid.setGrouping(['city']);
      await settle();
      const store = host.source as WeGridColumnStore<Row>;
      const expected = store.aggregate('amount', 'sum', { filters: [{ field: 'city', operator: 'in', value: ['Van'] }] })!;
      // Closed, every group header is in view
      host.grid.collapseAllGroups();
      await settle();
      const van = groupRows().find((r) => r.textContent!.includes('Van'))!;
      expect(van.querySelector('.we-grid__group-summary')!.textContent!.replace(/\D/g, '')).toContain(String(expected));
    });
  });

  it('falls back to data when the source is removed', async () => {
    host.source = null;
    await settle();
    expect(rows().length).toBe(0);
    expect(fixture.nativeElement.querySelector('.we-grid__empty')).not.toBeNull();
  });
});
