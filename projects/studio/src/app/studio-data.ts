import { WeGridColumnDef, WeGridFormatRule, WeGridMacro, WeSheetData, WeWorkbookData } from 'we-grid-angular';
import { StudioLanguage } from './studio-text';

/** A fictional sales order — every value comes from a seeded generator */
export interface StudioOrder {
  id: number;
  orderNo: string;
  date: string;
  customer: string;
  city: string;
  category: string;
  product: string;
  qty: number;
  unitPrice: number;
  discount: number;
  status: string;
}

/** Small deterministic PRNG (mulberry32), so every visitor sees the same rows */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = ['Northwind Labs', 'Blue Harbor', 'Cedar & Co', 'Atlas Works', 'Lumen Studio', 'Orchard Foods', 'Pine Logistics', 'Vega Retail'];
const CITIES = ['Istanbul', 'Ankara', 'Izmir', 'Berlin', 'Amsterdam', 'London'];
const CATALOG: [string, string, number][] = [
  ['Laptops', 'Ultrabook 14', 1249],
  ['Laptops', 'Workstation 16', 2190],
  ['Monitors', '27" 4K Display', 429],
  ['Monitors', '34" Ultrawide', 689],
  ['Accessories', 'Wireless Mouse', 39],
  ['Accessories', 'Mechanical Keyboard', 119],
  ['Accessories', 'USB-C Dock', 189],
  ['Audio', 'Noise-Cancelling Headset', 249],
  ['Audio', 'Conference Speaker', 159]
];

export function studioOrders(lang: StudioLanguage, count = 240): StudioOrder[] {
  const rnd = prng(20261019);
  const statuses = lang === 'tr' ? ['Hazırlanıyor', 'Kargoda', 'Teslim edildi', 'İade'] : ['Processing', 'Shipped', 'Delivered', 'Returned'];
  return Array.from({ length: count }, (_, i) => {
    const [category, product, price] = CATALOG[Math.floor(rnd() * CATALOG.length)];
    const day = new Date(Date.UTC(2026, 0, 1) + Math.floor(rnd() * 290) * 86400000);
    const statusRoll = rnd();
    return {
      id: i + 1,
      orderNo: `SO-${(10400 + i).toString()}`,
      date: day.toISOString().slice(0, 10),
      customer: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)],
      city: CITIES[Math.floor(rnd() * CITIES.length)],
      category,
      product,
      qty: 1 + Math.floor(rnd() * (price > 500 ? 6 : 25)),
      unitPrice: price,
      discount: [0, 0, 0, 0.05, 0.1, 0.15][Math.floor(rnd() * 6)],
      status: statuses[statusRoll < 0.2 ? 0 : statusRoll < 0.45 ? 1 : statusRoll < 0.93 ? 2 : 3]
    };
  });
}

export function studioColumns(lang: StudioLanguage): WeGridColumnDef<StudioOrder>[] {
  const tr = lang === 'tr';
  return [
    { field: 'orderNo', header: tr ? 'Sipariş' : 'Order', width: 130, pinned: 'left' },
    { field: 'date', header: tr ? 'Tarih' : 'Date', type: 'date', width: 130 },
    { field: 'customer', header: tr ? 'Müşteri' : 'Customer', width: 160 },
    { field: 'city', header: tr ? 'Şehir' : 'City', width: 120 },
    { field: 'category', header: tr ? 'Kategori' : 'Category', width: 130 },
    { field: 'product', header: tr ? 'Ürün' : 'Product', width: 190 },
    { field: 'qty', header: tr ? 'Adet' : 'Qty', type: 'integer', width: 100, summary: 'sum' },
    { field: 'unitPrice', header: tr ? 'Birim fiyat' : 'Unit price', type: 'currency', width: 150 },
    { field: 'discount', header: tr ? 'İndirim' : 'Discount', type: 'percent', width: 120 },
    {
      field: 'total',
      header: tr ? 'Toplam' : 'Total',
      type: 'currency',
      width: 140,
      summary: 'sum',
      formula: tr ? '=[Adet] * [Birim fiyat] * (1 - [İndirim])' : '=[Qty] * [Unit price] * (1 - [Discount])'
    },
    { field: 'status', header: tr ? 'Durum' : 'Status', width: 130 }
  ];
}

export function studioRules(lang: StudioLanguage): WeGridFormatRule[] {
  return [
    { id: 'bar', field: 'total', type: 'dataBar', color: 'blue' },
    { id: 'disc', field: 'discount', type: 'condition', operator: 'gte', value: 0.1, style: { fill: 'green', color: 'green' } },
    { id: 'ret', field: 'status', type: 'condition', operator: 'eq', value: lang === 'tr' ? 'İade' : 'Returned', style: { fill: 'red', color: 'red' } },
    { id: 'bulk', field: 'qty', type: 'condition', operator: 'top', value: 10, style: { bold: true, color: 'purple' } }
  ];
}

