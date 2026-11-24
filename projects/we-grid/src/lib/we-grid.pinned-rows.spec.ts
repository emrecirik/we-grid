import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridColumnDef } from './models/we-grid-column.model';

interface Row {
  id: number;
  name: string;
  qty: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `<we-grid
    gridKey="pinned-rows-spec"
    [columns]="columns"
    [data]="data"
    trackByField="id"
    [maxHeight]="maxHeight"
    [cellSelection]="true"
    [pinnedTopRows]="top"
    [pinnedBottomRows]="bottom"
  />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name', sortable: true },
    { field: 'qty', header: 'Qty', type: 'integer', summary: 'sum' }
  ];
  data: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, qty: i + 1 }));
  top: Row[] = [{ id: -1, name: 'Target', qty: 1000 }];
  bottom: Row[] = [{ id: -2, name: 'Last year', qty: 2500 }];
  maxHeight: number | undefined = 300;
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — pinned rows', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    localStorage.removeItem('we-grid-layout:pinned-rows-spec');
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const text = (selector: string): string[] =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector)).map((tr) => tr.textContent!.replace(/\s+/g, ' ').trim());
  const settle = async (): Promise<void> => {
    // The sticky offsets come from a ResizeObserver callback
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    fixture.detectChanges();
  };

  it('draws the pinned rows above and below the data rows, formatted like them', () => {
    expect(text('.we-grid__pinned-body--top tr')).toEqual(['Target 1,000']);
    expect(text('.we-grid__pinned-body--bottom tr')).toEqual(['Last year 2,500']);
    const bodies = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.we-grid__table > tbody'));
    expect(bodies[0].classList).toContain('we-grid__pinned-body--top');
    expect(bodies[2].classList).toContain('we-grid__pinned-body--bottom');
  });

  it('leaves them out of sorting, the summary and cell selection', () => {
    // Two clicks on the Qty header: descending
    const label = fixture.nativeElement.querySelectorAll('.we-grid__header-row .we-grid__th-label')[1] as HTMLElement;
    label.click();
    fixture.detectChanges();
    label.click();
    fixture.detectChanges();
    expect(text('.we-grid__pinned-body--top tr')).toEqual(['Target 1,000']);
    expect(text('tbody:not(.we-grid__pinned-body) tr.we-grid__row')[0]).toBe('Item 30 30');
    expect(fixture.nativeElement.querySelector('.we-grid__summary-row').textContent).toContain('465');
    expect(fixture.nativeElement.querySelector('.we-grid__pinned-body [data-we-grid-field]')).toBeNull();
  });

  it('sticks them under the header and over the summary at measured offsets in a bounded grid', async () => {
    await settle();
    const table = fixture.nativeElement.querySelector('.we-grid__table') as HTMLElement;
    const head = table.querySelector('thead')!.offsetHeight;
    const foot = table.querySelector('tfoot')!.offsetHeight;
    const topCell = fixture.nativeElement.querySelector('.we-grid__pinned-body--top td') as HTMLElement;
    const bottomCell = fixture.nativeElement.querySelector('.we-grid__pinned-body--bottom td') as HTMLElement;
    expect(topCell.style.top).toBe(`${head}px`);
    expect(bottomCell.style.bottom).toBe(`${foot}px`);
    expect(getComputedStyle(topCell).position).toBe('sticky');
  });

  it('renders no pinned body without pinned rows', () => {
    host.top = [];
    host.bottom = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-grid__pinned-body')).toBeNull();
  });
});
