import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mergeGridLayout } from '../services/we-grid-layout-merge';
import { WeGridCellEditorComponent } from './we-grid-cell-editor.component';

describe('WeGridCellEditorComponent — date and datetime round trip', () => {
  let fixture: ComponentFixture<WeGridCellEditorComponent>;
  let emitted: unknown[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WeGridCellEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(WeGridCellEditorComponent);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
  });

  function editorFor(type: 'date' | 'datetime', value: unknown): WeGridCellEditorComponent {
    const column = mergeGridLayout<unknown>([{ field: 'at', header: 'At', type }], null, 1).columns[0];
    fixture.componentRef.setInput('column', column);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('emits the picked day as yyyy-MM-dd for a string value that was already UTC midnight', () => {
    editorFor('date', '2026-09-11T00:00:00.000Z').emitDate('2026-09-11');
    expect(emitted).toEqual(['2026-09-11']);
  });

  it('keeps the day of a value stored as local midnight instead of re-anchoring it to UTC midnight', () => {
    // Local midnight serialized as UTC — "2026-09-10T21:00:00.000Z" in UTC+3. Built from local date
    // parts so the test means the same thing in whatever timezone the suite runs in.
    const localMidnight = new Date(2026, 8, 11).toISOString();
    const editor = editorFor('date', localMidnight);
    expect(editor.dateValue).toBe('2026-09-11');

    editor.emitDate('2026-09-11');

    // 0.3.0 emitted "2026-09-11T00:00:00.000Z" here: the same day on paper, but a different instant
    // than the one the row carried anywhere outside UTC.
    expect(emitted).toEqual(['2026-09-11']);
  });

  it('still emits a Date for a row whose value is a Date', () => {
    editorFor('date', new Date('2026-09-11T00:00:00.000Z')).emitDate('2026-09-11');
    expect(emitted.length).toBe(1);
    expect(emitted[0] instanceof Date).toBeTrue();
    expect((emitted[0] as Date).toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });

  it('still emits the UTC instant of the picked local time for a datetime editor', () => {
    editorFor('datetime', '2026-09-11T14:30:00.000Z').emitDate('2026-09-11T17:30');
    expect(emitted).toEqual([new Date(2026, 8, 11, 17, 30).toISOString()]);
  });

  it('emits null when the input is cleared, for both editors', () => {
    editorFor('date', '2026-09-11T00:00:00.000Z').emitDate('');
    editorFor('datetime', '2026-09-11T14:30:00.000Z').emitDate('');
    expect(emitted).toEqual([null, null]);
  });
});
