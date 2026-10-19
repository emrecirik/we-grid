# Data sources and backends

*(0.11.0)* we-grid never makes a request on its own — you load rows and hand them over. For the
common case, a table in a SQL database, the package ships a small client for the **we-report data
protocol**, the REST contract of the sister project
[we-report](https://github.com/emrecirik/we-report). Ready-made backends implement it in
**.NET, Spring Boot (Java), Node.js, Python, Go and PHP**, all verified by the same conformance
suite on SQLite and PostgreSQL, so the same backend serves your grids, your spreadsheets and your
reports.

Try it without writing code: [we-grid Studio → Your database](https://emrecirik.github.io/we-grid/studio/#data).

## 1. Run a backend

```bash
git clone https://github.com/emrecirik/we-report
cd we-report/samples/backends/node        # or dotnet, spring-boot, python, go, php
WE_REPORT_CORS_ORIGINS=http://localhost:4200 npm start
```

Each backend's README shows its own start command and how to point it at your database
(`WE_REPORT_CONNECTIONS`). Out of the box they serve a fictional sample shop in SQLite on
`http://127.0.0.1:5480`, only to local callers. Protocol 1.1 (what the grid needs) adds paging,
`distinct`, case-insensitive `contains` / `startsWith`, a row `total`, and `/v1/layouts/{key}`
for saved layouts — see `protocol/openapi.yaml` in that repository.

Security is the backend's job and the samples take it seriously: values are always driver
parameters, identifiers are checked against the database schema, connection strings never reach
the browser, POST/PUT bodies must be JSON, and non-local callers need a token
(`WE_REPORT_AUTH_TOKEN`) or your own auth hook.

## 2. A server-side grid in a few lines

```ts
import {
  WeGridColumnDef, WeGridColumnFilterState, WeGridComponent, WeGridFilterChangeEvent, WeGridPageChange, WeGridSortChange,
  WeGridProtocolClient, WeGridProtocolDataSource, weGridColumnsFromTable
} from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid gridKey="customers" [columns]="columns" [data]="rows" [loading]="loading"
      [serverSide]="true" [totalCount]="total" [page]="page" [pageSize]="pageSize"
      (pageChange)="onPage($event)" (sortChange)="onSort($event)"
      [filterRow]="true" filterMode="server" (filterChange)="onFilter($event)"
      [checklistValuesProvider]="source.checklistValues" />
  `
})
export class CustomersComponent {
  private readonly client = new WeGridProtocolClient({ baseUrl: 'http://127.0.0.1:5480' });
  readonly source = new WeGridProtocolDataSource<Customer>(this.client, 'sample', 'customers');

  columns: WeGridColumnDef<Customer>[] = [];
  rows: Customer[] = [];
  total = 0;
  page = 1;
  pageSize = 25;
  private request: { sort: WeGridSortChange | null; filters: WeGridColumnFilterState[] } = { sort: null, filters: [] };
  loading = false;

  async ngOnInit() {
    const tables = await this.client.tables('sample');
    this.columns = weGridColumnsFromTable(tables.find((t) => t.name === 'customers')!);
    this.load();
  }

  onPage(e: WeGridPageChange) { this.page = e.page; this.pageSize = e.pageSize; this.load(); }
  onSort(e: WeGridSortChange) { this.request.sort = e; this.page = 1; this.load(); }
  onFilter(e: WeGridFilterChangeEvent) { this.request.filters = [...e]; if (e.resetPage) this.page = 1; this.load(); }

  private async load() {
    this.loading = true;
    const { rows, total } = await this.source.load({ page: this.page, pageSize: this.pageSize, ...this.request });
    this.rows = rows;
    this.total = total;
    this.loading = false;
  }
}
```

`WeGridProtocolDataSource.load()` turns the grid's page, sort and filters into one query
(`offset`/`limit`, `orderBy`, `where`, `count`) and returns the page and the total.
`checklistValues` lists a column's distinct values from the whole table — narrowed by the other
filters and the search box — for the Excel-style checklist header filter.

`weGridColumnsFromTable(table)` builds columns from the schema: numbers, dates and booleans get
their column types, `order_date` becomes "Order date". Use it as a starting point and adjust.

## 3. Save layouts, views and sheets on the backend

```ts
const client = new WeGridProtocolClient({ baseUrl: environment.api, token: auth.token });

providers: [
  // the user's id as a prefix, so every user has their own layouts
  { provide: WE_GRID_LAYOUT_STORE, useFactory: () => new WeGridProtocolLayoutStore(client, `u${auth.userId}:`) },
  { provide: WE_SHEET_STORE, useFactory: () => new WeSheetProtocolStore(client, `u${auth.userId}:sheet:`) }
]
```

Column widths and order, density, the user's formatting rules, formula columns, macros and saved
views (`<gridKey>::views`) then follow the user to any browser. The grid sanitises whatever a store
returns, so a tampered record cannot inject CSS, markup or code.

## Reference

| Export | |
|---|---|
| `WeGridProtocolClient` | `info()`, `connections()`, `tables(connection)`, `query(connection, query, count?)`, `getLayout(key)`, `putLayout(key, doc)`, `deleteLayout(key)`. Options: `baseUrl`, `token`, `fetch` |
| `WeGridProtocolDataSource<T>` | `new (client, connection, table, columns?)` · `load({ page, pageSize, sort, filters })` · `checklistValues` |
| `WeGridProtocolLayoutStore` | `WeGridLayoutStore` over `/v1/layouts` — `new (client, prefix = 'grid:')` |
| `WeSheetProtocolStore` | `WeSheetStore` over `/v1/layouts` — `new (client, prefix = 'sheet:')` |
| `weGridProtocolWhere(filters)` | Grid filters → protocol conditions |
| `weGridColumnsFromTable(table)` | Schema → `WeGridColumnDef[]` |
| `WeGridProtocolError` | Thrown for non-2xx answers: `status` and the backend's message |

Your own API instead? Nothing here is required — implement `(pageChange)` / `(filterChange)` /
`(sortChange)` against any endpoint as [server-side.md](server-side.md) shows, and
`WeGridLayoutStore` / `WeSheetStore` against any storage.
