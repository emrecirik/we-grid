/**
 * Column data type — cell rendering, default formatting, filtering, editing, export and import are
 * driven by this.
 *
 * - `'text'` — plain text
 * - `'number'` — a number; `format: '2-2'` sets the min-max fraction digits
 * - `'integer'` — a whole number, shown without fraction digits
 * - `'currency'` — money in the locale's (or `format`'s) currency; add `minorUnits: true` when the
 *   value is stored in the minor unit (kuruş, cents — `12345` → ₺123,45)
 * - `'percent'` — a FRACTION shown as a percentage (`0.255` → %25,5); `format` sets fraction digits
 * - `'date'` / `'datetime'` — a `Date` or anything `new Date()` accepts
 * - `'time'` — a time of day, either `'HH:mm'` / `'HH:mm:ss'` text or a `Date`
 * - `'boolean'` — shown as the locale's Yes / No
 * - `'email'` / `'url'` / `'phone'` — text rendered as a `mailto:` / web / `tel:` link
 * - `'custom'` — rendered by a cell template only
 */
export type WeGridColumnType =
  | 'text'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'time'
  | 'currency'
  | 'percent'
  | 'boolean'
  | 'email'
  | 'url'
  | 'phone'
  | 'custom';

/**
 * The family a column type behaves like when filtering, sorting and summarising: every numeric type
 * filters with = > < between, every date type with a calendar picker, and so on.
 */
export type WeGridValueKind = 'text' | 'number' | 'date' | 'boolean';

/** Maps a column type onto the family it filters, sums and edits like — see WeGridValueKind */
export function weGridValueKind(type: WeGridColumnType | undefined): WeGridValueKind {
  switch (type) {
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

/** Sort direction */
export type WeGridSortDirection = 'asc' | 'desc' | null;

/**
 * What the column header's funnel icon opens.
 * 'checklist' (the grid default since 0.5.0) is the Excel/DevExpress style list of the distinct
 * values in the data; 'operator' is the classic operator + single value popover.
 */
export type WeGridHeaderFilterMode = 'operator' | 'checklist';
