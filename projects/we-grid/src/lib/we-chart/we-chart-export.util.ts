import { weChartLabelWidth } from './we-chart.util';

/** The presentation properties copied off the live chart, so the file looks the same without the page's CSS */
const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-variant-numeric',
  'text-anchor',
  'dominant-baseline',
  'visibility',
  'display'
];

/** Interactive layers that carry nothing for a picture */
const DROP_SELECTOR = '.we-chart__hit, .we-chart__crosshair';

const escapeXml = (text: string): string => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface WeChartSvgOptions {
  /** Background filled behind the chart; transparent when left out */
  background?: string;
  /** Title drawn over the chart — the `<we-chart>` title by default */
  title?: string;
}

/**
 * A standalone SVG document of a rendered `<we-chart>` (the element or anything inside which it
 * sits): its plot with the theme's colours written onto every shape, its title on top and its
 * legend underneath. Null while the chart shows its table or has no data.
 */
export function weChartToSvg(chartHost: Element, options: WeChartSvgOptions = {}): { svg: string; width: number; height: number } | null {
  const figure = chartHost.matches('.we-chart') ? chartHost : chartHost.querySelector('.we-chart');
  const plot = figure?.querySelector<SVGSVGElement>('.we-chart__plot svg');
  if (!figure || !plot) return null;
  const view = figure.ownerDocument.defaultView;
  if (!view) return null;
  const width = Number(plot.getAttribute('width')) || plot.getBoundingClientRect().width;
  const plotHeight = Number(plot.getAttribute('height')) || plot.getBoundingClientRect().height;

  const clone = plot.cloneNode(true) as SVGSVGElement;
  const source = [plot, ...Array.from(plot.querySelectorAll('*'))];
  const target = [clone, ...Array.from(clone.querySelectorAll('*'))];
  source.forEach((el, i) => {
    const computed = view.getComputedStyle(el);
    const style = STYLE_PROPS.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';');
    target[i].setAttribute('style', style);
    target[i].removeAttribute('class');
    // Focus and description belong to the live chart, not to a picture of it
    target[i].removeAttribute('tabindex');
    target[i].removeAttribute('aria-describedby');
  });
  source.forEach((el, i) => el.matches(DROP_SELECTOR) && target[i].remove());

  const figureStyle = view.getComputedStyle(figure);
  const font = `font-family:${escapeXml(figureStyle.fontFamily)}`;
  const color = figureStyle.color;
  const pad = 12;
  const title = options.title ?? figure.querySelector('.we-chart__title')?.textContent?.trim() ?? '';
  const titleHeight = title ? 28 : 0;

  // Legend items flow left to right and wrap, as the HTML legend does
  const items = Array.from(figure.querySelectorAll('.we-chart__legend li')).map((li) => ({
    label: li.textContent?.trim() ?? '',
    color: view.getComputedStyle(li.querySelector('.we-chart__key') ?? li).backgroundColor
  }));
  const legend: string[] = [];
  let x = pad;
  let row = 0;
  for (const item of items) {
    const w = 18 + weChartLabelWidth(item.label) + 16;
    if (x + w > width - pad && x > pad) {
      x = pad;
      row++;
    }
    const y = titleHeight + plotHeight + 10 + row * 20;
    legend.push(
      `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${item.color}"/>` +
        `<text x="${x + 16}" y="${y + 9}" font-size="12" fill="${color}">${escapeXml(item.label)}</text>`
    );
    x += w;
  }
  const legendHeight = items.length ? (row + 1) * 20 + 10 : 0;
  const height = titleHeight + plotHeight + legendHeight;

  if (title) clone.setAttribute('aria-label', title);
  clone.setAttribute('x', '0');
  clone.setAttribute('y', String(titleHeight));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="${font}">` +
    (options.background ? `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>` : '') +
    (title ? `<text x="${pad}" y="20" font-size="15" font-weight="600" fill="${color}">${escapeXml(title)}</text>` : '') +
    new XMLSerializer().serializeToString(clone) +
    legend.join('') +
    `</svg>`;
  return { svg, width, height };
}

/** Renders an SVG document to a PNG at `scale` times its size (2 keeps it sharp on high-density screens) */
export function weChartSvgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
    };
    image.onerror = () => reject(new Error('svg'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
