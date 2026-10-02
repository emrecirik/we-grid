import { WeGridColumnLayout } from '../models/we-grid-layout.model';
import { WeGridColumnFilterState, WeGridFilterOperator } from '../models/we-grid-filter.model';
import { WeGridSavedView } from '../models/we-grid-view.model';

/** A shared token longer than this is refused outright — no real view comes close */
const MAX_TOKEN_LENGTH = 20000;
/** View names are cut to this many characters */
const MAX_NAME_LENGTH = 100;

const DENSITIES = new Set(['comfortable', 'normal', 'compact']);
const SUMMARIES = new Set(['sum', 'count', 'avg', 'min', 'max', 'none']);
const OPERATORS = new Set<WeGridFilterOperator>(['contains', 'startsWith', 'equals', 'eq', 'gt', 'lt', 'between', 'before', 'after', 'in']);

/** The query parameter a shared link carries a grid's view in — one per `gridKey`, so two grids on a page don't collide */
export function weGridViewParamName(gridKey: string): string {
  return `we-grid-view-${gridKey}`;
}

/** Encodes a view as URL-safe base64 of its JSON — UTF-8 first, so Turkish names survive */
export function weGridEncodeView(view: WeGridSavedView): string {
  const bytes = new TextEncoder().encode(JSON.stringify(view));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Turns a token from `weGridEncodeView` back into a view, or null when it isn't one. A token
 * arrives through a URL anyone can edit, so the result is rebuilt field by field from what has the
 * expected shape — nothing else of the decoded object is kept.
 */
export function weGridDecodeView(token: string): WeGridSavedView | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return weGridSanitizeView(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Rebuilds a view from untrusted input — a decoded link or a stored record — keeping only the
 * fields that have the right shape. Whether a field, operator or sort still fits the grid's current
 * columns is checked when the view is applied, not here.
 */
export function weGridSanitizeView(input: unknown): WeGridSavedView | null {
  if (!isRecord(input) || typeof input['name'] !== 'string' || !Array.isArray(input['columns'])) return null;
  const name = input['name'].trim().slice(0, MAX_NAME_LENGTH);
  if (name === '') return null;

  const view: WeGridSavedView = {
    name,
    columns: input['columns'].map(sanitizeColumn).filter((c): c is WeGridColumnLayout => c !== null)
  };
  if (typeof input['density'] === 'string' && DENSITIES.has(input['density'])) {
    view.density = input['density'] as WeGridSavedView['density'];
  }
  const sort = input['sort'];
  if (isRecord(sort) && typeof sort['field'] === 'string' && (sort['direction'] === 'asc' || sort['direction'] === 'desc')) {
    view.sort = { field: sort['field'], direction: sort['direction'] };
  } else {
    view.sort = null;
  }
  if (Array.isArray(input['filters'])) {
    view.filters = input['filters'].map(sanitizeFilter).filter((f): f is WeGridColumnFilterState => f !== null);
  }
  const groupField = input['groupField'];
  view.groupField = typeof groupField === 'string' ? groupField : null;
  if (typeof input['filterRowVisible'] === 'boolean') view.filterRowVisible = input['filterRowVisible'];
  return view;
}

function sanitizeColumn(input: unknown): WeGridColumnLayout | null {
  if (!isRecord(input) || typeof input['field'] !== 'string' || typeof input['visible'] !== 'boolean' || !isFiniteNumber(input['order'])) {
    return null;
  }
  const pinned = input['pinned'];
  const column: WeGridColumnLayout = {
    field: input['field'],
    visible: input['visible'],
    order: input['order'],
    pinned: pinned === 'left' || pinned === 'right' ? pinned : null
  };
  if (isFiniteNumber(input['width']) && input['width'] > 0) column.width = input['width'];
  if (typeof input['wrap'] === 'boolean') column.wrap = input['wrap'];
  if (typeof input['headerOverride'] === 'string') column.headerOverride = input['headerOverride'].slice(0, MAX_NAME_LENGTH);
  if (typeof input['summary'] === 'string' && SUMMARIES.has(input['summary'])) {
    column.summary = input['summary'] as WeGridColumnLayout['summary'];
  }
  return column;
}

function sanitizeFilter(input: unknown): WeGridColumnFilterState | null {
  if (!isRecord(input) || typeof input['field'] !== 'string' || !OPERATORS.has(input['operator'] as WeGridFilterOperator)) return null;
  const operator = input['operator'] as WeGridFilterOperator;
  const value = input['value'];
  // Only plain values travel in a filter; an 'in' filter is the one operator with an array of them
  if (operator === 'in') {
    if (!Array.isArray(value) || !value.every(isPlainValue)) return null;
  } else if (!isPlainValue(value)) {
    return null;
  }
  const filter: WeGridColumnFilterState = { field: input['field'], operator, value };
  if (isPlainValue(input['value2']) && input['value2'] !== null) filter.value2 = input['value2'];
  return filter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || isFiniteNumber(value);
}
