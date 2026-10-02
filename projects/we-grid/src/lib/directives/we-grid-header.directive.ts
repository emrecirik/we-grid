import { Directive, Input, TemplateRef } from '@angular/core';
import { WeGridHeaderContext } from '../models/we-grid-column.model';

/**
 * Column-level custom header content — `<ng-template weGridHeader="price" let-title="title">`.
 * Replaces the header text only: the sort arrow, the filter funnel, the menu button and the
 * `headerHint` icon are still drawn by the grid around it. Same as `WeGridColumnDef.headerTemplate`.
 */
@Directive({
  selector: '[weGridHeader]',
  standalone: true
})
export class WeGridHeaderDirective {
  @Input('weGridHeader') field = '';

  constructor(public templateRef: TemplateRef<WeGridHeaderContext<unknown>>) {}
}
