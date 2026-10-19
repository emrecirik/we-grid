export type StudioLanguage = 'en' | 'tr';

const LANGUAGE_KEY = 'we-grid-studio:lang';

/** The saved language, else the browser's */
export function studioLanguage(): StudioLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    // storage blocked — fall through to the browser language
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function saveStudioLanguage(lang: StudioLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // storage blocked — the choice lasts until the reload only
  }
}

const en = {
  tagline: 'A themeable Angular data grid and spreadsheet — free, MIT, no CSS framework.',
  tabGrid: 'Data grid',
  tabSheet: 'Spreadsheet',
  tabStart: 'Get started',
  gridTitle: 'Sales orders',
  gridIntro: 'Everything below runs in your browser. Your layout, formatting, formula columns and views are kept in this browser only.',
  tryTitle: 'Things to try',
  gridTips: [
    'Open a column menu (⚙) → Format… to add highlight rules, colour scales and data bars.',
    'Column menu → Add formula column… and write =[Total] * 0.2 or =IF([Qty] > 10, "Bulk", "")',
    'Tick values in a header filter, group by City from its menu, then save the result as a View.',
    'Double-click a row to edit it; paste rows straight from Excel with Ctrl+V.',
    'Export to Excel, CSV or PDF from the toolbar.'
  ],
  sheetTitle: 'Budget',
  sheetIntro: 'A spreadsheet with Excel formulas, copy and paste, undo and export — saved in this browser.',
  sheetTips: [
    'Click a cell and type: a number, text or a formula such as =SUM(B2:B8).',
    'Select a block with the mouse or Shift+arrows — the status bar adds it up.',
    'Copy a table from Excel or Google Sheets and paste it here.',
    'Ctrl+D fills a formula down, Ctrl+Z undoes, the toolbar styles and formats cells.'
  ],
  resetExample: 'Reset the example',
  startTitle: 'Use it in your app',
  install: 'Install',
  themeLabel: 'Theme',
  light: 'Light',
  dark: 'Dark',
  language: 'Language',
  docs: 'Documentation',
  sisterProject: 'Need printable reports? See we-report, the report designer from the same family.'
};

const tr: typeof en = {
  tagline: 'Temalandırılabilir Angular veri tablosu ve hesap tablosu — ücretsiz, MIT, CSS framework yok.',
  tabGrid: 'Veri tablosu',
  tabSheet: 'Hesap tablosu',
  tabStart: 'Başlarken',
  gridTitle: 'Satış siparişleri',
  gridIntro: 'Aşağıdaki her şey tarayıcınızda çalışır. Düzeniniz, biçimlendirmeniz, formül kolonlarınız ve görünümleriniz yalnızca bu tarayıcıda saklanır.',
  tryTitle: 'Deneyebilecekleriniz',
  gridTips: [
    'Bir kolon menüsünü açın (⚙) → Biçimlendir… ile vurgulama kuralları, renk skalaları ve veri çubukları ekleyin.',
    'Kolon menüsü → Formül Kolonu Ekle… ve =[Toplam] * 0.2 ya da =EĞER([Adet] > 10; "Toptan"; "") yazın.',
    'Başlık filtresinde değer seçin, menüden Şehir’e göre gruplayın ve sonucu Görünüm olarak kaydedin.',
    'Bir satırı düzenlemek için çift tıklayın; Excel’den satırları Ctrl+V ile doğrudan yapıştırın.',
    'Araç çubuğundan Excel, CSV ya da PDF olarak dışa aktarın.'
  ],
  sheetTitle: 'Bütçe',
  sheetIntro: 'Excel formülleri, kopyala-yapıştır, geri al ve dışa aktarma ile bir hesap tablosu — bu tarayıcıda saklanır.',
  sheetTips: [
    'Bir hücreye tıklayıp yazın: sayı, metin ya da =TOPLA(B2:B8) gibi bir formül.',
    'Fareyle ya da Shift+ok tuşlarıyla bir alan seçin — durum çubuğu toplamı gösterir.',
    'Excel ya da Google E-Tablolar’dan bir tablo kopyalayıp buraya yapıştırın.',
    'Ctrl+D formülü aşağı doldurur, Ctrl+Z geri alır; araç çubuğu hücreleri biçimlendirir.'
  ],
  resetExample: 'Örneği sıfırla',
  startTitle: 'Uygulamanızda kullanın',
  install: 'Kurulum',
  themeLabel: 'Tema',
  light: 'Açık',
  dark: 'Koyu',
  language: 'Dil',
  docs: 'Dokümantasyon',
  sisterProject: 'Yazdırılabilir raporlar mı lazım? Aynı ailenin rapor tasarımcısı we-report’a göz atın.'
};

export type StudioText = typeof en;

export const STUDIO_TEXT: Record<StudioLanguage, StudioText> = { en, tr };
