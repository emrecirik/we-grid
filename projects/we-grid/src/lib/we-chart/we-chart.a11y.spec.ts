import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeChartComponent } from './we-chart.component';
import { WeChartData, WeChartPointClickEvent, WeChartType, weChartSummary, weChartWaterfall } from './we-chart.util';

describe('weChartWaterfall', () => {
  it('moves a running total by each value and ends with a total bar', () => {
    expect(weChartWaterfall([100, -30, null, 20])).toEqual([
      { from: 0, to: 100, kind: 'up' },
      { from: 100, to: 70, kind: 'down' },
      { from: 70, to: 70, kind: 'up' },
      { from: 70, to: 90, kind: 'up' },
      { from: 0, to: 90, kind: 'total' }
    ]);
  });
});

describe('weChartSummary', () => {
  it('finds the highest and lowest point, the total and the trend of the first series', () => {
    const data: WeChartData = {
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'A', values: [10, 12, 20] },
        { name: 'B', values: [5, null, 1] }
      ]
    };
    expect(weChartSummary(data)).toEqual({
      high: { category: 'Mar', series: 'A', value: 20 },
      low: { category: 'Mar', series: 'B', value: 1 },
      total: 48,
      trend: 'up'
    });
  });

  it('calls a change within 5 % flat, leaves the trend out under three categories, and gives nothing without values', () => {
    expect(weChartSummary({ categories: ['a', 'b', 'c'], series: [{ name: 'x', values: [100, 50, 103] }] })!.trend).toBe('flat');
    expect(weChartSummary({ categories: ['a', 'b'], series: [{ name: 'x', values: [1, 9] }] })!.trend).toBeNull();
    expect(weChartSummary({ categories: ['a'], series: [{ name: 'x', values: [null] }] })).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart [type]="type" [data]="data" [showSummary]="summary" (pointClick)="clicks.push($event)" />`
})
class HostComponent {
  type: WeChartType = 'column';
  summary = false;
  clicks: WeChartPointClickEvent[] = [];
  data: WeChartData = {
    categories: ['Jan', 'Feb', 'Mar'],
    series: [
      { name: 'Sales', values: [10, 12, 20] },
      { name: 'Costs', values: [4, 6, 5] }
    ]
  };
}

describe('<we-chart> — keyboard, summary and waterfall', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const svg = (): SVGSVGElement => fixture.nativeElement.querySelector('.we-chart__plot svg');
  const key = (k: string): void => {
    svg().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const live = (): string => (fixture.nativeElement.querySelector('.we-chart__sr[aria-live]') as HTMLElement).textContent!.trim();

  it('makes the plot one tab stop described by the summary', () => {
    expect(svg().getAttribute('tabindex')).toBe('0');
    const described = document.getElementById(svg().getAttribute('aria-describedby')!)!;
    expect(described.textContent).toContain('6 values. Highest Mar · Sales: 20, lowest Jan · Costs: 4');
    expect(described.textContent).toContain('total 57');
    expect(described.textContent).toContain('Rising overall.');
    expect(described.textContent).toContain('Arrow keys move between values');
  });

  it('walks the values with the arrow keys, announcing each, and selects with Enter', () => {
    key('ArrowRight');
    expect(live()).toBe('Jan · Sales: 10');
    key('ArrowRight');
    key('ArrowUp');
    expect(live()).toBe('Feb · Costs: 6');
    expect(fixture.nativeElement.querySelectorAll('.we-chart__mark--kbd').length).toBe(1);
    key('End');
    expect(live()).toBe('Mar · Costs: 5');
    key('Enter');
    expect(host.clicks).toEqual([{ category: 'Mar', series: 'Costs', value: 5, index: 2 }]);
    key('Escape');
    expect(fixture.nativeElement.querySelector('.we-chart__mark--kbd')).toBeNull();
  });

  it('steps through the slices of a pie, one series, and leaves a gauge out', () => {
    host.type = 'pie';
    fixture.detectChanges();
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowRight');
    expect(live()).toBe('Feb: 12');
    expect(fixture.nativeElement.querySelectorAll('.we-chart__mark--kbd').length).toBe(1);
    host.type = 'gauge';
    fixture.detectChanges();
    expect(svg().getAttribute('tabindex')).toBeNull();
  });

  it('shows the summary under the chart on request', () => {
    expect(fixture.nativeElement.querySelector('.we-chart__summary')).toBeNull();
    host.summary = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.we-chart__summary').textContent).toContain('Highest Mar · Sales: 20');
  });

  it('draws a waterfall: rises and falls from the running total, and a total bar', () => {
    host.type = 'waterfall';
    host.data = { categories: ['Start', 'Sales', 'Costs'], series: [{ name: 'Cash', values: [100, 40, -30] }] };
    fixture.detectChanges();
    const marks = Array.from<SVGPathElement>(fixture.nativeElement.querySelectorAll('.we-chart__mark'));
    expect(marks.length).toBe(4);
    const fills = marks.map((m) => m.style.fill);
    expect(fills[0]).toContain('--we-grid-success-color');
    expect(fills[1]).toContain('--we-grid-success-color');
    expect(fills[2]).toContain('--we-grid-danger-color');
    expect(fills[3]).toContain('--we-grid-chart-1');
    key('End');
    expect(live()).toBe('Total: 110');
    // The summary covers the changes, not the total bar
    expect(document.getElementById(svg().getAttribute('aria-describedby')!)!.textContent).toContain('3 values');
  });
});
