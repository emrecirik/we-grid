import { Component, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WE_GRID_LOCALE, WeGridLocale, weGridLocaleEn, weGridLocaleTr } from '../models/we-grid-locale.model';
import { WeSheetComponent } from './we-sheet.component';

@Component({
  standalone: true,
  imports: [WeSheetComponent],
  template: `<we-sheet [rows]="4" [cols]="2" />`
})
class HostComponent {
  @ViewChild(WeSheetComponent) sheet!: WeSheetComponent;
}

describe('WeSheetComponent — typed dates follow the locale', () => {
  const typed = (locale: WeGridLocale, text: string) => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [{ provide: WE_GRID_LOCALE, useValue: locale }] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const sheet = fixture.componentInstance.sheet;
    sheet.setCell('A1', text);
    return sheet.getData().cells['A1'];
  };

  it('reads month first in en-US', () => {
    expect(typed(weGridLocaleEn, '1/15/2026')).toEqual({ v: 46037, f: 'date' });
  });

  it('reads day first in tr-TR', () => {
    expect(typed(weGridLocaleTr, '15.01.2026')).toEqual({ v: 46037, f: 'date' });
  });

  it('reads a year-first locale’s ISO dates', () => {
    expect(typed({ ...weGridLocaleEn, intlLocale: 'ja-JP' }, '2026-01-15')).toEqual({ v: 46037, f: 'date' });
  });
});
