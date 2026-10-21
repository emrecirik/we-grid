/** One entry of the row context menu — see `WeGridComponent.rowContextMenu` */
export interface WeGridMenuItem {
  id: string;
  label: string;
  /** A `WE_GRID_ICONS` key — add the host's own icons to that token to use them here */
  icon?: string;
  disabled?: boolean;
  /** Drawn in the danger colour — a destructive action such as Delete */
  danger?: boolean;
  separatorBefore?: boolean;
  /** Opens as a nested list under the item; the item itself then runs no action */
  children?: WeGridMenuItem[];
  action?: () => void;
}

export interface WeGridRowMenuContext<T> {
  /** The column that was right-clicked; null when the menu was opened from the keyboard or outside a data cell */
  field: string | null;
  /** The rows the action applies to: the selection (which then holds the row), or just the row when `selectable` is `'none'` */
  selectedRows: T[];
}

/** Builds the menu for a row; `null` or an empty array leaves the browser's own menu */
export type WeGridRowMenuFn<T> = (row: T, ctx: WeGridRowMenuContext<T>) => WeGridMenuItem[] | null | undefined;

export interface WeGridRowMenuItemClickEvent<T> {
  item: WeGridMenuItem;
  row: T;
}
