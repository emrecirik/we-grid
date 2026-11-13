import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeChartComponent } from './we-chart.component';
import {
  WeChartData,
  WeChartPointClickEvent,
  WeChartType,
  weChartArc,
  weChartBarLabelFits,
  weChartBarPath,
  weChartColor,
  weChartColumnLabelFits,
  weChartFold,
  weChartLabelCollides,
  weChartLabelColor,
  weChartPieLabelFits,
  weChartRoundRect,
  weChartStackedLabelFits,
  weChartStatusColor,
  weChartTicks
} from './we-chart.util';

describe('we-chart utils', () => {
  it('picks round ticks that include zero', () => {
    expect(weChartTicks(0, 437)).toEqual([0, 100, 200, 300, 400, 500]);
    expect(weChartTicks(-20, 80)).toEqual([-20, 0, 20, 40, 60, 80]);
    expect(weChartTicks(0, 0)).toEqual([0, 1]);
    expect(weChartTicks(0, 1.2)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
  });

  it('folds series past the palette into Other — never a ninth colour', () => {
    const data: WeChartData = { categories: ['a', 'b'], series: Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, values: [i, 1] })) };
    const folded = weChartFold(data, 8, 'Other');
    expect(folded.series.length).toBe(8);
    expect(folded.series[7]).toEqual({ name: 'Other', values: [7 + 8 + 9, 3] });
    const pie = weChartFold({ categories: ['a', 'b', 'c', 'd'], series: [{ name: 'v', values: [1, 2, 3, 4] }] }, 3, 'Other', true);
    expect(pie.categories).toEqual(['a', 'b', 'Other']);
    expect(pie.series[0].values).toEqual([1, 2, 7]);
  });

  it('names theme colours in a fixed order', () => {
    expect(weChartColor(0)).toBe('var(--we-grid-chart-1, #2a78d6)');
    expect(weChartColor(7)).toContain('--we-grid-chart-8');
    expect(weChartColor(12)).toContain('--we-grid-chart-8');
  });

  it('draws slices, rings and rounded bars', () => {
    expect(weChartArc(50, 50, 40, 0, 0, Math.PI / 2)).toBe('M50,50 L50,10 A40,40 0 0 1 90,50 Z');
    expect(weChartArc(50, 50, 40, 20, 0, Math.PI * 2)).toContain('A20,20');
    expect(weChartBarPath('column', 10, 20, 100, 40)).toBe('M10,100 L10,44 Q10,40 14,40 L26,40 Q30,40 30,44 L30,100 Z');
    expect(weChartBarPath('bar', 10, 20, 0, 60)).toBe('M0,10 L56,10 Q60,10 60,14 L60,26 Q60,30 56,30 L0,30 Z');
  });

  it('skips value labels on thresholds too small to hold them', () => {
    expect(weChartStackedLabelFits(14)).toBe(true);
    expect(weChartStackedLabelFits(13.9)).toBe(false);
    expect(weChartPieLabelFits((12 * Math.PI) / 180)).toBe(true);
    expect(weChartPieLabelFits((11 * Math.PI) / 180)).toBe(false);
    expect(weChartColumnLabelFits(20, 10)).toBe(false); // 10px room, needs 14
    expect(weChartColumnLabelFits(30, 10)).toBe(true); // 20px room
    expect(weChartBarLabelFits(80, 100, 20)).toBe(false); // 20px room, needs 26 (20 + 6 gap)
    expect(weChartBarLabelFits(80, 100, 10)).toBe(true); // needs 16
  });

  it('skips a line/area label that would overlap the previous one', () => {
    expect(weChartLabelCollides(null, 50)).toBe(false);
    expect(weChartLabelCollides(50, 70)).toBe(true);
    expect(weChartLabelCollides(50, 80)).toBe(false);
  });

  it('picks white label text over the (dark-ish) palette fallbacks', () => {
    expect(weChartLabelColor(0)).toBe('#fff');
    expect(weChartLabelColor(3)).toBe('#fff');
  });
});

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart [type]="type" [data]="data" title="Sales" [stacked]="stacked" [showValues]="showValues" />`
})
class HostComponent {
  type: WeChartType = 'column';
  stacked = false;
  showValues = false;
  data: WeChartData = {
    categories: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'North', values: [10, 20, null] },
      { name: 'South', values: [5, 15, 25] }
    ]
  };
}

describe('WeChartComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('draws one bar per value and a legend for two series', () => {
    expect(el().querySelectorAll('.we-chart__mark').length).toBe(5);
    expect(Array.from(el().querySelectorAll('.we-chart__legend li')).map((l) => l.textContent?.trim())).toEqual(['North', 'South']);
    expect(el().querySelector('svg')?.getAttribute('aria-label')).toBe('Sales');
  });

  it('shows every value of a category on hover', () => {
    el().querySelectorAll('.we-chart__hit')[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const tip = el().querySelector('.we-chart__tip')!;
    expect(tip.textContent).toContain('Feb');
    expect(tip.textContent).toContain('20');
    expect(tip.textContent).toContain('15');
  });

  it('switches to a table with the same numbers', () => {
    el().querySelector<HTMLButtonElement>('.we-chart__toggle')!.click();
    fixture.detectChanges();
    const cells = Array.from(el().querySelectorAll('.we-chart__table tbody tr')).map((tr) =>
      Array.from(tr.children)
        .map((c) => c.textContent?.trim())
        .join(' ')
    );
    expect(cells).toEqual(['Jan 10 5', 'Feb 20 15', 'Mar — 25']);
  });

  it('draws lines with markers, and pies with one slice per category', () => {
    fixture.componentInstance.type = 'line';
    fixture.detectChanges();
    expect(el().querySelectorAll('.we-chart__line').length).toBe(2);
    expect(el().querySelectorAll('.we-chart__dot').length).toBe(5);
    fixture.componentInstance.type = 'donut';
    fixture.detectChanges();
    expect(el().querySelectorAll('.we-chart__mark--slice').length).toBe(2);
    expect(Array.from(el().querySelectorAll('.we-chart__legend li')).map((l) => l.textContent?.trim())).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('draws value labels only when showValues is on', () => {
    expect(el().querySelectorAll('.we-chart__value-label').length).toBe(0);
    fixture.componentInstance.showValues = true;
    fixture.detectChanges();
    const labels = Array.from(el().querySelectorAll('.we-chart__value-label'));
    expect(labels.length).toBe(5);
    expect(labels.every((l) => l.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(labels.map((l) => l.textContent)).toContain('20');
  });
});

describe('we-chart status colours and rounded rects', () => {
  it('colours a ratio green on target, amber from 70%, red below', () => {
    expect(weChartStatusColor(1)).toContain('--we-grid-success-color');
    expect(weChartStatusColor(0.7)).toContain('--we-grid-warning-color');
    expect(weChartStatusColor(0.69)).toContain('--we-grid-danger-color');
  });

  it('clamps the corner radius of a rounded rect', () => {
    expect(weChartRoundRect(0, 0, 4, 8, 4)).toBe('M2,0 L2,0 Q4,0 4,2 L4,6 Q4,8 2,8 L2,8 Q0,8 0,6 L0,2 Q0,0 2,0 Z');
  });
});

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart
    [type]="type"
    [data]="data"
    [height]="height"
    [max]="max"
    [target]="target"
    [centerLabel]="centerLabel"
    [showValues]="showValues"
    (pointClick)="clicks.push($event)"
  />`
})
class ClickHostComponent {
  type: WeChartType = 'column';
  height = 300;
  max?: number;
  target?: number;
  centerLabel?: string;
  showValues = false;
  clicks: WeChartPointClickEvent[] = [];
  data: WeChartData = {
    categories: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'North', values: [10, 20, null] },
      { name: 'South', values: [5, 15, 25] }
    ]
  };
}

