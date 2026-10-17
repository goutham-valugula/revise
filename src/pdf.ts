export type PdfProgress = (page: number, total: number) => void;

export async function extractPdfText(file: File, onProgress?: PdfProgress): Promise<{ text: string; pages: number }> {
  const [{ GlobalWorkerOptions, getDocument }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];

      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.trim();
        if (text) line += `${line ? ' ' : ''}${text}`;
        if (item.hasEOL) {
          if (line) lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      pageTexts.push(lines.join('\n'));
      onProgress?.(pageNumber, document.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pageTexts
    .map((pageText, index) => `[Page ${index + 1}]\n${pageText}`)
    .join('\n\n')
    .trim();

  if (!text || pageTexts.every((pageText) => !pageText.trim())) {
    throw new Error('This PDF has no selectable text. Scanned PDFs need OCR, which Revise does not include.');
  }

  return { text, pages: pageTexts.length };
}
