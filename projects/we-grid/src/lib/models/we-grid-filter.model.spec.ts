import { WeGridColumnType } from './we-grid-column.model';
import { weGridDefaultFilterOperator, weGridFilterOperatorsFor, weGridQuickFilterOperator } from './we-grid-filter.model';

describe('weGridFilterOperatorsFor', () => {
  it('returns the full list of each type when no restriction is given', () => {
    expect(weGridFilterOperatorsFor('text')).toEqual(['contains', 'startsWith', 'equals']);
    expect(weGridFilterOperatorsFor('custom')).toEqual(['contains', 'startsWith', 'equals']);
    expect(weGridFilterOperatorsFor('number')).toEqual(['eq', 'gt', 'lt', 'between']);
    expect(weGridFilterOperatorsFor('currency')).toEqual(['eq', 'gt', 'lt', 'between']);
    expect(weGridFilterOperatorsFor('date')).toEqual(['eq', 'before', 'after', 'between']);
    expect(weGridFilterOperatorsFor('datetime')).toEqual(['eq', 'before', 'after', 'between']);
    expect(weGridFilterOperatorsFor('boolean')).toEqual(['eq']);
  });

  it('starts every full list with the operator weGridDefaultFilterOperator picks, so the default is unchanged', () => {
    const types: WeGridColumnType[] = ['text', 'number', 'date', 'datetime', 'currency', 'boolean', 'custom'];
    for (const type of types) {
      expect(weGridFilterOperatorsFor(type)[0]).toBe(weGridDefaultFilterOperator(type));
    }
  });

  it('narrows the list to the given operators, keeping the order they were given in', () => {
    expect(weGridFilterOperatorsFor('number', ['lt', 'gt'])).toEqual(['lt', 'gt']);
    expect(weGridFilterOperatorsFor('text', ['equals'])).toEqual(['equals']);
  });

  it('drops operators that do not fit the type, and duplicates', () => {
    expect(weGridFilterOperatorsFor('number', ['gt', 'contains', 'gt'])).toEqual(['gt']);
  });

  it('falls back to the full list when nothing in the restriction fits the type', () => {
    expect(weGridFilterOperatorsFor('text', ['gt'])).toEqual(['contains', 'startsWith', 'equals']);
  });

  it('falls back to the full list for an empty restriction', () => {
    expect(weGridFilterOperatorsFor('date', [])).toEqual(['eq', 'before', 'after', 'between']);
  });

  it('hands out a copy, never the shared list', () => {
    weGridFilterOperatorsFor('text').push('gt');
    expect(weGridFilterOperatorsFor('text')).toEqual(['contains', 'startsWith', 'equals']);
  });
});

describe('weGridQuickFilterOperator', () => {
  it("uses 'equals' on text columns and 'eq' on the other types", () => {
    expect(weGridQuickFilterOperator({ type: 'text' })).toBe('equals');
    expect(weGridQuickFilterOperator({ type: 'custom' })).toBe('equals');
    expect(weGridQuickFilterOperator({ type: 'number' })).toBe('eq');
    expect(weGridQuickFilterOperator({ type: 'date' })).toBe('eq');
    expect(weGridQuickFilterOperator({ type: 'boolean' })).toBe('eq');
  });

  it("uses 'in' on a checklist column, whatever filterOperators say", () => {
    expect(weGridQuickFilterOperator({ type: 'number', headerFilterMode: 'checklist', filterOperators: ['gt'] })).toBe('in');
  });

  it('returns null when filterOperators rule out the exact match', () => {
    expect(weGridQuickFilterOperator({ type: 'number', filterOperators: ['gt', 'lt'] })).toBeNull();
    expect(weGridQuickFilterOperator({ type: 'text', filterOperators: ['contains'] })).toBeNull();
    expect(weGridQuickFilterOperator({ type: 'text', filterOperators: ['equals', 'contains'] })).toBe('equals');
  });
});
