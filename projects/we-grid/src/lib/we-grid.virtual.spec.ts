import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';

interface Row {
  id: number;
  name: string;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid
      gridKey="virtual-spec"
      [columns]="columns"
      [data]="data"
      trackByField="id"
      [virtualScroll]="virtual"
      [maxHeight]="300"
      [rowHeight]="rowHeight"
      [grouping]="true"
      [groupBy]="groupBy"
      footer="none"
    />
  `
})
class VirtualHostComponent {
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
  columns: WeGridColumnDef<Row>[] = [
    { field: 'id', header: 'Id', width: 80, type: 'number' },
    { field: 'name', header: 'Name', width: 150 }
  ];
  data: Row[] = Array.from({ length: 100_000 }, (_, i) => ({ id: i, name: `Row ${i}` }));
  virtual = true;
  rowHeight: number | undefined = 30;
  groupBy: string[] | null = null;
}

describe('WeGridComponent virtualScroll', () => {
  let fixture: ComponentFixture<VirtualHostComponent>;
  let host: VirtualHostComponent;

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__row'));
  const area = (): HTMLElement => fixture.nativeElement.querySelector('.we-grid__scroll');
  const scrollTo = async (top: number): Promise<void> => {
    area().scrollTop = top;
    area().dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [VirtualHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(VirtualHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders only a window of the rows, with spacers making up the full height', () => {
    expect(rows().length).toBeGreaterThan(5);
    expect(rows().length).toBeLessThan(60);
    expect(area().scrollHeight).toBeGreaterThan(100_000 * 30 * 0.9);
    expect(rows()[0].textContent).toContain('Row 0');
    expect(rows()[0].getAttribute('aria-rowindex')).toBe('2');
  });

  it('moves the window with the scroll position', async () => {
    await scrollTo(50_000 * 30);
    const texts = rows().map((r) => r.textContent ?? '');
    expect(texts.some((t) => t.includes('Row 50000'))).toBeTrue();
    expect(texts.some((t) => t.includes('Row 0 '))).toBeFalse();
    expect(rows().length).toBeLessThan(60);
  });

  it('scrollToRow brings a row that is not in the DOM into view', async () => {
    expect(host.grid.scrollToRow(77_777)).toBeTrue();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rows().some((r) => r.textContent?.includes('Row 77777'))).toBeTrue();
  });

  it('windows group headers together with rows', async () => {
    host.data = host.data.slice(0, 2000).map((r) => ({ ...r, name: `G${r.id % 5}` }));
    host.groupBy = ['name'];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody > tr.we-grid__group-row').length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(60);
  });

  it('renders every row when switched off', async () => {
    host.data = host.data.slice(0, 200);
    host.virtual = false;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rows().length).toBe(200);
    expect(fixture.nativeElement.querySelector('.we-grid__virtual-pad')).toBeNull();
  });
});
