import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WeGridMacro, WeGridMacroError } from '../models/we-grid-macro.model';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { weGridParseMacro } from '../services/we-grid-macro.util';

/** The script language at a glance — syntax, so it is the same in every language */
const CHEAT_SHEET = [
  'SORT [Column] ASC | DESC · SORT [A] ASC THEN [B] DESC',
  'FILTER [Column] = "text" | > 10 | < 10 | CONTAINS "x" | BETWEEN 1 AND 9 | IN ("a", "b")',
  'CLEAR FILTERS · CLEAR SORT · CLEAR FORMATS',
  'GROUP BY [Column], [Column] · UNGROUP',
  'SHOW [Column] · HIDE [Column]',
  'HIGHLIGHT [Column] > 1000 GREEN BOLD ROW',
  'HIGHLIGHT [Column] TOP 10 | DUPLICATES | ABOVE AVERAGE',
  'HIGHLIGHT ROWS WHERE [Qty] > [Stock] RED',
  'DATABAR [Column] BLUE · COLORSCALE [Column] RED YELLOW GREEN',
  'ICONSET [Column] ARROWS | DOTS [REVERSE]',
  'SET [Column] = formula WHERE condition',
  'DENSITY COMPACT · ZEBRA ON',
  'VIEW "Name" · EXPORT XLSX | CSV | PDF',
  'RUN command · MESSAGE "Done"'
];

/** The macro editor — a name, the script with live checking, a cheat sheet and a test run */
@Component({
  selector: 'we-grid-macro-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './we-grid-macro-dialog.component.html',
  styleUrls: ['../we-grid-edit-form/we-grid-edit-form.component.scss', './we-grid-macro-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridMacroDialogComponent implements OnInit {
  /** The macro being edited, or null for a new one */
  @Input() macro: WeGridMacro | null = null;
  /** Initial script for a new macro — what the recorder captured */
  @Input() script = '';
  @Input() usedIds: string[] = [];
  @Input() run: (script: string) => Promise<WeGridMacroError[]> = async () => [];

  @Output() save = new EventEmitter<WeGridMacro>();
  @Output() cancel = new EventEmitter<void>();

  readonly cheatSheet = CHEAT_SHEET;
  name = '';
  text = '';
  pinned = false;
  runErrors: WeGridMacroError[] | null = null;

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.name = this.macro?.name ?? '';
    this.text = this.macro?.script ?? this.script;
    this.pinned = !!this.macro?.pinned;
  }

  get title(): string {
    return this.macro ? this.locale.macroDialogEdit : this.locale.macroDialogNew;
  }

  get errors(): WeGridMacroError[] {
    return weGridParseMacro(this.text).errors;
  }

  get canSave(): boolean {
    return this.text.trim() !== '' && this.errors.length === 0;
  }

  icon(key: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.icons[key] ?? '');
  }

  insert(line: string): void {
    const example = line.split(' · ')[0].split(' | ')[0];
    this.text = this.text.trim() ? `${this.text.replace(/\s+$/, '')}\n${example}` : example;
  }

  async tryRun(): Promise<void> {
    this.runErrors = await this.run(this.text);
    this.cdr.markForCheck();
  }

  submit(event: Event): void {
    event.preventDefault();
    if (!this.canSave) return;
    const macro: WeGridMacro = {
      id: this.macro?.id ?? this.nextId(),
      name: this.name.trim() || this.locale.macroDefaultName,
      script: this.text.trim()
    };
    if (this.pinned) macro.pinned = true;
    this.save.emit(macro);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancel.emit();
    }
  }

  private nextId(): string {
    const used = new Set(this.usedIds);
    let i = 1;
    while (used.has(`macro${i}`)) i++;
    return `macro${i}`;
  }
}