export function studioBudget(lang: StudioLanguage): WeSheetData {
  const tr = lang === 'tr';
  const rows: [string, number, number][] = tr
    ? [
        ['Kira', 18000, 18000],
        ['Maaşlar', 142000, 151500],
        ['Yazılım abonelikleri', 6400, 7100],
        ['Pazarlama', 22000, 19800],
        ['Seyahat', 9500, 12250],
        ['Ofis giderleri', 4200, 3900],
        ['Eğitim', 7000, 5600]
      ]
    : [
        ['Rent', 4500, 4500],
        ['Salaries', 36000, 37800],
        ['Software subscriptions', 1600, 1780],
        ['Marketing', 5500, 4950],
        ['Travel', 2400, 3060],
        ['Office supplies', 1050, 980],
        ['Training', 1750, 1400]
      ];
  const cells: WeSheetData['cells'] = {
    A1: { v: tr ? 'Kalem' : 'Item' },
    B1: { v: tr ? 'Bütçe' : 'Budget' },
    C1: { v: tr ? 'Gerçekleşen' : 'Actual' },
    D1: { v: tr ? 'Fark' : 'Variance' },
    E1: { v: tr ? 'Fark %' : 'Variance %' },
    F1: { v: tr ? 'Not' : 'Note' }
  };
  rows.forEach(([item, budget, actual], i) => {
    const r = i + 2;
    cells[`A${r}`] = { v: item };
    cells[`B${r}`] = { v: budget, f: 'currency' };
    cells[`C${r}`] = { v: actual, f: 'currency' };
    cells[`D${r}`] = { v: `=C${r}-B${r}`, f: 'currency' };
    cells[`E${r}`] = { v: `=IFERROR(D${r}/B${r}, 0)`, f: 'percent' };
    cells[`F${r}`] = { v: tr ? `=IF(D${r}>0, "Aşım", "")` : `=IF(D${r}>0, "Over", "")`, s: { color: 'red' } };
  });
  const total = rows.length + 3;
  cells[`A${total}`] = { v: tr ? 'Toplam' : 'Total', s: { bold: true } };
  for (const col of ['B', 'C', 'D']) {
    cells[`${col}${total}`] = { v: `=SUM(${col}2:${col}${rows.length + 1})`, f: 'currency', s: { bold: true } };
  }
  cells[`E${total}`] = { v: `=D${total}/B${total}`, f: 'percent', s: { bold: true, fill: 'yellow', color: 'yellow' } };
  return { version: 1, rows: 40, cols: 10, headerRow: true, striped: true, widths: { A: 190, F: 90 }, cells, chart: { range: `A1:C${rows.length + 1}`, type: 'column' } };
}

export function studioMacros(lang: StudioLanguage): WeGridMacro[] {
  if (lang === 'tr') {
    return [
      { id: 'top', name: 'En çok satanlar', pinned: true, script: 'CLEAR FILTERS\nUNGROUP\nFILTER [Durum] = "Teslim edildi"\nSORT [Toplam] DESC\nHIGHLIGHT [Toplam] TOP 10 GREEN BOLD' },
      { id: 'city', name: 'Şehre göre', pinned: true, script: 'CLEAR FILTERS\nGROUP BY [Şehir], [Kategori]\nSORT [Toplam] DESC' },
      { id: 'reset', name: 'Sıfırla', script: 'CLEAR FILTERS\nUNGROUP\nCLEAR SORT\nMESSAGE "Tablo sıfırlandı"' }
    ];
  }
  return [
    { id: 'top', name: 'Top sellers', pinned: true, script: 'CLEAR FILTERS\nUNGROUP\nFILTER [Status] = "Delivered"\nSORT [Total] DESC\nHIGHLIGHT [Total] TOP 10 GREEN BOLD' },
    { id: 'city', name: 'By city', pinned: true, script: 'CLEAR FILTERS\nGROUP BY [City], [Category]\nSORT [Total] DESC' },
    { id: 'reset', name: 'Reset', script: 'CLEAR FILTERS\nUNGROUP\nCLEAR SORT\nMESSAGE "The grid is back to normal"' }
  ];
}

/** A second sheet: monthly sales with a line chart */
function studioMonthly(lang: StudioLanguage): WeSheetData {
  const tr = lang === 'tr';
  const months = tr ? ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const online = [42, 48, 51, 63, 71, 78];
  const stores = [55, 52, 58, 57, 61, 66];
  const cells: WeSheetData['cells'] = {
    A1: { v: tr ? 'Ay' : 'Month' },
    B1: { v: tr ? 'Online' : 'Online' },
    C1: { v: tr ? 'Mağaza' : 'Stores' },
    D1: { v: tr ? 'Toplam' : 'Total' }
  };
  months.forEach((m, i) => {
    const r = i + 2;
    cells[`A${r}`] = { v: m };
    cells[`B${r}`] = { v: online[i] * 1000, f: 'currency', d: 0 };
    cells[`C${r}`] = { v: stores[i] * 1000, f: 'currency', d: 0 };
    cells[`D${r}`] = { v: `=B${r}+C${r}`, f: 'currency', d: 0, s: { bold: true } };
  });
  return { version: 1, rows: 30, cols: 8, headerRow: true, striped: true, cells, chart: { range: 'A1:C7', type: 'line' } };
}

export function studioWorkbook(lang: StudioLanguage): WeWorkbookData {
  const tr = lang === 'tr';
  return {
    version: 1,
    sheets: [
      { name: tr ? 'Bütçe' : 'Budget', data: studioBudget(lang) },
      { name: tr ? 'Satışlar' : 'Sales', data: studioMonthly(lang) }
    ],
    active: 0
  };
}
