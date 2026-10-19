/**
 * A colour from the theme's formatting palette — `--we-grid-format-<name>-fg` (text) and
 * `--we-grid-format-<name>-bg` (fill). Styles name a palette colour instead of carrying a CSS value,
 * so a saved or shared format follows the theme, dark mode included, and can never inject CSS.
 */
export type WeGridFormatColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'gray';

/** Every palette colour, in the order the format panel offers them */
export const WE_GRID_FORMAT_COLORS: readonly WeGridFormatColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];

/** Text styling for a cell — a column's base style, or what a matching format rule applies */
export interface WeGridCellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour */
  color?: WeGridFormatColor;
  /** Background fill */
  fill?: WeGridFormatColor;
}

/**
 * When a `'condition'` rule matches, Excel's "Highlight cells rules" and "Top/bottom rules":
 *
 * - `gt` `gte` `lt` `lte` `eq` `neq` — compared with `value` (numbers and dates numerically, text
 *   case-insensitively)
 * - `between` / `notBetween` — `value` to `value2`, inclusive
 * - `contains` `notContains` `startsWith` `endsWith` — text
 * - `empty` / `notEmpty`
 * - `top` / `bottom` — the `value` highest/lowest numbers of the column (`value` defaults to 10)
 * - `aboveAverage` / `belowAverage`
 * - `duplicate` / `unique` — the value appears more than once / exactly once in the column
 * - `formula` — `value` is a formula such as `=[Amount] > [Limit]` evaluated for the row; the rule
 *   matches when it returns TRUE or a non-zero number
 */
export type WeGridFormatOperator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'between'
  | 'notBetween'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'empty'
  | 'notEmpty'
  | 'top'
  | 'bottom'
  | 'aboveAverage'
  | 'belowAverage'
  | 'duplicate'
  | 'unique'
  | 'formula';

/**
 * A conditional formatting rule on one column.
 *
 * - `'condition'` — applies `style` to the cell (or the whole row with `applyTo: 'row'`) when
 *   `operator` matches
 * - `'colorScale'` — shades every numeric cell between `colors[0]` (lowest) and the last colour
 *   (highest), through `colors[1]` when three are given
 * - `'dataBar'` — draws a bar in `color` whose length is the value's share of the column's range
 * - `'iconSet'` *(0.16.0)* — an arrow or dot before the value: green for the top third of the
 *   column's range, yellow for the middle, red for the bottom (`reverse` swaps green and red)
 *
 * Rules are evaluated over the rows the grid currently shows, so a filter changes what "top 10" or
 * "above average" means — as in Excel. When several rules style the same cell, the first one in the
 * list wins for each property it sets.
 */
export interface WeGridFormatRule {
  /** Unique per grid — the format panel generates one */
  id: string;
  field: string;
  type: 'condition' | 'colorScale' | 'dataBar' | 'iconSet';
  operator?: WeGridFormatOperator;
  value?: string | number | null;
  value2?: string | number | null;
  style?: WeGridCellStyle;
  /** Whether a `'condition'` rule styles only the cell or the entire row — defaults to `'cell'` */
  applyTo?: 'cell' | 'row';
  /** `'colorScale'`: two or three palette colours, lowest value first */
  colors?: WeGridFormatColor[];
  /** `'dataBar'`: the bar colour */
  color?: WeGridFormatColor;
  /** `'iconSet'`: arrows (▲ ► ▼) or dots, by the value's place in the column's range — top third, middle, bottom */
  icons?: WeGridFormatIconSet;
  /** `'iconSet'`: low values are good (green) and high ones bad */
  reverse?: boolean;
}

/** The icon sets a rule can show — see WeGridFormatRule.icons */
export type WeGridFormatIconSet = 'arrows' | 'dots';

/** The ready-made styles the format panel offers for a highlight rule, as in Excel */
export type WeGridFormatPreset = 'redFill' | 'yellowFill' | 'greenFill' | 'blueFill' | 'redText' | 'bold';

export const WE_GRID_FORMAT_PRESETS: Readonly<Record<WeGridFormatPreset, WeGridCellStyle>> = {
  redFill: { fill: 'red', color: 'red' },
  yellowFill: { fill: 'yellow', color: 'yellow' },
  greenFill: { fill: 'green', color: 'green' },
  blueFill: { fill: 'blue', color: 'blue' },
  redText: { color: 'red' },
  bold: { bold: true }
};

/** The colour scales the format panel offers */
export type WeGridFormatScalePreset = 'redGreen' | 'greenRed' | 'redYellowGreen' | 'grayBlue';

export const WE_GRID_FORMAT_SCALES: Readonly<Record<WeGridFormatScalePreset, WeGridFormatColor[]>> = {
  redGreen: ['red', 'green'],
  greenRed: ['green', 'red'],
  redYellowGreen: ['red', 'yellow', 'green'],
  grayBlue: ['gray', 'blue']
};
