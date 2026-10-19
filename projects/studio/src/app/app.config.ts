import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { WE_GRID_LOCALE, weGridLocaleEn, weGridLocaleTr } from 'we-grid-angular';
import { studioLanguage } from './studio-text';

// The grid reads its locale once, when it is created — the language switch saves the choice and reloads
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: WE_GRID_LOCALE, useFactory: () => (studioLanguage() === 'tr' ? { ...weGridLocaleTr, intlCurrency: 'TRY' } : weGridLocaleEn) }
  ]
};
