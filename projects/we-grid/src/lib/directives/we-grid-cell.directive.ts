import { Directive, Input, TemplateRef } from '@angular/core';
import { WeGridCellContext } from '../models/we-grid-column.model';

/**
 * Column-level custom cell template — used on the consumer side as:
 * `<ng-template weGridCell="statusCode" let-row let-value="value">...</ng-template>`
 *
 * For the `let-row` variable to narrow to the actual row type instead of `unknown`, Angular's
 * generic type-inference mechanism (the same one NgFor relies on) needs a hint — bind the data
 * array you pass to the grid to the `weGridCellRowsOf` input (never read at runtime, purely for
 * type inference): `<ng-template weGridCell="statusCode" [weGridCellRowsOf]="items" let-row>`
 */
@Directive({
  selector: '[weGridCell]',
  standalone: true
})
export class WeGridCellDirective<T = unknown> {
  @Input('weGridCell') field = '';

  /** Only for TypeScript type inference — never used at runtime */
  @Input() weGridCellRowsOf?: T[];

  constructor(public templateRef: TemplateRef<WeGridCellContext<T>>) {}

  static ngTemplateContextGuard<T>(_dir: WeGridCellDirective<T>, ctx: unknown): ctx is WeGridCellContext<T> {
    return true;
  }
}
