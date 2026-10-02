import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeGridComponent } from './we-grid.component';
import { WeGridRowDetailDirective } from './directives/we-grid-row-detail.directive';
import { WeGridColumnDef } from './models/we-grid-column.model';
import { WeGridMenuAction } from './models/we-grid-menu-action.model';
import { WE_GRID_DOM_BASELINE } from './testing/we-grid-dom-baseline';

/**
 * Guards the rendered DOM of the grid with every opt-in feature left off: each scenario below is
 * compared with the markup the grid produced before those features existed. Angular's own
 * bookkeeping (comments, `_ngcontent-*`, `ng-reflect-*`) is stripped first, so only what a
 * stylesheet or a test could see is compared.
 */
interface Row {
  code: string;
  name: string;
  city: string;
  qty: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent, WeGridRowDetailDirective],
  template: `
    <we-grid
      gridKey="dom-snapshot"
      [columns]="columns"
      [data]="data"
      [loading]="loading"
      [selectable]="selectable"
      [editable]="editable"
      [allowDelete]="allowDelete"
      [filterRow]="filterRow"
      [grouping]="grouping"
      [expandable]="expandable"
      [trackByField]="'code'"
      [totalCount]="data.length"
    >
      @if (withDetail) {
        <ng-template weGridRowDetail let-row>
          <div class="detail">{{ row.code }}</div>
        </ng-template>
      }
    </we-grid>
  `
})
class SnapshotHostComponent {
  columns: WeGridColumnDef<Row>[] = [
    { field: 'code', header: 'Code', width: 100 },
    { field: 'name', header: 'Name', width: 160 },
    { field: 'city', header: 'City', width: 120 },
    { field: 'qty', header: 'Qty', type: 'number', width: 90, align: 'end' }
  ];
  data: Row[] = [
    { code: 'A1', name: 'Alpha', city: 'Ankara', qty: 3 },
    { code: 'B2', name: 'Beta', city: 'Izmir', qty: 5 },
    { code: 'C3', name: 'Gamma', city: 'Ankara', qty: 8 }
  ];
  loading = false;
  selectable: 'none' | 'single' | 'multi' = 'none';
  editable = false;
  allowDelete = false;
  filterRow = false;
  grouping = false;
  expandable = false;
  withDetail = false;

  @ViewChild(WeGridComponent) grid!: WeGridComponent<Row>;
}

type Scenario = { name: string; setup: (host: SnapshotHostComponent) => void; after?: (grid: WeGridComponent<Row>) => void };

const SCENARIOS: Scenario[] = [
  { name: 'flat', setup: () => undefined },
  { name: 'empty', setup: (h) => (h.data = []) },
  {
    name: 'loading',
    setup: (h) => {
      h.data = [];
      h.loading = true;
    }
  },
  {
    name: 'select-edit-delete-filter-summary',
    setup: (h) => {
      h.selectable = 'multi';
      h.editable = true;
      h.allowDelete = true;
      h.filterRow = true;
      h.columns = h.columns.map((c) => (c.field === 'qty' ? { ...c, summary: 'sum' } : c));
    },
    after: (grid) => (grid.filterRowVisible = true)
  },
  {
    name: 'detail-open',
    setup: (h) => {
      h.expandable = true;
      h.withDetail = true;
    },
    after: (grid) => grid.toggleRowExpand(grid.displayData[1])
  },
  {
    name: 'grouped',
    setup: (h) => {
      h.grouping = true;
      h.columns = h.columns.map((c) => (c.field === 'qty' ? { ...c, summary: 'sum' } : c));
    },
    after: (grid) => {
      (grid as unknown as { handleMenuAction: (a: WeGridMenuAction) => void }).handleMenuAction({ type: 'group-by', field: 'city' });
      grid.toggleGroupCollapse(grid.groupedSections![1]);
    }
  }
];

/** Re-serialises the markup with every element's attributes sorted, so only their values count */
function sortAttributes(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach((el) => {
    const attrs = Array.from(el.attributes).map((a) => [a.name, a.value] as const);
    attrs.forEach(([name]) => el.removeAttribute(name));
    attrs.sort(([a], [b]) => a.localeCompare(b)).forEach(([name, value]) => el.setAttribute(name, value));
  });
  return template.innerHTML;
}

function normalise(html: string): string {
  return sortAttributes(stripBookkeeping(html));
}

function stripBookkeeping(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(_ngcontent|_nghost)-[a-z0-9-]+(="")?/g, '')
    .replace(/\sng-reflect-[a-z-]+="[^"]*"/g, '')
    .replace(/\sng-version="[^"]*"/g, '')
    // CDK numbers its generated ids with a global counter
    .replace(/(cdk-[a-z-]+-)\d+/g, '$1N')
    // The one intended always-on difference since 0.6.0: the column resize handle became keyboard
    // operable (role="separator", tabindex and an accessible name) — reduced to its 0.6.0 form
    .replace(/<div [^>]*class="we-grid__resize-handle"[^>]*>/g, '<div class="we-grid__resize-handle">')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function render(scenario: Scenario): string {
  localStorage.clear();
  const fixture: ComponentFixture<SnapshotHostComponent> = TestBed.createComponent(SnapshotHostComponent);
  document.body.appendChild(fixture.nativeElement);
  scenario.setup(fixture.componentInstance);
  fixture.detectChanges();
  scenario.after?.(fixture.componentInstance.grid);
  fixture.componentInstance.grid['cdr'].markForCheck();
  fixture.detectChanges();
  const html = normalise((fixture.nativeElement as HTMLElement).querySelector('we-grid')!.innerHTML);
  fixture.destroy();
  fixture.nativeElement.remove();
  return html;
}

describe('WeGridComponent — DOM with the opt-in features off', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SnapshotHostComponent] }).compileComponents();
  });

  for (const scenario of SCENARIOS) {
    it(`renders the same markup as before: ${scenario.name}`, () => {
      const html = render(scenario);
      const baseline = WE_GRID_DOM_BASELINE[scenario.name];
      if (baseline === undefined) {
        // Recording run — the output is collected into testing/we-grid-dom-baseline.ts
        console.log(`@@WE_GRID_SNAPSHOT@@${JSON.stringify({ name: scenario.name, html })}@@END@@`);
        pending('baseline recorded');
        return;
      }
      // Fixed in 0.7.0: an empty header/cell tooltip used to be written as title="null"
      expect(html).toEqual(normalise(baseline).replace(/ title="null"/g, ''));
    });
  }
});
