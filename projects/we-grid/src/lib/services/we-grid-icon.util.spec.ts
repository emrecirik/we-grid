import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { WeGridIcons } from '../models/we-grid-icons.model';
import { weGridSafeIcon } from './we-grid-icon.util';

describe('weGridSafeIcon', () => {
  it('returns the same SafeHtml for an icon every time, per icon set', () => {
    const sanitizer = TestBed.inject(DomSanitizer);
    const icons = { plus: '<svg></svg>' } as unknown as WeGridIcons;
    const other = { plus: '<svg><path/></svg>' } as unknown as WeGridIcons;
    expect(weGridSafeIcon(sanitizer, icons, 'plus')).toBe(weGridSafeIcon(sanitizer, icons, 'plus'));
    expect(weGridSafeIcon(sanitizer, other, 'plus')).not.toBe(weGridSafeIcon(sanitizer, icons, 'plus'));
    expect(weGridSafeIcon(sanitizer, icons, 'missing')).toBe(weGridSafeIcon(sanitizer, icons, 'missing'));
  });
});
