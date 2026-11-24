import { Component, Input, OnChanges } from '@angular/core';
import { WeChartComponent, WeChartData, WeChartType } from 'we-grid-angular';
import { StudioOrder } from './studio-data';
import { StudioText } from './studio-text';

interface ChartCard {
  type: WeChartType;
  title: string;
  data: WeChartData;
  stacked?: boolean;
}

/** One order's value — the grid's formula column, worked out here for the charts */
const orderTotal = (o: StudioOrder): number => o.qty * o.unitPrice * (1 - o.discount);

/** Sums `value` per distinct `key`, in first-seen order (or `order` when given) */
function sumBy(orders: readonly StudioOrder[], key: (o: StudioOrder) => string, value: (o: StudioOrder) => number, order?: string[]): WeChartData & { keys: string[] } {
  const sums = new Map<string, number>();
  for (const o of orders) sums.set(key(o), (sums.get(key(o)) ?? 0) + value(o));
  const keys = order ?? [...sums.keys()];
  return { keys, categories: keys, series: [{ name: '', values: keys.map((k) => Math.round(sums.get(k) ?? 0)) }] };
}

/** The Charts tab — every `<we-chart>` type over the same 240 orders, with the summary shown and keyboard navigation */
@Component({
  selector: 'studio-charts-tab',
  standalone: true,
  imports: [WeChartComponent],
  template: `
    <section class="panel" role="tabpanel" [attr.aria-label]="text.tabCharts">
      <div class="panel__head">
        <div>
          <h1>{{ text.chartsTitle }}</h1>
          <p class="muted">{{ text.chartsIntro }}</p>
        </div>
      </div>
      <div class="charts">
        @for (card of cards; track $index) {
          <we-chart [type]="card.type" [data]="card.data" [title]="card.title" [stacked]="!!card.stacked" [height]="260" [showValues]="card.type === 'waterfall' || card.type === 'column' || card.type === 'heatmap'" [showSummary]="true" [valueFormatter]="whole" />
        }
      </div>
    </section>
  `,
  styles: [
    `
      .charts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
        gap: 1rem;
      }
    `
  ]
})
export class ChartsTabComponent implements OnChanges {
  @Input({ required: true }) text!: StudioText;
  @Input({ required: true }) orders: StudioOrder[] = [];
  @Input() locale = 'en-US';
  cards: ChartCard[] = [];
  whole = (v: number): string => v.toLocaleString(this.locale, { maximumFractionDigits: 0 });

  ngOnChanges(): void {
    const t = this.text;
    const o = this.orders;
    const named = (d: WeChartData, name: string): WeChartData => ({ categories: d.categories, series: d.series.map((s) => ({ ...s, name })) });
    const byCity = sumBy(o, (x) => x.city, orderTotal);
    const byCategory = sumBy(o, (x) => x.category, orderTotal);
    const months = [...new Set(o.map((x) => x.date.slice(0, 7)))].sort();
    const byMonth = sumBy(o, (x) => x.date.slice(0, 7), orderTotal, months);
    const byStatus = sumBy(o, (x) => x.status, () => 1);
    const qtyByCategory = sumBy(o, (x) => x.category, (x) => x.qty);
    const statuses = byStatus.keys;
    // Each category's revenue split by status, for a stacked column
    const stacked: WeChartData = {
      categories: byCategory.keys,
      series: statuses.map((s) => ({ name: s, values: byCategory.keys.map((c) => Math.round(o.filter((x) => x.category === c && x.status === s).reduce((a, x) => a + orderTotal(x), 0))) }))
    };
    // Orders per category (rows) and month (columns)
    const heat: WeChartData = {
      categories: months,
      series: byCategory.keys.map((c) => ({ name: c, values: months.map((m) => o.filter((x) => x.category === c && x.date.startsWith(m)).length) }))
    };
    this.cards = [
      { type: 'column', title: t.chartRevenueByCity, data: named(byCity, t.chartRevenue) },
      { type: 'waterfall', title: t.chartRevenueBuildUp, data: named(byCategory, t.chartRevenue) },
      { type: 'line', title: t.chartRevenueByMonth, data: named(byMonth, t.chartRevenue) },
      { type: 'donut', title: t.chartOrdersByStatus, data: named(byStatus, t.chartOrders) },
      { type: 'column', title: t.chartCategoryByStatus, data: stacked, stacked: true },
      { type: 'bar', title: t.chartQtyByCategory, data: named(qtyByCategory, t.chartQty) },
      { type: 'funnel', title: t.chartOrdersByStatus, data: named(byStatus, t.chartOrders) },
      { type: 'radialBar', title: t.chartQtyByCategory, data: named(qtyByCategory, t.chartQty) },
      { type: 'heatmap', title: t.chartOrdersHeatmap, data: heat }
    ];
  }
}
