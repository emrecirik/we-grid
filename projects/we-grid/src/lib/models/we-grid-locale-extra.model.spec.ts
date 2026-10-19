import { WeGridLocale, weGridLocaleEn } from './we-grid-locale.model';
import { weGridLocaleDe, weGridLocaleEs, weGridLocaleFr } from './we-grid-locale-extra.model';

/** Every string leaf of a locale, with its path; functions are called with sample arguments. */
function leaves(locale: WeGridLocale): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(locale)) {
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => unknown;
      const en = (weGridLocaleEn as unknown as Record<string, (...args: unknown[]) => unknown>)[key];
      out.push([`${key}('x', 'y')`, fn(...['x', 'y'].slice(0, fn.length))]);
      // Numeric probes (plurals) only where English itself takes numbers; string-only keys would throw on them.
      for (const n of [0, 1, 3]) {
        const args = Array.from({ length: fn.length }, () => n);
        let numeric = true;
        try { en(...args); } catch { numeric = false; }
        if (numeric) out.push([`${key}(${n})`, fn(...args)]);
      }
    } else if (value && typeof value === 'object') {
      for (const [inner, text] of Object.entries(value)) out.push([`${key}.${inner}`, text]);
    } else {
      out.push([key, value]);
    }
  }
  return out;
}

describe('extra locales', () => {
  const locales: Record<string, WeGridLocale> = { de: weGridLocaleDe, fr: weGridLocaleFr, es: weGridLocaleEs };

  for (const [name, locale] of Object.entries(locales)) {
    describe(name, () => {
      it('has exactly the keys of weGridLocaleEn (plus the optional currency)', () => {
        const expected = [...Object.keys(weGridLocaleEn), 'intlCurrency'].sort();
        expect(Object.keys(locale).sort()).toEqual(expected);
        for (const [key, value] of Object.entries(weGridLocaleEn)) {
          if (value && typeof value === 'object') {
            expect(Object.keys((locale as unknown as Record<string, object>)[key]).sort()).withContext(key).toEqual(Object.keys(value).sort());
          }
        }
      });

      it('has no empty text and every function returns text', () => {
        for (const [path, text] of leaves(locale)) {
          expect(typeof text).withContext(path).toBe('string');
          expect((text as string).trim().length).withContext(path).toBeGreaterThan(0);
        }
      });

      it('takes the same arguments as English for every function key', () => {
        for (const [key, value] of Object.entries(weGridLocaleEn)) {
          if (typeof value === 'function') {
            expect(((locale as unknown as Record<string, unknown>)[key] as () => unknown).length).withContext(key).toBe(value.length);
          }
        }
      });
    });
  }

  it('inflects plurals and summary labels', () => {
    expect(weGridLocaleDe.importSucceeded(1)).toBe('1 Zeile gelesen');
    expect(weGridLocaleDe.importSucceeded(2)).toBe('2 Zeilen gelesen');
    expect(weGridLocaleDe.summaryPage(weGridLocaleDe.sum)).toBe('Seitensumme');
    expect(weGridLocaleDe.summaryGrand(weGridLocaleDe.average)).toBe('Gesamtdurchschnitt');
    expect(weGridLocaleFr.importSucceeded(0)).toBe('0 ligne lue');
    expect(weGridLocaleFr.importSucceeded(2)).toBe('2 lignes lues');
    expect(weGridLocaleFr.summaryGrand(weGridLocaleFr.count)).toBe('Nombre global');
    expect(weGridLocaleFr.summaryGrand(weGridLocaleFr.sum)).toBe('Somme globale');
    expect(weGridLocaleEs.macroRowsUpdated(1)).toBe('1 fila actualizada');
    expect(weGridLocaleEs.macroRowsUpdated(0)).toBe('0 filas actualizadas');
    expect(weGridLocaleEs.summaryPage(weGridLocaleEs.sum)).toBe('Suma de la página');
  });
});
