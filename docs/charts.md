# `<we-chart>` — charts

*(0.12.0)* Column, bar, line, area, pie and donut charts in plain SVG — no charting library. They
follow the grid's theme (light, dark, the Apple theme) and are built to read well: thin bars with
rounded data ends, 2px lines with ringed markers, hairline gridlines, round axis numbers
(0 / 20K / 40K), a legend whenever there are two or more series, a tooltip with every value of
the hovered category, and a **Show as table** switch that carries the same numbers for screen
readers, print and colour-blind readers.

```ts
import { WeChartComponent, WeChartData } from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart type="column" [data]="sales" title="Sales by month" showValues />`
})
export class SalesChartComponent {
  sales: WeChartData = {
    categories: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'North', values: [12000, 18500, 21000] },
      { name: 'South', values: [9000, 11000, null] }   // null leaves a gap
    ]
  };
}
```

| Input | Type | Default | |
|---|---|---|---|
| `type` | `'column' \| 'bar' \| 'line' \| 'area' \| 'pie' \| 'donut'` | `'column'` | Pie and donut chart the first series |
| `data` | `WeChartData` | empty | `{ categories: string[], series: { name, values }[] }` |
| `stacked` | `boolean` | `false` | Stack column, bar and area series |
| `title` | `string` | `''` | Shown above the chart, and its accessible name |
| `height` | `number` | `300` | Pixels; the width follows the container |
| `valueFormatter` | `(n: number) => string` | locale number | Text of values in the tooltip and the table |
| `showTable` | `boolean` | `false` | Start in the table view |
| `showValues` | `boolean` | `false` | *(0.54.0)* Draw each data point's value on the chart, using `valueFormatter` |
| `showSummary` | `boolean` | `false` | *(0.59.0)* Show the chart's one-sentence summary under it — highest, lowest, total, trend. Screen readers get it either way |

**Waterfall** *(0.59.0)*: `type="waterfall"` draws the first series as changes — each bar starts
where the running total stands and rises (success colour) or falls (danger colour) by its value,
and a last **Total** bar (`chartTotal`) shows where it ends. Empty values move nothing.

**Keyboard and screen readers** *(0.59.0)*: the plot is one tab stop (not on a gauge or a sparkline, which show one value or a trend). The arrow keys move a ring
from value to value — along the categories with ←/→ (↑/↓ on a bar chart) and across the series with
↑/↓ — Home/End jump to the ends, Enter or Space fires `pointClick`, Esc leaves. Each value is
announced in a polite live region, and the plot is described by a deterministic summary
(`weChartSummary` + the locale's `chartSummaryText`): how many values, the highest and lowest point,
the total, and whether the first series rose, fell or stayed within 5 %. No language model, the same
sentence every time. When the chart is clickable each mark also stays focusable, as before.

Series colours are the theme's `--we-grid-chart-1` … `--we-grid-chart-8`, always in that order: a
series keeps its colour when others are filtered out. The default eight were checked for
colour-vision deficiencies on both the light and the dark surface. More than eight series are
added up into **Other** (pies do the same with categories) rather than inventing a ninth colour.

With `showValues`, column labels sit above the bar (inside it, in contrasting text, if there's no
room above); bar labels sit just past the bar end (inside near the end if no room); line/area
labels sit above each point, skipping one that would overlap the previous label; stacked segments
get their own label only when they're at least 14px tall/wide; pie and donut slices get a label
when the slice is at least ~12° wide. The table view stays the accessible representation — the
labels are `aria-hidden`.

`weChartFromRows(rows, categoryOf, series)` turns rows into `WeChartData`;
`weChartTicks`, `weChartFold`, `weChartArc`, `weChartBarPath`, `weChartColor`,
`weChartStackedLabelFits`, `weChartPieLabelFits`, `weChartColumnLabelFits`, `weChartBarLabelFits`,
`weChartLabelCollides` and `weChartLabelColor` are the pure helpers the component uses.

*(0.57.0)* `weChartToSvg(element, { background?, title? })` turns a rendered `<we-chart>` (or an
element holding one) into a standalone SVG document — the plot with every colour and font written
onto its shapes, the title above, the legend below; `null` while the chart shows its table.
`weChartSvgToPng(svg, width, height, scale = 2)` renders that to a PNG `Blob`:

```ts
const image = weChartToSvg(chartEl, { background: '#fff' });
if (image) weGridDownloadBlob(await weChartSvgToPng(image.svg, image.width, image.height), 'sales.png');
```

## In the grid

*(0.57.0)* With `cellSelection`, a right click on a selected block offers **Chart range ▸** — a
chart dialog with type, category, series, combining, PNG / SVG / Excel-with-chart export and
click-to-filter. See [Range charts](api.md#range-charts).

## In the pivot table and the spreadsheet

- `<we-pivot>` has chart buttons next to its fields (and a `chart` input / `chartChange` output,
  plus a `chartShowValues` pass-through to the chart's `showValues`): the pivot rows become
  categories and the value columns series.
- `<we-sheet>`'s chart button charts the selection — or, with one cell selected, the whole used
  range. The first column gives the categories, the first row the series names when it holds text.
  The chart is saved with the sheet (`WeSheetData.chart`), updates as the cells change, and its
  type can be switched or the chart removed from the bar above it.
