# Grouping and group summaries

With `grouping` on, a column's header menu offers **Group by this field**. Rows are then shown in
collapsible groups, each with its record count. Grouping works on the loaded rows.

## Several levels

**Add to grouping** in another column's menu groups the groups again — as many levels as needed,
outermost first; **Remove from grouping** takes one out, **Group by this field** starts over with
that field alone. The toolbar chip lists the levels, each with its own × button. The same from code:

```html
<we-grid [grouping]="true" [groupBy]="['region', 'status']" (groupFieldsChange)="levels = $event" ...></we-grid>
```

| | |
|---|---|
| `groupBy` input | The grouping levels, outermost first. Unknown and repeated fields are dropped. |
| `(groupFieldsChange)` | Every grouping change, with all levels. `(groupChange)` keeps reporting the outermost field only. |
| `groupFields` / `groupField` | The current levels / the outermost one (`groupField` setter = one level). |
| `setGrouping(fields)`, `addGroupField(field)`, `removeGroupField(field)`, `clearGrouping()` | |
| `expandAllGroups()` / `collapseAllGroups()` | Also in the grid menu while grouped. |

A group's open/closed state is remembered by its path (outer value → inner value), so it survives a
new `data` array. Saved views keep every level.

## Group summaries

Each group header shows its count. Summaries per group come from three places, in this order:

1. the column's `groupSummary` — `'sum' | 'avg' | 'min' | 'max' | 'count' | 'none'`, for groups only;
2. the column's `summary` — the same function the grand summary row uses;
3. `groupAutoSummary` — when on, every numeric column without either adds up (`'sum'`).

```ts
columns: WeGridColumnDef<Sale>[] = [
  { field: 'region', header: 'Region' },
  { field: 'units', header: 'Units', type: 'integer' },              // summed by groupAutoSummary
  { field: 'price', header: 'Price', type: 'currency', groupSummary: 'avg' },
  { field: 'status', header: 'Status', groupSummary: 'count' }        // text columns can count
];
```

`groupSummaryPosition` picks where they appear:

- `'header'` (default) — in the group header line: *Units Sum: 401 · Price Average: $161.54*;
- `'footer'` — in a row closing each expanded group, every value under its own column (pinned
  columns stay pinned), the group's name and count in the first cell — like a spreadsheet subtotal;
- `'both'`.

With several levels, every level gets its footer: inner groups close before their outer group does.
Inner levels use `--we-grid-group-nested-bg`.
