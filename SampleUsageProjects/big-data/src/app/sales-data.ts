import { WeGridColumnStore } from 'we-grid-angular/engine';

/** One sale — the same fields as the fictional `sales` table of the we-report Node.js backend */
export interface Sale {
  id: number;
  customer: string;
  city: string;
  category: string;
  qty: number;
  price: number;
  total: number;
  order_date: string;
}

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Trabzon', 'Eskişehir', 'Kayseri'];
const CATEGORIES = ['Electronics', 'Books', 'Garden', 'Toys', 'Food', 'Clothing', 'Sports', 'Beauty'];
const FIRST_NAMES = ['Ada', 'Deniz', 'Ekin', 'Kaan', 'Lale', 'Mert', 'Nehir', 'Ozan', 'Pelin', 'Rüzgar', 'Selin', 'Toprak', 'Umut', 'Yağmur'];
const CUSTOMERS = FIRST_NAMES.flatMap((name) => Array.from({ length: 26 }, (_, c) => `${name} ${String.fromCharCode(65 + c)}.`));
const DAYS = Array.from({ length: 730 }, (_, d) => new Date(Date.UTC(2024, 0, 1) + d * 86_400_000).toISOString().slice(0, 10));

/**
 * `count` fictional sales as columns, the shape the engine stores anyway: a repeated text is a
 * small code into its list of values, money is whole cents — no row objects are ever made. Seeded,
 * so every run shows the same rows.
 */
export function generateSales(count: number): Parameters<typeof WeGridColumnStore.fromColumns>[0] {
  let seed = 42;
  const next = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const id = new Int32Array(count);
  const customer = new Uint16Array(count);
  const city = new Uint8Array(count);
  const category = new Uint8Array(count);
  const qty = new Uint8Array(count);
  const price = new Int32Array(count);
  const total = new Int32Array(count);
  const day = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const q = 1 + Math.floor(next() * 50);
    const cents = Math.floor(next() * 100_000);
    id[i] = i + 1;
    customer[i] = Math.floor(next() * CUSTOMERS.length);
    city[i] = Math.floor(next() * CITIES.length);
    category[i] = Math.floor(next() * CATEGORIES.length);
    qty[i] = q;
    price[i] = cents;
    total[i] = q * cents;
    day[i] = Math.floor(next() * DAYS.length);
  }
  return {
    id,
    customer: { dictionary: CUSTOMERS, codes: customer },
    city: { dictionary: CITIES, codes: city },
    category: { dictionary: CATEGORIES, codes: category },
    qty,
    price: { fixed: price, scale: 100 },
    total: { fixed: total, scale: 100 },
    order_date: { dictionary: DAYS, codes: day }
  };
}
