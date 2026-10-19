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
    'Press a macro button (Top sellers, By city) — or Macros → Record, use the grid, Stop, and save your own.',
    'Type in the search box to find text in every column; tick rows and press Ctrl+C to paste them into Excel.',
    'Export to Excel, CSV or PDF from the toolbar.'
  ],
  sheetTitle: 'Budget',
  sheetIntro: 'A spreadsheet with Excel formulas, copy and paste, undo and export — saved in this browser.',
  sheetTips: [
    'Click a cell and type: a number, text or a formula such as =SUM(B2:B8).',
    'Select a block with the mouse or Shift+arrows — the status bar adds it up.',
    'Copy a table from Excel or Google Sheets and paste it here.',
    'Ctrl+D fills a formula down, Ctrl+Z undoes, the toolbar styles and formats cells.',
    'Drag the small square at the corner of a selection to fill a series (1, 2 → 3, 4…); the Approval column is a dropdown list — right-click → Dropdown list… to make your own.',
    'Right-click for insert/delete rows and columns, Σ sums, Ctrl+F finds and replaces, the chart button charts a selection.'
  ],
  tabData: 'Your database',
  tabPivot: 'Pivot',
  pivotTitle: 'Sales by city and status',
  pivotIntro: 'A pivot table over the same 240 orders: add or remove fields in Rows, Columns and Values, change Sum to Count or Average — subtotals per city, totals per row and a grand total follow.',
  dataTitle: 'Connect your own database',
  dataIntro: 'Run one of the sample backends on your machine — .NET, Spring Boot, Node.js, Python, Go or PHP — and browse its tables here: paging, sorting and filtering happen in the database, and your grid layouts are saved on the backend.',
  dataUrl: 'Backend address',
  dataToken: 'Token (optional)',
  dataConnect: 'Connect',
  dataReconnect: 'Reconnect',
  dataFailed: 'Could not reach the backend.',
  dataHelp: 'Start a backend from the we-report repository and allow this page to call it:',
  dataNeedsGrid: 'This backend speaks protocol 1.0 — update it to 1.1 for paging and saved layouts.',
  dataLayoutsOnServer: 'Layouts saved on the backend',
  dataConnection: 'Connection',
  dataTable: 'Table',
  dataHowTitle: 'How it works',
  dataSteps: [
    'Clone github.com/emrecirik/we-report and open samples/backends — pick your language.',
    'Start it with this page allowed as a CORS origin (the command below is for Node.js; every README shows its own).',
    'Press Connect. Your browser may ask to let this page reach your local network — allow it.',
    'Pick a table. Filters, sorting and the checklist values come from the database itself.'
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
    'Bir makro butonuna basın (En çok satanlar, Şehre göre) — ya da Makrolar → Kaydet, tabloyu kullanın, Durdurun ve kendi makronuzu kaydedin.',
    'Arama kutusuna yazarak tüm kolonlarda arayın; satırları seçip Ctrl+C ile Excel’e yapıştırın.',
    'Araç çubuğundan Excel, CSV ya da PDF olarak dışa aktarın.'
  ],
  sheetTitle: 'Bütçe',
  sheetIntro: 'Excel formülleri, kopyala-yapıştır, geri al ve dışa aktarma ile bir hesap tablosu — bu tarayıcıda saklanır.',
  sheetTips: [
    'Bir hücreye tıklayıp yazın: sayı, metin ya da =TOPLA(B2:B8) gibi bir formül.',
    'Fareyle ya da Shift+ok tuşlarıyla bir alan seçin — durum çubuğu toplamı gösterir.',
    'Excel ya da Google E-Tablolar’dan bir tablo kopyalayıp buraya yapıştırın.',
    'Ctrl+D formülü aşağı doldurur, Ctrl+Z geri alır; araç çubuğu hücreleri biçimlendirir.',
    'Seçimin köşesindeki küçük kareyi sürükleyerek seri doldurun (1, 2 → 3, 4…); Onay kolonu bir açılır liste — kendi listeniz için sağ tık → Açılır liste…',
    'Sağ tıkla satır/kolon ekleyip silin, Σ toplasın, Ctrl+F bulup değiştirsin, grafik düğmesi seçimi grafiğe çevirsin.'
  ],
  tabData: 'Veritabanınız',
  tabPivot: 'Pivot',
  pivotTitle: 'Şehre ve duruma göre satışlar',
  pivotIntro: 'Aynı 240 sipariş üzerinde bir pivot tablo: Satırlar, Kolonlar ve Değerler alanlarına alan ekleyip çıkarın, Toplam’ı Sayım ya da Ortalama yapın — şehir ara toplamları, satır toplamları ve genel toplam kendiliğinden gelir.',
  dataTitle: 'Kendi veritabanınızı bağlayın',
  dataIntro: 'Örnek backendlerden birini bilgisayarınızda çalıştırın — .NET, Spring Boot, Node.js, Python, Go ya da PHP — ve tablolarına buradan göz atın: sayfalama, sıralama ve filtreleme veritabanında yapılır, tablo düzenleriniz backend’e kaydedilir.',
  dataUrl: 'Backend adresi',
  dataToken: 'Anahtar (isteğe bağlı)',
  dataConnect: 'Bağlan',
  dataReconnect: 'Yeniden bağlan',
  dataFailed: 'Backend’e ulaşılamadı.',
  dataHelp: 'we-report deposundan bir backend başlatın ve bu sayfanın ona erişmesine izin verin:',
  dataNeedsGrid: 'Bu backend protokol 1.0 konuşuyor — sayfalama ve kayıtlı düzenler için 1.1’e güncelleyin.',
  dataLayoutsOnServer: 'Düzenler backend’de saklanıyor',
  dataConnection: 'Bağlantı',
  dataTable: 'Tablo',
  dataHowTitle: 'Nasıl çalışır',
  dataSteps: [
    'github.com/emrecirik/we-report deposunu klonlayın ve samples/backends altından dilinizi seçin.',
    'Bu sayfayı CORS kaynağı olarak izin vererek başlatın (aşağıdaki komut Node.js için; her README kendi komutunu gösterir).',
    'Bağlan’a basın. Tarayıcınız bu sayfanın yerel ağınıza erişmesi için izin isteyebilir — izin verin.',
    'Bir tablo seçin. Filtreler, sıralama ve liste değerleri doğrudan veritabanından gelir.'
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
