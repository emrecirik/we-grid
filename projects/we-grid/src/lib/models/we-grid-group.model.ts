/** A single row within a group — index is its position in the MAIN (ungrouped) displayData array (used for rowClick/expand context) */
export interface WeGridGroupRowEntry<T> {
  row: T;
  index: number;
}

/** A single group section shown in the table while grouping is active */
export interface WeGridGroupSection<T> {
  /** String key for the group value — also used to remember the collapsed state */
  key: string;
  /** Formatted label shown in the group header (respects the column's format) */
  label: string;
  rows: WeGridGroupRowEntry<T>[];
  collapsed: boolean;
}
