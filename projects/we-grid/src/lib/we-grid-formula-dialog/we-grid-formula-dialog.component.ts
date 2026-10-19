import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Inject, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridFormulaColumn } from '../models/we-grid-layout.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridTryCompileFormula } from '../services/we-grid-formula.util';

type FormulaType = NonNullable<WeGridFormulaColumn['type']>;

/** The functions offered as one-click inserts — the full list is in docs/formulas.md */
const QUICK_FUNCTIONS = ['IF', 'ROUND', 'IFERROR', 'AND', 'OR', 'ABS', 'CONCAT', 'LEFT', 'UPPER', 'TODAY', 'YEAR', 'DATE'];

/**
 * The dialog behind "Add formula column…" — a name, an Excel formula with one-click column and
 * function inserts, the result type and a live preview on the first row.
 */
@Component({
  selector: 'we-grid-formula-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './we-grid-formula-dialog.component.html',
  styleUrls: ['../we-grid-edit-form/we-grid-edit-form.component.scss', './we-grid-formula-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridFormulaDialogComponent implements OnInit {
  /** The column being edited, or null for a new one */
  @Input() column: WeGridFormulaColumn | null = null;
  /** Headers a formula can refer to */
  @Input() fieldNames: string[] = [];
  /** Fields already in use — a new column's field is picked around them */
  @Input() usedFields: string[] = [];
  @Input() preview: (formula: string, type: FormulaType) => string = () => '';

  @Output() save = new EventEmitter<WeGridFormulaColumn>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('formulaInput', { static: true }) formulaInput!: ElementRef<HTMLTextAreaElement>;

  readonly functions = QUICK_FUNCTIONS;
  readonly types: FormulaType[] = ['number', 'currency', 'percent', 'integer', 'text', 'date', 'boolean'];

  name = '';
  formula = '=';
  type: FormulaType = 'number';

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    if (this.column) {
      this.name = this.column.header;
      this.formula = this.column.formula;
      this.type = this.column.type ?? 'number';
    }
  }

  get title(): string {
    return this.column ? this.locale.formulaDialogEdit : this.locale.formulaDialogNew;
  }

  /** The syntax error message, or null when the formula reads */
  get error(): string | null {
    const text = this.formula.trim();
    if (text === '' || text === '=') return null;
    const result = weGridTryCompileFormula(text);
    return 'error' in result ? this.locale.formulaSyntaxError(result.error.position + 1) : null;
  }

  get canSave(): boolean {
    return this.formula.trim().length > 1 && !this.error;
  }

  get previewText(): string {
    return this.canSave ? this.preview(this.formula.trim(), this.type) : '';
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  insertColumn(name: string): void {
    this.insert(`[${name}]`);
  }

  insertFunction(name: string): void {
    this.insert(`${name}(`);
  }

  submit(event: Event): void {
    event.preventDefault();
    if (!this.canSave) return;
    const text = this.formula.trim();
    this.save.emit({
      field: this.column?.field ?? this.nextField(),
      header: this.name.trim() || this.locale.formulaDefaultName,
      formula: text.startsWith('=') ? text : `=${text}`,
      type: this.type
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancel.emit();
    }
  }

  /** Inserts at the caret and puts the caret after the inserted text */
  private insert(text: string): void {
    const el = this.formulaInput.nativeElement;
    const start = el.selectionStart ?? this.formula.length;
    const end = el.selectionEnd ?? this.formula.length;
    this.formula = this.formula.slice(0, start) + text + this.formula.slice(end);
    el.value = this.formula;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  }

  private nextField(): string {
    const used = new Set(this.usedFields);
    let i = 1;
    while (used.has(`fx:${i}`)) i++;
    return `fx:${i}`;
  }
}
