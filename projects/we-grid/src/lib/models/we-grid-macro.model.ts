import { WeGridDensity } from './we-grid-column.model';
import { WeGridExportFormat } from './we-grid-export.model';
import { WeGridFormatRule } from './we-grid-format.model';

/**
 * A macro: a named script of grid steps, like an Excel macro but without code — see
 * docs/macros.md for the script language. Scripts are parsed, never evaluated: they can only do
 * what the steps below allow, so a macro shared through a view link is safe to run.
 */
export interface WeGridMacro {
  /** Unique per grid */
  id: string;
  name: string;
  /** The script, one step per line */
  script: string;
  /** Shown as its own toolbar button */
  pinned?: boolean;
}

/** A filter comparison as a script writes it — mapped to the column's filter operator when it runs */
export type WeGridMacroFilterOperator = '=' | '>' | '<' | 'contains' | 'startsWith' | 'between' | 'in';

/** One parsed step of a macro script */
export type WeGridMacroStep =
  | { op: 'sort'; field: string; direction: 'asc' | 'desc' | null }
  | { op: 'filter'; field: string; operator: WeGridMacroFilterOperator; values: (string | number | boolean)[] }
  | { op: 'clearFilters' }
  | { op: 'group'; fields: string[] }
  | { op: 'ungroup' }
  | { op: 'show'; fields: string[] }
  | { op: 'hide'; fields: string[] }
  | { op: 'density'; density: WeGridDensity }
  | { op: 'zebra'; on: boolean }
  | { op: 'format'; rule: Omit<WeGridFormatRule, 'id'> }
  | { op: 'clearFormats'; field: string | null }
  | { op: 'set'; field: string; formula: string; where: string | null }
  | { op: 'view'; name: string }
  | { op: 'export'; format: WeGridExportFormat }
  | { op: 'run'; command: string }
  | { op: 'message'; text: string };

/** A step plus the script line it came from — errors point at the line */
export interface WeGridMacroLine {
  line: number;
  step: WeGridMacroStep;
}

/** A line the parser could not read */
export interface WeGridMacroError {
  /** 1-based */
  line: number;
  message: string;
}

/**
 * A developer command a script calls with `RUN name` — your own TypeScript, registered on the
 * grid's `macroCommands` input. It receives the grid, so it can do anything the grid's API can.
 */
export type WeGridMacroCommand<T = unknown> = (grid: WeGridMacroHost<T>) => void | Promise<void>;

/** What a macro command gets to work with — the grid component */
export interface WeGridMacroHost<T = unknown> {
  /** The rows currently shown, after filters and sorting */
  readonly displayData: T[];
  /** Runs another macro script */
  runScript(script: string): Promise<WeGridMacroError[]>;
}
