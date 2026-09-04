import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { WE_GRID_LAYOUT_STORE } from '@we-grid/angular';

import { UserLayoutStore } from './services/user-layout-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    // Every <we-grid> in this app persists its layout through our own store instead of the default one
    { provide: WE_GRID_LAYOUT_STORE, useExisting: UserLayoutStore }
  ]
};
