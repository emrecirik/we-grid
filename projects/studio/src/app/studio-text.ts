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
    'Export to Excel, CSV or PDF from the toolbar — cell styles, colour scales and data bars come along.'
  ],
  sheetTitle: 'Budget',
  sheetIntro: 'A spreadsheet with Excel formulas, copy and paste, undo and export — saved in this browser.',
  sheetTips: [
    'Click a cell and type: a number, text or a formula such as =SUM(B2:B8).',
    'Select a block with the mouse or Shift+arrows — the status bar adds it up.',
    'Copy a table from Excel or Google Sheets and paste it here.',
    'Ctrl+D fills a formula down, Ctrl+Z undoes, the toolbar styles and formats cells.',
    'Drag the small square at the corner of a selection to fill a series (1, 2 → 3, 4…); the Approval column is a dropdown list — right-click → Dropdown list… to make your own.',
    'Right-click for insert/delete rows and columns, notes, conditional formatting and dropdown lists; Σ sums, Ctrl+F finds and replaces, the chart button charts a selection.',
    'The filter buttons in the header row hide rows like Excel’s AutoFilter; Excel (.xlsx) saves every sheet with its formulas, and opening an .xlsx brings them back.',
    'The toolbar merges and centres a selection, draws borders and wraps text; Table options → Freeze panes keeps the rows above and the columns before the active cell in view; PDF prints the sheet.',
    'Right-click → Hide rows or Hide columns tucks them away; select around them and Unhide brings them back. Notes and hidden rows travel with the Excel file.'
  ],
  tabData: 'Your database',
  tabPerf: 'Performance',
  perfTitle: 'Measure it in your browser',
  perfIntro: 'Generate up to fifty million rows on this device and time how long the grid takes to show, sort, filter, search and scroll them. Only the rows in view are ever in the page.',
  perfMode: 'Mode',
  perfModeEngine: 'Column engine',
  perfModeRows: 'Row objects',
  perfEngineNote: 'Column engine: [dataSource]="store" with WeGridColumnStore. Each column sits in the smallest typed array its values allow; filters, search and sorting run on those codes, and only the rows in view become objects. With Web Worker on (WeGridWorkerStore) all of it runs off the page’s thread — compare the longest freeze.',
  perfRowsNote: 'Row objects: [data]="rows" — every row a JavaScript object, as most grids hold them. Memory runs out after a few million.',
  perfBusy: 'Working…',
  perfAgNote: 'AG Grid Community 36.3 (MIT) with the same rows, columns and formats, its own defaults otherwise: client-side row model, text filter, quick filter. Loaded only when you pick this mode; we-grid itself doesn’t depend on it.',
  perfFilter: 'Filter City = Ankara',
  perfSearch: 'Search "selin izmir"',
  perfData: 'Data in memory',
  perfFilterMs: 'Filter',
  perfSearchMs: 'Search',
  perfGroup: 'Group by City',
  perfGroupMs: 'Group',
  perfPivot: 'Pivot City × Category',
  perfPivotMs: 'Pivot',
  perfAgNoPivot: 'Pivoting is part of AG Grid Enterprise, not Community',
  perfAgNoGroup: 'Row grouping is part of AG Grid Enterprise, not Community',
  perfAgNoGroupShort: 'Enterprise only',
  perfRows: 'Rows',
  perfRun: 'Generate and render',
  perfSort: 'Sort by Total',
  perfScroll: 'Scroll test (2 s)',
  perfPlainCap: 'Without virtualScroll every row goes into the page — that is capped at 10,000 here, because more freezes the tab. Turn virtualScroll on for larger sets.',
  perfGenerate: 'Generate',
  perfRender: 'First render',
  perfDomRows: 'Rows in DOM',
  perfHeap: 'JS heap',
  perfSortMs: 'Sort',
  perfFps: 'Scroll FPS',
  perfTimingNote: 'Each step shows two times: how long until the result was on screen · the longest the page went without drawing a frame meanwhile. A short second number means scrolling and typing kept working.',
  perfNote: 'Numbers come from your device and browser; the heap size is shown in Chromium-based browsers only. Data is fictional and generated from a fixed seed, so runs are comparable.',
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
  dataMode: 'How to browse',
  dataScroll: 'Scroll the whole table',
  dataPaged: 'Page by page',
  dataScrollFull: 'Search and grouping run in the database',
  dataScrollBasic: 'Protocol 1.1 backend: search and grouping need 1.2',
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
    'Araç çubuğundan Excel, CSV ya da PDF olarak dışa aktarın — hücre stilleri, renk skalaları ve veri çubukları da gider.'
  ],
  sheetTitle: 'Bütçe',
  sheetIntro: 'Excel formülleri, kopyala-yapıştır, geri al ve dışa aktarma ile bir hesap tablosu — bu tarayıcıda saklanır.',
  sheetTips: [
    'Bir hücreye tıklayıp yazın: sayı, metin ya da =TOPLA(B2:B8) gibi bir formül.',
    'Fareyle ya da Shift+ok tuşlarıyla bir alan seçin — durum çubuğu toplamı gösterir.',
    'Excel ya da Google E-Tablolar’dan bir tablo kopyalayıp buraya yapıştırın.',
    'Ctrl+D formülü aşağı doldurur, Ctrl+Z geri alır; araç çubuğu hücreleri biçimlendirir.',
    'Seçimin köşesindeki küçük kareyi sürükleyerek seri doldurun (1, 2 → 3, 4…); Onay kolonu bir açılır liste — kendi listeniz için sağ tık → Açılır liste…',
    'Sağ tıkla satır/kolon ekleyip silin, not, koşullu biçimlendirme ve açılır liste ekleyin; Σ toplasın, Ctrl+F bulup değiştirsin, grafik düğmesi seçimi grafiğe çevirsin.',
    'Başlık satırındaki filtre düğmeleri Excel’in Otomatik Filtresi gibi satır gizler; Excel (.xlsx) her sayfayı formülleriyle kaydeder, bir .xlsx açınca hepsi geri gelir.',
    'Araç çubuğu seçimi birleştirip ortalar, kenarlık çizer, metni kaydırır; Tablo seçenekleri → Bölmeleri dondur etkin hücrenin üstündeki satırları ve solundaki kolonları sabitler; PDF sayfayı yazdırır.',
    'Sağ tık → Satırları gizle ya da Kolonları gizle ile saklayın; çevresini seçip Göster ile geri getirin. Notlar ve gizli satırlar Excel dosyasında da korunur.'
  ],
  tabData: 'Veritabanınız',
  tabPerf: 'Performans',
  perfTitle: 'Kendi tarayıcınızda ölçün',
  perfIntro: 'Bu cihazda elli milyona kadar satır üretin; tablonun bunları ne kadar sürede gösterdiğini, sıraladığını, filtrelediğini, aradığını ve kaydırdığını ölçün. Sayfada her zaman yalnızca görünen satırlar bulunur.',
  perfMode: 'Mod',
  perfModeEngine: 'Sütun motoru',
  perfModeRows: 'Satır nesneleri',
  perfEngineNote: 'Sütun motoru: WeGridColumnStore ile [dataSource]="store". Her sütun, değerlerinin izin verdiği en küçük tipli dizide durur; filtre, arama ve sıralama bu kodlar üzerinde çalışır, yalnızca görünen satırlar nesneye dönüşür. Web Worker açıkken (WeGridWorkerStore) bunların hepsi sayfanın iş parçacığı dışında çalışır — en uzun donmayı karşılaştırın.',
  perfRowsNote: 'Satır nesneleri: [data]="rows" — çoğu tablonun yaptığı gibi her satır bir JavaScript nesnesi. Bellek birkaç milyondan sonra yetmez.',
  perfBusy: 'Çalışıyor…',
  perfAgNote: 'AG Grid Community 36.3 (MIT) — aynı satırlar, kolonlar ve biçimlerle, gerisi kendi varsayılanlarıyla: istemci satır modeli, metin filtresi, hızlı filtre. Yalnızca bu mod seçilince yüklenir; we-grid ona bağımlı değildir.',
  perfFilter: 'Şehir = Ankara filtresi',
  perfSearch: '"selin izmir" ara',
  perfData: 'Bellekteki veri',
  perfFilterMs: 'Filtre',
  perfSearchMs: 'Arama',
  perfGroup: 'Şehre göre grupla',
  perfGroupMs: 'Gruplama',
  perfPivot: 'Pivot Şehir × Kategori',
  perfPivotMs: 'Pivot',
  perfAgNoPivot: 'Pivot AG Grid Community’de yok, Enterprise sürümünde',
  perfAgNoGroup: 'Satır gruplama AG Grid Community’de yok, Enterprise sürümünde',
  perfAgNoGroupShort: 'Yalnız Enterprise',
  perfRows: 'Satır',
  perfRun: 'Üret ve göster',
  perfSort: 'Tutara göre sırala',
  perfScroll: 'Kaydırma testi (2 sn)',
  perfPlainCap: "virtualScroll kapalıyken her satır sayfaya eklenir — sekme donduğu için burada 10.000 ile sınırlı. Büyük veri için virtualScroll'u açın.",
  perfGenerate: 'Üretme',
  perfRender: 'İlk gösterim',
  perfDomRows: "DOM'daki satır",
  perfHeap: 'JS bellek',
  perfSortMs: 'Sıralama',
  perfFps: 'Kaydırma FPS',
  perfTimingNote: 'Her adımda iki süre var: sonucun ekrana gelmesi · bu arada sayfanın kare çizemediği en uzun süre. İkinci sayı kısaysa kaydırma ve yazma çalışmaya devam etmiştir.',
  perfNote: 'Sonuçlar sizin cihazınız ve tarayıcınızdan gelir; bellek yalnızca Chromium tabanlı tarayıcılarda gösterilir. Veriler hayalidir ve sabit bir tohumla üretilir, böylece ölçümler karşılaştırılabilir.',
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
  dataMode: 'Gezinme',
  dataScroll: 'Tüm tabloyu kaydır',
  dataPaged: 'Sayfa sayfa',
  dataScrollFull: 'Arama ve gruplama veritabanında çalışır',
  dataScrollBasic: 'Protokol 1.1 backend: arama ve gruplama için 1.2 gerekir',
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
