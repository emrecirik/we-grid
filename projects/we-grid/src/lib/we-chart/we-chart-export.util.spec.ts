import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeChartComponent } from './we-chart.component';
import { weChartSvgToPng, weChartToSvg } from './we-chart-export.util';
import { WeChartData, WeChartType } from './we-chart.util';

@Component({
  standalone: true,
  imports: [WeChartComponent],
  template: `<we-chart [type]="type" [data]="data" title="Sales <2026>" [showTable]="table" (pointClick)="0" />`
})
class HostComponent {
  type: WeChartType = 'column';
  table = false;
  data: WeChartData = {
    categories: ['İzmir', 'Ankara'],
    series: [
      { name: 'Qty', values: [7, 4] },
      { name: 'Amount', values: [11, 4] }
    ]
  };
}

describe('weChartToSvg', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('writes a standalone picture: resolved colours, the title, the legend, no hit areas', () => {
    const image = weChartToSvg(fixture.nativeElement, { background: 'rgb(1, 2, 3)' })!;
    expect(image).not.toBeNull();
    const doc = new DOMParser().parseFromString(image.svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(image.svg).not.toContain('var(--');
    expect(image.svg).not.toContain('class=');
    expect(image.svg).toContain('fill="rgb(1, 2, 3)"');
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('Sales <2026>');
    expect(texts).toContain('Qty');
    expect(texts).toContain('Amount');
    // The marks keep their theme colour, written out
    const mark = fixture.nativeElement.querySelector('.we-chart__mark') as SVGElement;
    const colour = getComputedStyle(mark).fill;
    expect(image.svg).toContain(`fill:${colour}`);
    expect(image.height).toBeGreaterThan(Number(fixture.nativeElement.querySelector('.we-chart__plot svg').getAttribute('height')));
  });

  it('uses the given title over the chart’s own', () => {
    const image = weChartToSvg(fixture.nativeElement, { title: 'Other' })!;
    expect(image.svg).toContain('>Other</text>');
    expect(image.svg).not.toContain('Sales');
  });

  it('gives nothing while the chart shows its table', () => {
    fixture.componentInstance.table = true;
    fixture.detectChanges();
    expect(weChartToSvg(fixture.nativeElement)).toBeNull();
  });

  it('renders the picture to a PNG at twice its size', async () => {
    const image = weChartToSvg(fixture.nativeElement)!;
    const blob = await weChartSvgToPng(image.svg, image.width, image.height);
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(Math.round(image.width * 2));
  });
});
