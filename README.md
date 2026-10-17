# Revise

**A local-first document revision comparison tool.** Compare two PDFs or text files line by line, review what changed, and export a Markdown summary. Revise is deliberately a text-difference tool—not an automated quality, safety, or compliance verdict.

![Revise comparison workspace](assets/revise-preview.png)

## Why Revise

Comparing procedure and policy revisions often means scanning long documents for small edits. Revise makes those edits easier to find while leaving interpretation and decisions with the reviewer.

## Features

- Compare PDF, TXT, and Markdown files side by side.
- Extract selectable PDF text in the browser with PDF.js.
- See additions, removals, and changed lines with line numbers.
- Filter to changed lines or search within the comparison.
- Export a Markdown summary for review notes.
- Try the included fictional sample without choosing files.
- Responsive layout with keyboard-friendly controls.

## Privacy and limitations

- Files are read and processed in your browser; Revise has no upload service, account system, analytics, or backend.
- Scanned/image-only PDFs are not OCR'd. Text extraction may flatten tables, columns, or page layout.
- A text diff cannot determine whether a change is correct, safe, or compliant. Always review the original documents before making decisions.
- Maximum input file size: 30 MB per document.

## Run locally

Requires Node.js 22.12+.

```bash
npm install
npm run dev
```

Create a production build with `npm run build`; preview it with `npm run preview`.

## Tech

React, TypeScript, Vite, [PDF.js](https://github.com/mozilla/pdf.js), and [jsdiff](https://github.com/kpdecker/jsdiff). Fonts use system stacks; document parsing and comparison require no third-party service.

## License

MIT. See [LICENSE](LICENSE).
