import { Directive, TemplateRef } from '@angular/core';
import { WeGridEmptyContext } from '../models/we-grid-empty.model';

/**
 * Replaces the content of the empty-state cell — used on the consumer side as:
 * `<ng-template weGridEmpty let-ctx>...</ng-template>`
 *
 * Drawn only when there are no rows and the grid isn't loading; left out, the grid draws its own
 * icon, message and "Clear filters" button.
 */
@Directive({
  selector: '[weGridEmpty]',
  standalone: true
})
export class WeGridEmptyDirective {
  constructor(public templateRef: TemplateRef<WeGridEmptyContext>) {}

  static ngTemplateContextGuard(_dir: WeGridEmptyDirective, ctx: unknown): ctx is WeGridEmptyContext {
    return true;
  }
}
