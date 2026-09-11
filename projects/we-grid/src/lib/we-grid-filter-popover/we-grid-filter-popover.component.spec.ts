import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridColumnDef } from '../models/we-grid-column.model';
import { WeGridChecklistOption, WeGridFilterOperator } from '../models/we-grid-filter.model';
import { WeGridInternalColumn } from '../models/we-grid-internal.model';
import { WE_GRID_LOCALE, WeGridLocale, weGridLocaleEn, weGridLocaleTr } from '../models/we-grid-locale.model';
import { mergeGridLayout } from '../services/we-grid-layout-merge';
import { WeGridFilterPopoverAction, WeGridFilterPopoverComponent } from './we-grid-filter-popover.component';

function internalColumn(def: WeGridColumnDef<unknown>): WeGridInternalColumn<unknown> {
  return mergeGridLayout<unknown>([def], null, 1).columns[0];
}

describe('WeGridFilterPopoverComponent — operator select', () => {
  let fixture: ComponentFixture<WeGridFilterPopoverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WeGridFilterPopoverComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridFilterPopoverComponent);
  });

  function renderedOperators(def: WeGridColumnDef<unknown>, operator: WeGridFilterOperator): { value: string; label: string }[] {
    fixture.componentRef.setInput('column', internalColumn(def));
    fixture.componentRef.setInput('filterState', { field: def.field, operator, value: null });
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('.we-grid-filter-popover__select') as HTMLSelectElement;
    return Array.from(select.options).map((option) => ({ value: option.value, label: option.textContent?.trim() ?? '' }));
  }

  it("offers the column type's full list when filterOperators is omitted", () => {
    expect(renderedOperators({ field: 'qty', header: 'Qty', type: 'number' }, 'eq')).toEqual([
      { value: 'eq', label: '=' },
      { value: 'gt', label: '>' },
      { value: 'lt', label: '<' },
      { value: 'between', label: 'Between' }
    ]);
  });

  it('narrows the select to filterOperators — the same list the filter row renders', () => {
    const operators = renderedOperators({ field: 'qty', header: 'Qty', type: 'number', filterOperators: ['gt', 'lt'] }, 'gt');
    expect(operators.map((o) => o.value)).toEqual(['gt', 'lt']);
  });

  it('labels date and text operators with the locale words', () => {
    expect(renderedOperators({ field: 'at', header: 'At', type: 'date', filterOperators: ['before', 'after'] }, 'before')).toEqual([
      { value: 'before', label: 'Before' },
      { value: 'after', label: 'After' }
    ]);
  });
});

describe('WeGridFilterPopoverComponent — checklist search', () => {
  let fixture: ComponentFixture<WeGridFilterPopoverComponent>;

  const options: WeGridChecklistOption[] = ['İSTANBUL', 'Ankara', 'Iğdır'].map((city) => ({ value: city, key: city, label: city, blank: false }));

  async function createPopover(locale?: WeGridLocale): Promise<WeGridFilterPopoverComponent> {
    await TestBed.configureTestingModule({
      imports: [WeGridFilterPopoverComponent],
      providers: locale ? [{ provide: WE_GRID_LOCALE, useValue: locale }] : []
    }).compileComponents();
    fixture = TestBed.createComponent(WeGridFilterPopoverComponent);
    fixture.componentRef.setInput('column', internalColumn({ field: 'city', header: 'Şehir', headerFilterMode: 'checklist' }));
    fixture.componentRef.setInput('filterState', { field: 'city', operator: 'in', value: [] });
    fixture.componentRef.setInput('options', options);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('finds "İSTANBUL" for "istanbul" and "Iğdır" for "ığ" with the Turkish locale', async () => {
    const popover = await createPopover(weGridLocaleTr);
    popover.search = 'istanbul';
    expect(popover.visibleOptions.map((o) => o.label)).toEqual(['İSTANBUL']);
    popover.search = 'IĞ';
    expect(popover.visibleOptions.map((o) => o.label)).toEqual(['Iğdır']);
  });

  it('keeps the English default search as it was', async () => {
    const popover = await createPopover();
    popover.search = 'ank';
    expect(popover.visibleOptions.map((o) => o.label)).toEqual(['Ankara']);
    popover.search = 'istanbul';
    expect(popover.visibleOptions).toEqual([]);
  });
});

describe('WeGridFilterPopoverComponent — provider-backed checklist', () => {
  let fixture: ComponentFixture<WeGridFilterPopoverComponent>;
  let popover: WeGridFilterPopoverComponent;
  let actions: WeGridFilterPopoverAction[];

  const options: WeGridChecklistOption[] = ['Ankara', 'İzmir'].map((city) => ({ value: city, key: city, label: city, blank: false }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WeGridFilterPopoverComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridFilterPopoverComponent);
    popover = fixture.componentInstance;
    actions = [];
    popover.action.subscribe((action) => actions.push(action));
    fixture.componentRef.setInput('column', internalColumn({ field: 'city', header: 'City', headerFilterMode: 'checklist' }));
    fixture.componentRef.setInput('filterState', { field: 'city', operator: 'in', value: [] });
    fixture.componentRef.setInput('options', options);
  });

  function render(inputs: Record<string, unknown>): HTMLElement {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('reports the search box outward and lists what came back without narrowing it again', () => {
    render({ remoteSearch: true });
    popover.onSearchChange('zzz');
    expect(actions).toEqual([{ type: 'search', term: 'zzz' }]);
    expect(popover.visibleOptions.map((o) => o.label)).toEqual(['Ankara', 'İzmir']);
  });

  it('keeps searching locally, without an action, when the values come from the loaded rows', () => {
    render({ remoteSearch: false });
    popover.onSearchChange('ank');
    expect(actions).toEqual([]);
    expect(popover.visibleOptions.map((o) => o.label)).toEqual(['Ankara']);
  });

  it('marks the list busy and announces loading instead of "no matching values"', () => {
    const el = render({ remoteSearch: true, options: [], loading: true });
    expect(el.querySelector('.we-grid-filter-popover__list')!.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain(weGridLocaleEn.checklistValuesLoading);
    expect(el.textContent).not.toContain(weGridLocaleEn.noMatchingValues);
  });

  it('places the retry button right after the search box, before the value list', () => {
    const el = render({ remoteSearch: true, options: [], loadError: true });
    const controls = Array.from(el.querySelectorAll('input, button'));
    const search = el.querySelector('input[type="search"]')!;
    const retry = el.querySelector('.we-grid-filter-popover__retry') as HTMLButtonElement;

    expect(el.textContent).toContain(weGridLocaleEn.checklistValuesError);
    expect(controls.indexOf(retry)).toBe(controls.indexOf(search) + 1);

    retry.click();
    expect(actions).toEqual([{ type: 'retry' }]);
  });

  it('names the limit in the truncation note', () => {
    const el = render({ remoteSearch: true, hasMore: true, valuesLimit: 50 });
    expect(el.textContent).toContain(weGridLocaleEn.checklistValuesTruncated(50));
  });
});
