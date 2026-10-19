# `<we-pivot>` — pivot tables

*(0.11.0)* Excel's pivot table over any rows. The user picks **Rows**, **Columns** and **Values**
(sum, count, average, min, max) from chips above the table; the result is a we-grid, so it sorts,
filters, formats, exports to Excel / CSV / PDF and remembers its column widths like any other grid.
Outer row fields become groups with subtotals, the last one the rows; there is a total column per
value when column fields are used, and a grand total in the summary row.

```ts
import { WePivotComponent, WePivotConfig } from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WePivotComponent],
  template: `<we-pivot [data]="orders" [fields]="columns" [(config)]="pivot" gridKey="orders-pivot" />`
})
export class SalesPivotComponent {
  columns = ORDER_COLUMNS;            // the same WeGridColumnDef[] the orders grid uses
  orders: Order[] = [];
  pivot: WePivotConfig = {
    rows: ['city', 'category'],
    columns: ['status'],
    values: [{ field: 'total', aggregate: 'sum' }]
  };
}
```

`fields` are ordinary `WeGridColumnDef`s: headers, types, currency formats and `minorUnits` carry
over to the value columns, and **formula columns** (`formula: '=[Qty] * [Price]'`) are evaluated
per row, so a computed Total can be pivoted like any field.

| Input | Type | Default | |
|---|---|---|---|
| `data` | `T[]` | `[]` | All the rows to summarise (not a page) |
| `fields` | `WeGridColumnDef<T>[]` | — | What can be put in Rows, Columns and Values |
| `config` | `WePivotConfig` | empty | `{ rows, columns, values: { field, aggregate }[] }` — two-way with `(configChange)` |
| `gridKey` | `string` | `'pivot'` | Layout key of the result grid; each configuration keeps its own widths |
| `exportFormats` | `WeGridExportFormat[]` | `['xlsx', 'csv', 'pdf']` | The result grid's export buttons |
| `maxHeight` | `number \| string` | `520` | Height of the result grid |
| `maxColumns` | `number` | `200` | Most value columns; beyond that a note says the rest were left out |
| `chart` *(0.12.0)* | `WeChartType \| null` | `null` | Shows the pivot as a chart above the table — two-way with `(chartChange)`; the chart buttons switch it |

Values without a field count the rows. A numeric field starts as Sum, anything else as Count. The
chips' ‹ button moves a field one level out; ⇄ swaps rows and columns.

Subtotals and the grand total are computed by the grid from the cells, so Sum, Count, Min and Max
are exact; for Average the subtotal is the average of the cells.

## Without the component

`wePivot(rows, config, fields, labels, read?, intlLocale?, maxColumns?)` returns
`{ columns, rows, groupBy, truncated }` ready for `<we-grid [columns] [data] [grouping]="true"
[groupBy]>` — use it to put a pivot into your own layout, or on a server.
