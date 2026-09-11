import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output } from '@angular/core';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';

/**
 * The control rendered in place of a cell's text while its row is in inline edit mode.
 *
 * Split out of the grid template rather than inlined because the same editor is needed in three
 * places (ungrouped rows, grouped rows, and the draft row of a record being created) — one
 * component keeps the `type → control` mapping in a single place instead of three copies that
 * drift apart. The editor is fully controlled: it never owns the value, it only reports changes
 * through `valueChange`, exactly like the filter popover.
 */
@Component({
  selector: 'we-grid-cell-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './we-grid-cell-editor.component.html',
  styleUrls: ['./we-grid-cell-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'we-grid-cell-editor-host' }
})
export class WeGridCellEditorComponent {
  @Input({ required: true }) column!: WeGridInternalColumn<unknown>;
  @Input() value: unknown = null;
  /** Draws the invalid outline — driven by the grid's `required` validation, not by the editor */
  @Input() invalid = false;
  /** True while the row's commit is in flight, so the user cannot keep typing into a saving row */
  @Input() disabled = false;

  @Output() valueChange = new EventEmitter<unknown>();

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  get label(): string {
    return weGridDisplayHeader(this.column);
  }

  get textValue(): string {
    return this.value === null || this.value === undefined ? '' : String(this.value);
  }

  get numberValue(): number | null {
    if (this.value === null || this.value === undefined || this.value === '') return null;
    const num = Number(this.value);
    return isNaN(num) ? null : num;
  }

  get booleanValue(): boolean {
    return !!this.value;
  }

  /**
   * `<input type="date">` only accepts `yyyy-MM-dd` (and `yyyy-MM-ddTHH:mm` for datetime-local).
   * Local date parts are used deliberately: `toISOString()` would shift the day for anyone east or
   * west of UTC around midnight.
   */
  get dateValue(): string {
    const date = this.toDate(this.value);
    if (!date) return '';
    const pad = (n: number): string => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return this.column.editor === 'datetime' ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  emitText(raw: string): void {
    this.valueChange.emit(raw === '' ? null : raw);
  }

  emitNumber(raw: string | number | null): void {
    if (raw === '' || raw === null || raw === undefined) {
      this.valueChange.emit(null);
      return;
    }
    const num = Number(raw);
    this.valueChange.emit(isNaN(num) ? null : num);
  }

  emitBoolean(checked: boolean): void {
    this.valueChange.emit(checked);
  }

  emitOption(value: unknown): void {
    this.valueChange.emit(value);
  }

  /**
   * The row's original value decides the shape the edit is reported in: a field that arrived from
   * the backend as a string is emitted back as a string, so a round-trip through the editor doesn't
   * silently change the payload's type.
   *
   * A `date` editor on a string field emits the picked calendar day itself (`yyyy-MM-dd`). Going
   * through `new Date(raw).toISOString()` would pin it to UTC midnight, while `dateValue` reads the
   * LOCAL day — so a value stored as local midnight (`…T21:00:00Z` in UTC+3) came back with its time
   * silently moved. A `datetime` editor keeps the ISO instant: its raw value is local time, which
   * `toISOString()` converts correctly.
   */
  emitDate(raw: string): void {
    if (raw === '') {
      this.valueChange.emit(null);
      return;
    }
    if (this.column.editor === 'date' && typeof this.value === 'string') {
      this.valueChange.emit(raw);
      return;
    }
    const date = new Date(raw);
    if (isNaN(date.getTime())) {
      this.valueChange.emit(null);
      return;
    }
    this.valueChange.emit(typeof this.value === 'string' ? date.toISOString() : date);
  }

  /** Called by the grid on the first editable cell so editing starts with the caret already placed */
  focus(): void {
    this.elementRef.nativeElement.querySelector<HTMLElement>('input, select')?.focus();
  }
}
