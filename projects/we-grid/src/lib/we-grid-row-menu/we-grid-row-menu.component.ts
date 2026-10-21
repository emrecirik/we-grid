import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  Output,
  QueryList,
  ViewChildren
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WE_GRID_ICONS, WeGridIcons } from '../models/we-grid-icons.model';
import { WE_GRID_LOCALE, WeGridLocale } from '../models/we-grid-locale.model';
import { WeGridMenuItem } from '../models/we-grid-row-menu.model';
import { weGridSafeIcon } from '../services/we-grid-icon.util';

/**
 * The row right-click menu built from `rowContextMenu`. Created imperatively by `WeGridComponent`
 * through the CDK Overlay; shares the column menu's look. Children open in place, as in the column menu.
 */
@Component({
  selector: 'we-grid-row-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './we-grid-row-menu.component.html',
  styleUrls: ['../we-grid-header-menu/we-grid-header-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeGridRowMenuComponent {
  @Input() items: WeGridMenuItem[] = [];

  /** A leaf item was chosen — the grid runs its action, emits `rowMenuItemClick` and closes the menu */
  @Output() itemClick = new EventEmitter<WeGridMenuItem>();

  @ViewChildren('menuItem') menuItems!: QueryList<ElementRef<HTMLElement>>;

  private readonly openIds = new Set<string>();

  constructor(
    @Inject(WE_GRID_LOCALE) readonly locale: WeGridLocale,
    @Inject(WE_GRID_ICONS) private readonly icons: WeGridIcons,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  icon(key: string): SafeHtml {
    return weGridSafeIcon(this.sanitizer, this.icons, key);
  }

  isOpen(item: WeGridMenuItem): boolean {
    return this.openIds.has(item.id);
  }

  onItemClick(item: WeGridMenuItem): void {
    if (item.disabled) return;
    if (item.children?.length) {
      if (this.openIds.has(item.id)) this.openIds.delete(item.id);
      else this.openIds.add(item.id);
      return;
    }
    this.itemClick.emit(item);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.menuItems?.toArray().map((el) => el.nativeElement).filter((el) => !el.hasAttribute('disabled')) ?? [];
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = items.findIndex((el) => el === active);
    const rtl = getComputedStyle(this.host.nativeElement).direction === 'rtl';
    const inward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const outward = rtl ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === inward && active?.getAttribute('aria-haspopup')) {
      event.preventDefault();
      const id = active.getAttribute('data-item-id')!;
      this.openIds.add(id);
      this.cdr.detectChanges();
      this.find(`[data-parent-id="${CSS.escape(id)}"]:not([disabled])`)?.focus();
    } else if (event.key === outward && active?.getAttribute('data-parent-id')) {
      event.preventDefault();
      const parentId = active.getAttribute('data-parent-id')!;
      const parent = this.find(`[data-item-id="${CSS.escape(parentId)}"]`);
      this.openIds.delete(parentId);
      this.cdr.detectChanges();
      parent?.focus();
    }
  }

  focusFirstItem(): void {
    queueMicrotask(() => this.menuItems?.toArray().find((el) => !el.nativeElement.hasAttribute('disabled'))?.nativeElement.focus());
  }

  private find(selector: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(selector);
  }
}
