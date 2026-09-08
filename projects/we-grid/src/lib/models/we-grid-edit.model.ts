/**
 * Inline row editing (create / update / delete) contracts.
 *
 * The grid NEVER mutates the `data` array it was given and never talks to a backend itself — the
 * same principle as pagination and layout persistence. It owns the editing UI and the draft row;
 * the consumer owns the data. Every commit is reported through an event that carries a `done`
 * callback so an asynchronous backend call can keep the row in its "saving" state and only leave
 * edit mode once the server accepted the change.
 *
 * If the consumer does NOT bind the matching output, the grid falls back to committing the change
 * locally (the edited values are written onto the row object) so demos and offline grids still
 * work without a backend.
 */

/** Editor control used for a cell while its row is in edit mode — inferred from the column type when omitted */
export type WeGridEditorType = 'text' | 'number' | 'date' | 'datetime' | 'checkbox' | 'select';

/** One option of a `select` editor */
export interface WeGridEditorOption {
  value: unknown;
  label: string;
}

/**
 * Called by the consumer once the backend answered. `success: true` closes the editor and clears
 * the row's saving state; `success: false` keeps the row in edit mode and shows `error` (or the
 * locale's generic message) above the editors so the user can correct and retry.
 */
export type WeGridCommitFn = (success: boolean, error?: string) => void;

/** Emitted by `(rowCreate)` and `(rowUpdate)` */
export interface WeGridRowEditEvent<T> {
  /** The row carrying the edited values — a shallow copy, never the object inside `data` */
  row: T;
  /** The untouched row the edit started from — `null` for a row being created */
  original: T | null;
  /** Index of the row inside the rendered data — `-1` for a row being created */
  rowIndex: number;
  /** Only the fields the user actually changed (empty for a row being created) */
  changes: Record<string, unknown>;
  done: WeGridCommitFn;
}

/** Emitted by `(rowDelete)` */
export interface WeGridRowDeleteEvent<T> {
  row: T;
  rowIndex: number;
  done: WeGridCommitFn;
}

/** Internal state of the row currently being edited — exposed so the template can read it */
export interface WeGridEditState<T> {
  /** `rowKey` of the row being edited, or `WE_GRID_NEW_ROW_KEY` while a new row is being created */
  key: unknown;
  /** The row the edit started from — `null` while creating */
  original: T | null;
  rowIndex: number;
  /** field → current editor value */
  draft: Record<string, unknown>;
  /** field → validation message, for columns that failed `required` */
  errors: Record<string, string>;
  /** True while waiting for the consumer's `done` callback */
  saving: boolean;
  /** Message reported by a failed commit */
  error: string | null;
}

/** The sentinel `key` used by the draft row while a new record is being created */
export const WE_GRID_NEW_ROW_KEY = Symbol('we-grid-new-row');

/**
 * Whether an editor's value still equals the one the edit started from. Two cases matter and
 * neither survives `===`: dates come back from an editor as a new object with the same instant,
 * and a field cleared in a text box turns `undefined` into `''` (or vice versa) without the user
 * having changed anything. Both would otherwise be reported as edits and trigger pointless writes.
 */
export function weGridSameEditValue(before: unknown, after: unknown): boolean {
  const beforeEmpty = before === null || before === undefined || before === '';
  const afterEmpty = after === null || after === undefined || after === '';
  if (beforeEmpty || afterEmpty) return beforeEmpty && afterEmpty;

  const beforeDate = before instanceof Date ? before : null;
  const afterDate = after instanceof Date ? after : null;
  if (beforeDate || afterDate) {
    const a = beforeDate ?? new Date(before as string | number);
    const b = afterDate ?? new Date(after as string | number);
    if (!isNaN(a.getTime()) && !isNaN(b.getTime())) return a.getTime() === b.getTime();
  }

  return before === after;
}

/**
 * Editor a column gets when it doesn't declare one. `custom` falls back to a text box: the column
 * renders through a consumer template, so the grid has no idea what shape its value has — an
 * explicit `editor` (or `editable: false`) is the right answer there.
 */
export function weGridDefaultEditor(type: string): WeGridEditorType {
  switch (type) {
    case 'number':
    case 'currency':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'boolean':
      return 'checkbox';
    default:
      return 'text';
  }
}
