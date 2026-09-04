import { Directive, Input, TemplateRef } from '@angular/core';
import { WeGridRowDetailContext } from '../models/we-grid-row-detail.model';

/**
 * Row expansion (master-detail) content — used on the consumer side as:
 * `<ng-template weGridRowDetail let-row let-i="rowIndex">...</ng-template>`
 *
 * For the same reason as the `weGridCellRowsOf` trick on the `weGridCell` directive (so Angular's
 * generic type-inference mechanism can narrow `let-row` to the actual row type), bind the data
 * array you pass to the grid to the `weGridRowDetailRowsOf` input (never read at runtime, purely
 * for type inference): `<ng-template weGridRowDetail [weGridRowDetailRowsOf]="items" let-row>`
 */
@Directive({
  selector: '[weGridRowDetail]',
  standalone: true
})
export class WeGridRowDetailDirective<T = unknown> {
  /** Only for TypeScript type inference — never used at runtime */
  @Input() weGridRowDetailRowsOf?: T[];

  constructor(public templateRef: TemplateRef<WeGridRowDetailContext<T>>) {}

  static ngTemplateContextGuard<T>(_dir: WeGridRowDetailDirective<T>, ctx: unknown): ctx is WeGridRowDetailContext<T> {
    return true;
  }
}
