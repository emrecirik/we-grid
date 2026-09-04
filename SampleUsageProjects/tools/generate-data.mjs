/*
 * Generates the dummy datasets used by the three sample applications.
 *
 * Everything here is FICTIONAL: invented person names, invented company names and deliberately
 * fake account numbers (TR00 0000 ...). No real customer, bank or company data is used.
 *
 * Run from the workspace root:
 *   node SampleUsageProjects/tools/generate-data.mjs
 *
 * The output is committed to the repo so `ng serve` works without a build step.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Deterministic PRNG (mulberry32) so regenerating produces the same files ─────────────── */
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = createRandom(20260904);

const pick = (list) => list[Math.floor(rnd() * list.length)];
const intBetween = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const moneyBetween = (min, max) => Math.round((min + rnd() * (max - min)) * 100) / 100;
const round2 = (value) => Math.round(value * 100) / 100;

function isoDate(year, month, day) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function isoDateTime(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
}

function addDays(isoDay, days) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* ── Fictional name pools ────────────────────────────────────────────────────────────────── */
const FIRST_NAMES = [
  'Alina', 'Boran', 'Cerys', 'Dilan', 'Emrys', 'Fenna', 'Goran', 'Hedda', 'Ilan', 'Jorun',
  'Kaela', 'Lorin', 'Mirek', 'Nadia', 'Orvin', 'Perla', 'Quilo', 'Rivan', 'Selka', 'Torin',
  'Ulfa', 'Vanko', 'Wilma', 'Xenia', 'Yaris', 'Zorel'
];
const LAST_NAMES = [
  'Avaldi', 'Brenmar', 'Corvane', 'Delith', 'Ekhart', 'Fenwold', 'Grivane', 'Halbrook', 'Irsen',
  'Jaronde', 'Kestrel', 'Lomvik', 'Marbeck', 'Norvath', 'Olvenor', 'Pallenz', 'Quarnik', 'Rethlin',
  'Sarnov', 'Thalberg', 'Urvane', 'Voskar', 'Wrendel', 'Yalmar', 'Zeltrin'
];

const personName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

const COMPANY_NAMES = [
  'Vantia Foods Ltd.', 'Kordel Supply Co.', 'Elmara Logistics', 'Brightpine Trading',
  'Northgale Textiles', 'Solvent Works Inc.', 'Marbeck Machinery', 'Orvane Beverages',
  'Palekit Packaging', 'Quarn Metals', 'Rethlin Chemicals', 'Sunhollow Farms',
  'Thalberg Electric', 'Urvane Plastics', 'Vosk Paper Mill', 'Wrendel Components'
];

const CITIES = [
  'Aldergate', 'Brimhaven', 'Corvale', 'Dunmoor', 'Estmere', 'Fallowick', 'Granhollow',
  'Highmere', 'Ironvale', 'Larkspur', 'Marrowden', 'Northreach', 'Oakhurst', 'Pinegarde',
  'Quellmoor', 'Redhollow', 'Stonebridge', 'Tarnwick', 'Vellmont', 'Westhollow'
];

