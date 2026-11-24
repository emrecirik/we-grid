import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WE_GRID_EXPORTER, WeGridExportTable } from './models/we-grid-export.model';

interface Row {
  id: number;
  name: string;
  jan: number;
  feb: number;
  cost: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid gridKey="bands-spec" [columns]="columns" [data]="data" trackByField="id" [selectable]="selectable" />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name', width: 120 },
    { field: 'jan', header: 'Jan', type: 'number', width: 80, headerGroup: 'Sales' },
    { field: 'feb', header: 'Feb', type: 'number', width: 90, headerGroup: 'Sales' },
    { field: 'cost', header: 'Cost', type: 'number', width: 100, headerGroup: 'Costs' }
  ];
  data: Row[] = [{ id: 1, name: 'Bolt', jan: 1, feb: 2, cost: 3 }];
  selectable: 'none' | 'multi' = 'none';
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — header bands (headerGroup)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const exported: WeGridExportTable[] = [];

  beforeEach(async () => {
    localStorage.removeItem('we-grid-layout:bands-spec');
    exported.length = 0;
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: WE_GRID_EXPORTER, useValue: { export: (table: WeGridExportTable) => void exported.push(table) } }]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const bands = (): { text: string; span: string | null; scope: string | null }[] =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.we-grid__band-row th')).map((th) => ({
      text: th.textContent!.trim(),
      span: th.getAttribute('colspan'),
      scope: th.getAttribute('scope')
    }));

  it('draws a band row over the grouped columns, above the header row', () => {
    expect(bands()).toEqual([
      { text: '', span: '1', scope: null },
      { text: 'Sales', span: '2', scope: 'colgroup' },
      { text: 'Costs', span: '1', scope: 'colgroup' }
    ]);
    const thead = fixture.nativeElement.querySelector('thead') as HTMLElement;
    expect(thead.firstElementChild!.classList).toContain('we-grid__band-row');
    expect(fixture.nativeElement.querySelector('.we-grid__table').classList).toContain('we-grid__table--banded');
  });

  it('keeps every column at its own width through a colgroup', () => {
    const widths = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('colgroup col')).map((c) => c.style.width);
    expect(widths).toEqual(['120px', '80px', '90px', '100px']);
    const ths = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.we-grid__header-row th'));
    expect(ths.map((th) => Math.round(th.getBoundingClientRect().width))).toEqual([120, 80, 90, 100]);
  });

  it('gives the selection column an empty band cell of its own', () => {
    host.selectable = 'multi';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__band-row th.we-grid__select-col')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('colgroup col').length).toBe(5);
  });

  it('splits a band that a pin cuts through, and keeps the pinned piece in place', () => {
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.removeItem('we-grid-layout:bands-spec');
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.columns = host.columns.map((c) => (c.field === 'feb' ? { ...c, pinned: 'left' } : c));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(bands().map((b) => b.text)).toEqual(['Sales', '', 'Sales', 'Costs']);
    const pinned = fixture.nativeElement.querySelector('.we-grid__band--pinned-left') as HTMLElement;
    expect(pinned.style.left).toBe('0px');
  });

  it('draws no band row, colgroup or class when no column has a group', () => {
    host.columns = host.columns.map(({ headerGroup: _g, ...c }) => c);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__band-row, colgroup, .we-grid__table--banded')).toBeNull();
  });

  it('hands the bands to the exporter', () => {
    host.grid.exportAs('xlsx');
    expect(exported[0].columns.map((c) => c.group)).toEqual([null, 'Sales', 'Sales', 'Costs']);
  });
});
