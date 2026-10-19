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
  template: `<we-grid gridKey="copy-spec" [columns]="columns" [data]="data" trackByField="id" selectable="multi" [editable]="true" />`
})
class HostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'name', header: 'Name' },
    { field: 'qty', header: 'Qty', type: 'integer' }
  ];
  data: Row[] = [
    { id: 1, name: 'Bolt, "big"', qty: 1200 },
    { id: 2, name: 'Nut', qty: 3 }
  ];
  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

describe('WeGridComponent — copying to Excel', () => {
  let fixture: ComponentFixture<HostComponent>;
  let grid: WeGridComponent<Row>;

  beforeEach(() => {
    localStorage.removeItem('we-grid-layout:copy-spec');
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    grid = fixture.componentInstance.grid;
  });

  const copy = (): DataTransfer => {
    const data = new DataTransfer();
    fixture.nativeElement.querySelector('.we-grid').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return data;
  };

  it('copies the selected rows with a header line, as tab-separated cells', () => {
    grid.toggleRowSelection(fixture.componentInstance.data[0]);
    grid.toggleRowSelection(fixture.componentInstance.data[1]);
    expect(copy().getData('text/plain')).toBe('Name\tQty\n"Bolt, ""big"""\t1,200\nNut\t3');
  });

  it('copies the active cell when no row is selected', () => {
    const td = fixture.nativeElement.querySelectorAll('tr.we-grid__row')[1].querySelectorAll('td')[2] as HTMLElement;
    td.click();
    expect(copy().getData('text/plain')).toBe('3');
  });

  it('leaves the clipboard alone when the grid was not the last thing pressed', () => {
    grid.toggleRowSelection(fixture.componentInstance.data[0]);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(data.getData('text/plain')).toBe('');
  });
});
