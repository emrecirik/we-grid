import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnStore } from './engine/we-grid-column-store';
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
    expect(fixture.nativeElement.querySelector('.we-grid__footer-info').textContent).toContain('200');
    expect(fixture.nativeElement.querySelector('.we-grid__pager')).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-grid__table').getAttribute('aria-rowcount')).toBe('200000');
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

  it('falls back to data when the source is removed', async () => {
    host.source = null;
    await settle();
    expect(rows().length).toBe(0);
    expect(fixture.nativeElement.querySelector('.we-grid__empty')).not.toBeNull();
  });
});
