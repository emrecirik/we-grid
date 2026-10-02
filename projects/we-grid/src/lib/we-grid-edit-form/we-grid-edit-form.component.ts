import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridInternalColumn, weGridDisplayHeader } from '../models/we-grid-internal.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { WeGridCellEditorComponent } from '../we-grid-cell-editor/we-grid-cell-editor.component';

/** One field change reported by the form — the grid writes it into its edit draft */
export interface WeGridEditFormChange {
  field: string;
  value: unknown;
}

/**
 * The modal record form used when the grid's `editMode` is `'form'`.
 *
 * It renders one labelled editor per editable column — hidden columns included, since a column the
 * user hid from the table is still part of the record — and reuses the inline cell editor, so a
 * column edits the same way in both modes. Like the cell editor it is fully controlled: the draft,
 * the validation errors and the saving state all belong to the grid.
 */
@Component({
  selector: 'we-grid-edit-form',
  standalone: true,
  imports: [CommonModule, A11yModule, WeGridCellEditorComponent],
  templateUrl: './we-grid-edit-form.component.html',
  styleUrls: ['./we-grid-edit-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridEditFormComponent {
  @Input({ required: true }) columns: WeGridInternalColumn<unknown>[] = [];
  @Input({ required: true }) draft: Record<string, unknown> = {};
  @Input() errors: Record<string, string> = {};
  @Input() saving = false;
  /** Message of the last failed commit */
  @Input() error: string | null = null;
  /** True for a new record — only changes the title */
  @Input() creating = false;
  /** Resolves a column's input scale (percent, minor units) — see WeGridCellEditorComponent.scale */
  @Input() scaleFor: (col: WeGridInternalColumn<unknown>) => number = () => 1;

  @Output() valueChange = new EventEmitter<WeGridEditFormChange>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  get title(): string {
    return this.creating ? this.locale.formCreateTitle : this.locale.formEditTitle;
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  label(col: WeGridInternalColumn<unknown>): string {
    return weGridDisplayHeader(col);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.saving) this.save.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.saving) {
      event.stopPropagation();
      this.cancel.emit();
    }
  }
}
