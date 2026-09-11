import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridColumnDef } from '../models/we-grid-column.model';
import { weGridLocaleEn } from '../models/we-grid-locale.model';
import { mergeGridLayout } from '../services/we-grid-layout-merge';
import { WeGridHeaderMenuComponent } from './we-grid-header-menu.component';

describe('WeGridHeaderMenuComponent — "Filter by this value"', () => {
  let fixture: ComponentFixture<WeGridHeaderMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WeGridHeaderMenuComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridHeaderMenuComponent);
  });

  /** Opens the menu the way a right-click on a cell does and returns the quick-filter item, if rendered */
  function quickFilterItemFor(def: WeGridColumnDef<unknown>): HTMLButtonElement | undefined {
    const column = mergeGridLayout<unknown>([def], null, 1).columns[0];
    fixture.componentRef.setInput('column', column);
    fixture.componentRef.setInput('allColumns', [column]);
    fixture.componentRef.setInput('enableGrouping', true);
    fixture.componentRef.setInput('hasCellValue', true);
    fixture.componentRef.setInput('cellValue', 'A1');
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.we-grid-menu__item') as NodeListOf<HTMLButtonElement>);
    return items.find((item) => item.textContent?.includes(weGridLocaleEn.filterByThisValue));
  }

  it('is not rendered on a filterable:false column', () => {
    expect(quickFilterItemFor({ field: 'code', header: 'Code', filterable: false })).toBeUndefined();
  });

  it('is rendered on a filterable:true column', () => {
    expect(quickFilterItemFor({ field: 'code', header: 'Code', filterable: true })).toBeDefined();
  });

  it('is rendered when filterable is left out, which defaults to true', () => {
    expect(quickFilterItemFor({ field: 'code', header: 'Code' })).toBeDefined();
  });

  it('is not rendered when filterOperators rule out the exact match', () => {
    expect(quickFilterItemFor({ field: 'qty', header: 'Qty', type: 'number', filterOperators: ['gt', 'lt'] })).toBeUndefined();
  });

  it('is rendered on a checklist column whatever filterOperators say — it filters with "in"', () => {
    expect(
      quickFilterItemFor({ field: 'qty', header: 'Qty', type: 'number', headerFilterMode: 'checklist', filterOperators: ['gt'] })
    ).toBeDefined();
  });
});
