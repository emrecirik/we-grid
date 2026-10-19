import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeChartComponent } from './we-chart.component';
import { WeChartData, WeChartType, weChartArc, weChartBarPath, weChartColor, weChartFold, weChartTicks } from './we-chart.util';

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
});

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart [type]="type" [data]="data" title="Sales" [stacked]="stacked" />`
})
class HostComponent {
  type: WeChartType = 'column';
  stacked = false;
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
});