/* Deliberately fake IBAN-like account numbers — the check digits are always zero. */
function fakeAccountNo(index) {
  const branch = String(1000 + (index % 40));
  const serial = String(100000 + index * 7).slice(0, 6);
  return `TR00 0000 ${branch} 0000 ${serial}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1. Banking — account transactions + loan portfolio
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */
const FX_RATE = { TRY: 1, USD: 34.15, EUR: 37.4 };
const CURRENCIES = ['TRY', 'TRY', 'TRY', 'USD', 'EUR'];

const TRANSACTION_TYPES = [
  { code: 'EFT_OUT', label: 'Outgoing Transfer', direction: 'debit' },
  { code: 'EFT_IN', label: 'Incoming Transfer', direction: 'credit' },
  { code: 'CARD', label: 'Card Payment', direction: 'debit' },
  { code: 'SALARY', label: 'Salary Payment', direction: 'debit' },
  { code: 'COLLECT', label: 'Customer Collection', direction: 'credit' },
  { code: 'FEE', label: 'Bank Fee', direction: 'debit' },
  { code: 'INTEREST', label: 'Interest Income', direction: 'credit' },
  { code: 'FX', label: 'FX Conversion', direction: 'credit' }
];

const CHANNELS = ['Branch', 'Internet Banking', 'Mobile', 'API', 'ATM'];

function buildBreakdown(type, grossAmount) {
  const lines = [{ code: 'PRINCIPAL', label: 'Principal amount', amount: round2(grossAmount) }];
  if (type.code !== 'FEE' && rnd() > 0.35) {
    const fee = round2(Math.max(1.5, grossAmount * 0.0022));
    lines.push({ code: 'FEE', label: 'Transaction fee', amount: fee });
    lines.push({ code: 'VAT', label: 'Fee tax (5%)', amount: round2(fee * 0.05) });
  }
  if (type.code === 'FX') {
    lines.push({ code: 'SPREAD', label: 'FX spread', amount: round2(grossAmount * 0.003) });
  }
  return lines;
}

function generateTransactions(count) {
  const rows = [];
  const balances = new Map();

  for (let i = 0; i < count; i++) {
    const accountIndex = i % 12;
    const accountNo = fakeAccountNo(accountIndex);
    const accountName = accountIndex % 3 === 0 ? COMPANY_NAMES[accountIndex] : personName();
    const type = pick(TRANSACTION_TYPES);
    const currency = pick(CURRENCIES);
    const gross = moneyBetween(120, currency === 'TRY' ? 480000 : 18000);
    const signed = type.direction === 'debit' ? -gross : gross;
    const amountTry = round2(signed * FX_RATE[currency]);

    const previous = balances.get(accountNo) ?? moneyBetween(50000, 900000);
    const balanceAfter = round2(previous + amountTry);
    balances.set(accountNo, balanceAfter);

    const day = intBetween(0, 27);
    const month = intBetween(0, 8);

    rows.push({
      id: i + 1,
      accountNo,
      accountName,
      reference: `TRX-${String(202600000 + i * 13)}`,
      transactionDate: isoDateTime(2026, month, day + 1, intBetween(8, 18), intBetween(0, 59)),
      valueDate: isoDate(2026, month, day + 1),
      typeCode: type.code,
      typeLabel: type.label,
      direction: type.direction,
      description: `${type.label} · ${pick(COMPANY_NAMES)}`,
      channel: pick(CHANNELS),
      currency,
      amount: round2(signed),
      amountTry,
      balanceAfter,
      breakdown: buildBreakdown(type, gross)
    });
  }

  return rows.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
}

const LOAN_PRODUCTS = ['Working Capital', 'Investment Loan', 'Vehicle Loan', 'Export Credit', 'Overdraft'];
const RISK_GRADES = ['A', 'A', 'B', 'B', 'C', 'D'];
const LOAN_STATUSES = ['Active', 'Active', 'Active', 'Watchlist', 'Closed', 'Overdue'];

function generateLoans(count) {
  return Array.from({ length: count }, (_, i) => {
    const currency = pick(CURRENCIES);
    const principal = moneyBetween(50000, 4500000);
    const status = pick(LOAN_STATUSES);
    const outstanding = status === 'Closed' ? 0 : round2(principal * (0.15 + rnd() * 0.8));
    const startDate = isoDate(2023, intBetween(0, 11), intBetween(1, 28));
    const termMonths = pick([12, 24, 36, 48, 60]);

    return {
      id: i + 1,
      loanNo: `LN-${String(50000 + i * 3)}`,
      accountNo: fakeAccountNo(i % 12),
      customerName: i % 2 === 0 ? pick(COMPANY_NAMES) : personName(),
      product: pick(LOAN_PRODUCTS),
      currency,
      principal: round2(principal),
      outstanding,
      outstandingTry: round2(outstanding * FX_RATE[currency]),
      interestRate: round2(12 + rnd() * 34),
      installmentAmount: round2(principal / termMonths),
      termMonths,
      startDate,
      maturityDate: addDays(startDate, termMonths * 30),
      status,
      overdueDays: status === 'Overdue' ? intBetween(1, 180) : 0,
      riskGrade: pick(RISK_GRADES)
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2. Retail market — products and stock
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */
const RETAIL_CATEGORIES = [
  { name: 'Dairy', items: ['Whole Milk', 'Yoghurt', 'Butter', 'White Cheese', 'Kashkaval', 'Cream'] },
  { name: 'Bakery', items: ['Sourdough Loaf', 'Sesame Bagel', 'Croissant', 'Rye Bread', 'Pita'] },
  { name: 'Beverages', items: ['Orange Juice', 'Sparkling Water', 'Cola', 'Iced Tea', 'Ayran'] },
  { name: 'Fruit & Vegetable', items: ['Tomato', 'Cucumber', 'Apple', 'Banana', 'Lettuce', 'Pepper'] },
  { name: 'Frozen', items: ['Frozen Peas', 'Pizza Base', 'Ice Cream', 'Frozen Fries'] },
  { name: 'Cleaning', items: ['Dish Soap', 'Laundry Gel', 'Surface Spray', 'Bleach'] },
  { name: 'Snacks', items: ['Salted Crisps', 'Chocolate Bar', 'Roasted Nuts', 'Crackers'] },
  { name: 'Meat & Poultry', items: ['Chicken Breast', 'Minced Beef', 'Beef Cubes', 'Turkey Slices'] }
];

const SIZES = ['250 g', '500 g', '1 kg', '1 L', '750 ml', '6-pack', '12-pack'];
const WAREHOUSES = ['Central DC', 'Store Backroom', 'Cold Store', 'Overflow Depot'];

function generateProducts(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const category = RETAIL_CATEGORIES[i % RETAIL_CATEGORIES.length];
    const baseName = pick(category.items);
    const costPrice = moneyBetween(8, 420);
    const stockQty = intBetween(0, 900);
    const minStockQty = intBetween(20, 160);
    const shelfLifeDays = pick([3, 7, 14, 30, 90, 180, 365]);
    const receivedAt = isoDate(2026, intBetween(6, 8), intBetween(1, 28));

    rows.push({
      id: i + 1,
      // Prefix 29 is GS1's in-store/internal range, so these 13 digits can never collide with a
      // real product's EAN — unlike a real country prefix such as 868 (Türkiye).
      barcode: `29${String(10000000000 + i * 24137569).slice(0, 11)}`,
      name: `${baseName} ${pick(SIZES)}`,
      category: category.name,
      supplier: pick(COMPANY_NAMES),
      warehouse: pick(WAREHOUSES),
      costPrice: round2(costPrice),
      salePrice: round2(costPrice * (1.18 + rnd() * 0.5)),
      stockQty,
      minStockQty,
      reservedQty: intBetween(0, Math.max(1, Math.floor(stockQty / 4))),
      onShelf: stockQty > 0 && rnd() > 0.22,
      shelfLifeDays,
      receivedAt,
      expiryDate: addDays(receivedAt, shelfLifeDays),
      lastCountedAt: isoDate(2026, 8, intBetween(1, 28))
    });
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3. E-commerce — orders (JSON + XML)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */
const ORDER_STATUS_CODES = [10, 20, 20, 30, 30, 40, 50, 60];
const CARRIERS = ['SwiftPost', 'Kargolink', 'NovaShip', 'Bluepath Express', 'Larkway Cargo'];
const CHANNELS_ECOM = ['Web', 'Mobile App', 'Marketplace', 'Phone Order'];
const PAYMENT_METHODS = ['Credit Card', 'Bank Transfer', 'Cash on Delivery', 'Wallet'];

function generateOrders(count) {
  return Array.from({ length: count }, (_, i) => {
    const itemCount = intBetween(1, 9);
    const subtotal = moneyBetween(120, 18500);
    const shippingCost = round2(subtotal > 2500 ? 0 : moneyBetween(29, 89));
    const statusCode = pick(ORDER_STATUS_CODES);
    const orderDay = intBetween(1, 28);
    const orderMonth = intBetween(4, 8);

    return {
      id: i + 1,
      orderNo: `ORD-2026-${String(10000 + i)}`,
      orderDate: isoDateTime(2026, orderMonth, orderDay, intBetween(0, 23), intBetween(0, 59)),
      customerName: personName(),
      customerCity: pick(CITIES),
      channel: pick(CHANNELS_ECOM),
      statusCode,
      carrier: statusCode >= 30 ? pick(CARRIERS) : '',
      trackingNo: statusCode >= 30 ? `TRK${String(700000 + i * 11)}` : '',
      paymentMethod: pick(PAYMENT_METHODS),
      itemCount,
      subtotal: round2(subtotal),
      shippingCost,
      totalAmount: round2(subtotal + shippingCost),
      currency: 'TRY',
      isPaid: statusCode >= 20 && statusCode !== 60
    };
  }).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ordersToXml(orders) {
  const body = orders
    .map((order) => {
      const fields = Object.entries(order)
        .map(([key, value]) => `    <${key}>${escapeXml(value)}</${key}>`)
        .join('\n');
      return `  <order>\n${fields}\n  </order>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Fictional demo data. Not real orders, customers or carriers. -->\n<orders count="${orders.length}">\n${body}\n</orders>\n`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */
function writeOut(relativePath, content) {
  const target = join(ROOT, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(`wrote ${relativePath} (${(content.length / 1024).toFixed(1)} kB)`);
}

const transactions = generateTransactions(420);
const loans = generateLoans(160);
const products = generateProducts(400);
const orders = generateOrders(500);

writeOut('banking/src/assets/data/transactions.json', JSON.stringify(transactions, null, 2));
writeOut('banking/src/assets/data/loans.json', JSON.stringify(loans, null, 2));
writeOut('retail-market/src/assets/data/products.json', JSON.stringify(products, null, 2));
writeOut('ecommerce-dashboard/src/assets/data/orders.json', JSON.stringify(orders, null, 2));
writeOut('ecommerce-dashboard/src/assets/data/orders.xml', ordersToXml(orders));
