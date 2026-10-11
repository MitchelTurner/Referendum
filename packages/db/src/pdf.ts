import { chunkPageText } from '@referendum/shared';

export type ExtractedPage = { pageNumber: number; text: string };

type PdfTextItem = { str?: string };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderPageHtml(title: string, pageNumber: number, text: string): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const paragraphs = (blocks.length > 0 ? blocks : [text.trim() || 'This page has no extractable text.'])
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join('\n');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} page ${pageNumber}</title></head><body><article id="page-${pageNumber}"><h1>${escapeHtml(title)} — page ${pageNumber}</h1>${paragraphs}</article></body></html>`;
}

export async function extractPdfPages(data: Buffer): Promise<ExtractedPage[]> {
  if (!data.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
    const text = data.toString('utf8');
    return [{ pageNumber: 1, text }];
  }
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (src: { data: Uint8Array; disableWorker?: boolean }) => { promise: Promise<PdfDocument> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true }).promise;
  const pages: ExtractedPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ pageNumber, text });
  }
  return pages;
}

export function pageChunks(text: string): string[] {
  const chunks = chunkPageText(text);
  return chunks.length > 0 ? chunks : text.trim() ? [text.trim()] : [];
}
