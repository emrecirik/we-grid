import { Component, OnInit } from '@angular/core';
import { WeGridComponent, WeGridExportFormat, WeGridImportFormat, WeSheetComponent, WeSheetData } from 'we-grid-angular';
import { studioBudget, studioColumns, studioMacros, studioOrders, studioRules } from './studio-data';
import { STUDIO_TEXT, StudioLanguage, saveStudioLanguage, studioLanguage } from './studio-text';

type Tab = 'grid' | 'sheet' | 'start';
type Theme = 'light' | 'dark';

const THEME_KEY = 'we-grid-studio:theme';
const SHEET_KEY = 'studio-budget';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [WeGridComponent, WeSheetComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  readonly lang: StudioLanguage = studioLanguage();
  readonly text = STUDIO_TEXT[this.lang];
  readonly columns = studioColumns(this.lang);
  readonly orders = studioOrders(this.lang);
  readonly rules = studioRules(this.lang);
  readonly macros = studioMacros(this.lang);
  readonly exportFormats: WeGridExportFormat[] = ['xlsx', 'csv', 'pdf'];
  readonly importFormats: WeGridImportFormat[] = ['xlsx', 'csv'];
  readonly sheetKey = `${SHEET_KEY}-${this.lang}`;
  /** The example budget — only handed to the sheet while nothing is saved, so the user's edits survive a reload */
  sheetData: WeSheetData | null = null;
  tab: Tab = 'grid';
  theme: Theme = 'light';

  readonly installSnippet = 'npm install we-grid-angular @angular/cdk';
  readonly usageSnippet = `import { WeGridComponent, WeGridColumnDef } from 'we-grid-angular';

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: \`<we-grid gridKey="orders" [columns]="columns" [data]="orders"
                      [formatting]="true" [allowFormulaColumns]="true" />\`
})
export class OrdersComponent {
  columns: WeGridColumnDef<Order>[] = [
    { field: 'qty', header: 'Qty', type: 'integer' },
    { field: 'price', header: 'Price', type: 'currency' },
    { field: 'total', header: 'Total', type: 'currency', formula: '=[Qty] * [Price]' }
  ];
}`;
  readonly themeSnippet = `// styles.scss — the default theme, or the Apple-style one
@import 'we-grid-angular/styles/we-grid-theme-apple.scss';`;

  ngOnInit(): void {
    const hash = location.hash.replace('#', '');
    if (hash === 'sheet' || hash === 'start' || hash === 'grid') this.tab = hash;
    this.theme = this.read(THEME_KEY) === 'dark' ? 'dark' : this.read(THEME_KEY) === 'light' ? 'light' : matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    this.applyTheme();
    if (this.read(`we-sheet:${this.sheetKey}`) === null) this.sheetData = studioBudget(this.lang);
  }

  select(tab: Tab): void {
    this.tab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  setLanguage(lang: StudioLanguage): void {
    if (lang === this.lang) return;
    saveStudioLanguage(lang);
    location.reload();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.write(THEME_KEY, theme);
    this.applyTheme();
  }

  resetSheet(): void {
    try {
      localStorage.removeItem(`we-sheet:${this.sheetKey}`);
    } catch {
      // storage blocked — nothing was saved either
    }
    this.sheetData = studioBudget(this.lang);
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage blocked — the choice lasts for this visit
    }
  }
}
