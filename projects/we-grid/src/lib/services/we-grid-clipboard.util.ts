/**
 * Reads the `text/plain` flavour of a spreadsheet copy into rows of cells.
 *
 * Excel, LibreOffice and Google Sheets all put a selection on the clipboard as tab-separated rows.
 * A cell that itself holds a tab, a line break or a quote is wrapped in double quotes, with inner
 * quotes doubled — the CSV rule with a tab as the separator. The trailing line break Excel adds
 * after the last row is not an extra empty row.
 */
export function weGridParseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  // A quote only opens a quoted cell at the very start of the cell — "5" inch" stays as typed.
  let atCellStart = true;

  while (i < text.length) {
    const ch = text[i];
    if (atCellStart && ch === '"') {
      const end = findClosingQuote(text, i + 1);
      if (end !== -1) {
        cell = text.slice(i + 1, end).replace(/""/g, '"');
        i = end + 1;
        atCellStart = false;
        continue;
      }
    }
    atCellStart = false;
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
    i++;
  }

  if (!atCellStart || cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Index of the quote closing a quoted cell, or -1 when the "quote" was just text: the closing quote
 * must be followed by a separator, a line break or the end of the text.
 */
function findClosingQuote(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] === '"') {
        i += 2;
        continue;
      }
      const next = text[i + 1];
      return next === undefined || next === '\t' || next === '\r' || next === '\n' ? i : -1;
    }
    i++;
  }
  return -1;
}
