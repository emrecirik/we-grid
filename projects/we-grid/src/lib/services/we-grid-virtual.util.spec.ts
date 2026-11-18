import { WE_GRID_MAX_SCROLL_PX, weGridPosForScrollTop, weGridScrollTopForPos, weGridVirtualWindow } from './we-grid-virtual.util';

describe('weGridVirtualWindow', () => {
  it('renders the rows in view plus overscan, with spacers for the rest', () => {
    const w = weGridVirtualWindow(1000, 30, 3000, 300, 5);
    expect(w.start).toBe(95);
    expect(w.end).toBe(115);
    expect(w.padTop).toBe(95 * 30);
    expect(w.padBottom).toBe((1000 - 115) * 30);
    expect(w.scrollTop).toBe(3000);
  });

  it('clamps at both ends', () => {
    expect(weGridVirtualWindow(1000, 30, -50, 300, 5)).toEqual(jasmine.objectContaining({ start: 0, padTop: 0, pos: 0 }));
    const end = weGridVirtualWindow(1000, 30, 1e9, 300, 5);
    expect(end.end).toBe(1000);
    expect(end.padBottom).toBe(0);
    expect(end.pos).toBe(1000 * 30 - 300);
  });

  it('handles an empty list and a list shorter than the viewport', () => {
    expect(weGridVirtualWindow(0, 30, 100, 300)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0, pos: 0, scrollTop: 0 });
    const short = weGridVirtualWindow(5, 30, 0, 300);
    expect([short.start, short.end, short.padTop, short.padBottom]).toEqual([0, 5, 0, 0]);
  });

  it('scales the scrollbar for a billion rows and keeps the content within the cap', () => {
    const count = 1_000_000_000;
    const mid = weGridVirtualWindow(count, 32, (count * 32) / 2, 600, 4);
    expect(mid.start).toBeGreaterThan(count / 2 - 10);
    expect(mid.end - mid.start).toBeLessThan(40);
    expect(mid.padTop + (mid.end - mid.start) * 32 + mid.padBottom).toBeCloseTo(WE_GRID_MAX_SCROLL_PX, 0);
    const last = weGridVirtualWindow(count, 32, Infinity, 600, 4);
    expect(last.end).toBe(count);
    expect(last.padBottom).toBeCloseTo(0, 3);
    expect(last.scrollTop).toBeCloseTo(WE_GRID_MAX_SCROLL_PX - 600, 3);
  });

  it('maps scrollTop and position both ways', () => {
    const count = 50_000_000;
    const pos = weGridPosForScrollTop(count, 32, 4_000_000, 600);
    expect(weGridScrollTopForPos(count, 32, pos, 600)).toBeCloseTo(4_000_000, 3);
    expect(weGridPosForScrollTop(1000, 32, 1234, 600)).toBe(1234);
  });
});