describe('WeChartComponent — pointClick and the KPI chart types', () => {
  let fixture: ComponentFixture<ClickHostComponent>;
  let host: ClickHostComponent;
  const el = (): HTMLElement => fixture.nativeElement;
  const texts = (): string[] => Array.from(el().querySelectorAll('.we-chart__value-label')).map((t) => t.textContent ?? '');
  const set = (patch: Partial<ClickHostComponent>) => {
    Object.assign(host, patch);
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(ClickHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reports the clicked bar with its series, and a band click as the category sum', () => {
    const marks = el().querySelectorAll<SVGPathElement>('.we-chart__mark');
    expect(marks[1].getAttribute('tabindex')).toBe('0');
    expect(marks[1].getAttribute('role')).toBe('button');
    marks[1].dispatchEvent(new MouseEvent('click'));
    el().querySelectorAll('.we-chart__hit')[1].dispatchEvent(new MouseEvent('click'));
    expect(host.clicks).toEqual([
      { category: 'Jan', series: 'South', value: 5, index: 0 },
      { category: 'Feb', series: null, value: 35, index: 1 }
    ]);
  });

  it('reports a line point and a pie slice, also from the keyboard', () => {
    set({ type: 'line' });
    el().querySelectorAll('.we-chart__dot')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    set({ type: 'pie' });
    el().querySelectorAll('.we-chart__mark--slice')[0].dispatchEvent(new MouseEvent('click'));
    expect(host.clicks).toEqual([
      { category: 'Feb', series: 'North', value: 20, index: 1 },
      { category: 'Jan', series: 'North', value: 10, index: 0 }
    ]);
  });

  it('puts the donut total in the middle with its caption', () => {
    set({ type: 'donut', centerLabel: 'Total' });
    expect(texts()).toEqual(['30', 'Total']);
    set({ centerLabel: undefined });
    expect(texts()).toEqual([]);
  });

  it('draws a gauge of the first series total, coloured against the target', () => {
    set({ type: 'gauge', max: 50, target: 40 });
    const arc = el().querySelector<SVGPathElement>('.we-chart__mark')!;
    expect(arc.style.fill).toContain('warning'); // North's 30 is 75% of the 40 target
    expect(texts()).toContain('Target: 40');
    expect(el().querySelectorAll('.we-chart__target').length).toBe(1);
    expect(el().querySelector('.we-chart__legend')).toBeNull();
    arc.dispatchEvent(new MouseEvent('click'));
    expect(host.clicks).toEqual([{ category: 'North', series: 'North', value: 30, index: 0 }]);
  });

  it('draws one radial ring and track per category', () => {
    set({ type: 'radialBar', data: { categories: ['A', 'B', 'C'], series: [{ name: 'v', values: [80, 40, 0] }] } });
    expect(el().querySelectorAll('.we-chart__track').length).toBe(3);
    expect(el().querySelectorAll('.we-chart__mark').length).toBe(2);
    expect(Array.from(el().querySelectorAll('.we-chart__legend li')).map((l) => l.textContent?.trim())).toEqual(['A', 'B', 'C']);
  });

  it('draws progress rows against the second series as target', () => {
    set({ type: 'progress', data: { categories: ['Ada', 'Bob'], series: [{ name: 'Sales', values: [80, 120] }, { name: 'Goal', values: [100, 100] }] } });
    expect(texts()).toEqual(['Ada', '80 · 80%', 'Target: 100', 'Bob', '120 · 120%', 'Target: 100']);
    const fills = Array.from(el().querySelectorAll<SVGPathElement>('.we-chart__mark')).map((m) => m.style.fill);
    expect(fills[0]).toContain('warning');
    expect(fills[1]).toContain('success');
    el().querySelectorAll('.we-chart__hit')[1].dispatchEvent(new MouseEvent('click'));
    expect(host.clicks).toEqual([{ category: 'Bob', series: 'Sales', value: 120, index: 1 }]);
  });

  it('orders funnel steps by value, widest first', () => {
    set({ type: 'funnel', data: { categories: ['Lead', 'Won', 'Offer'], series: [{ name: 'n', values: [100, 10, 40] }] } });
    expect(texts()).toEqual(['Lead', 'Offer', 'Won']);
    el().querySelectorAll('.we-chart__mark')[1].dispatchEvent(new MouseEvent('click'));
    expect(host.clicks).toEqual([{ category: 'Offer', series: 'n', value: 40, index: 2 }]);
  });

  it('draws a sparkline 40px high, without axes, legend or header', () => {
    set({ type: 'sparkline' });
    expect(el().querySelector('svg')!.getAttribute('height')).toBe('40');
    expect(el().querySelectorAll('.we-chart__line').length).toBe(2);
    expect(el().querySelectorAll('.we-chart__area').length).toBe(1);
    expect(el().querySelector('.we-chart__tick')).toBeNull();
    expect(el().querySelector('.we-chart__legend')).toBeNull();
    expect(el().querySelector('.we-chart__head')).toBeNull();
    set({ height: 60 });
    expect(el().querySelector('svg')!.getAttribute('height')).toBe('60');
  });
});

describe('WeChartComponent without a pointClick listener', () => {
  it('keeps marks out of the tab order', () => {
    const fixture = TestBed.createComponent(WeChartComponent);
    fixture.componentRef.setInput('data', { categories: ['a'], series: [{ name: 's', values: [1] }] });
    fixture.detectChanges();
    const mark = fixture.nativeElement.querySelector('.we-chart__mark') as SVGPathElement;
    expect(mark.getAttribute('tabindex')).toBeNull();
    expect(fixture.nativeElement.querySelector('.we-chart--clickable')).toBeNull();
  });
});
