# Coming from Excel

What you do in Excel, and where it is in we-grid. **Grid** is `<we-grid>` (a data table bound to
your rows), **Sheet** is `<we-sheet>` / `<we-workbook>` (a free-form spreadsheet). Both run in the
browser with no dependency beyond Angular CDK.

| In Excel | In we-grid | Where |
|---|---|---|
| Formulas (`=SUM(B2:B9)`, `=IF(…)`, `=XLOOKUP(…)`) | 90-odd functions, English or Turkish names, `,` or `;` | Sheet: any cell · Grid: formula columns `=[Price] * [Qty]` — [formulas.md](formulas.md) |
| Insert Function (ƒx) | The ƒ button, searchable in English or Turkish | Sheet |
| References to other sheets (`=Sales!B2`) | Same syntax, renames and inserts follow | Sheet (`<we-workbook>`) — [sheet.md](sheet.md) |
| AutoSum (Σ, Alt+=) | Σ button, Alt+= | Sheet |
| Fill handle, Ctrl+D | Drag the corner square, double-click it, Ctrl+D | Sheet |
| Paste Special → Values (Ctrl+Shift+V) | Ctrl+Shift+V | Sheet |
| Copy / paste with Excel | Ctrl+C / Ctrl+V both ways | Grid and Sheet |
| Sort, custom sort by several columns | Click a header; Shift+click more | Grid · Sheet: sort the selection |
| AutoFilter | Header checklist filters | Grid: every column · Sheet: *Table options → Filter buttons* |
| Conditional formatting (highlight rules, top 10, colour scales, data bars, icon sets) | The Format panel | Grid: column menu → Format… · Sheet: right-click → Conditional formatting — [formatting.md](formatting.md) |
| Cell styles, number formats, decimals | Toolbar / Format panel | Grid and Sheet |
| Banded rows | Zebra rows | Grid and Sheet |
| Freeze panes | Pinned columns, sticky header · Freeze panes at the active cell | Grid · Sheet |
| Merge & Center | The merge button | Sheet |
| Borders | The borders button — all, outside, bottom, none | Sheet |
| Wrap Text | The wrap button | Sheet |
| Data validation list | Dropdown lists | Sheet: right-click → Dropdown list… |
| Notes / comments | Notes | Sheet: right-click → Note… |
| Find and replace (Ctrl+F, Ctrl+H) | Same keys | Sheet · Grid: the search box finds across columns |
| PivotTable | `<we-pivot>` | [pivot.md](pivot.md) |
| Charts | `<we-chart>`, and charts from a sheet selection or a pivot | [charts.md](charts.md) |
| Subtotals, outline | Grouping with group summaries, several levels | Grid — [grouping.md](grouping.md) |
| Macros (record, edit, buttons) | A safe step language — recorder, editor, toolbar buttons, your own TypeScript commands | Grid — [macros.md](macros.md) |
| Custom views | Saved views, shareable as a link | Grid — [saved-views.md](saved-views.md) |
| Open / save .xlsx | Import and export; the sheet keeps formulas, number formats and every sheet | Grid and Sheet — [export-import.md](export-import.md) |
| Get Data (a database) | The we-report data protocol with .NET, Java, Node.js, Python, Go and PHP backends | [data-sources.md](data-sources.md) |

Not there (yet): charts inside the exported .xlsx, array formulas that spill,
`TEXT` date codes, pivot charts in Excel files.
