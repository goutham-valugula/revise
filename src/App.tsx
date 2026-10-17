import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { compareText, summarizeDiff } from './compare';
import type { DiffRow } from './compare';
import { extractPdfText } from './pdf';

type Side = 'before' | 'after';
type DocumentText = { name: string; text: string; kind: 'PDF' | 'TEXT'; pages?: number };
type Progress = { side: Side; page: number; total: number } | null;

const sampleBefore = `Quality review template — fictional sample\n\nPurpose: Demonstrate document revision differences.\nScope: Internal process.\nOwner: Quality lead.\nReview interval: 12 months.\nRecords: Save a signed review record.`;
const sampleAfter = `Quality review template — fictional sample\n\nPurpose: Demonstrate document revision differences.\nScope: Internal process.\nOwner: Document owner.\nReview interval: 18 months.\nRecords: Save a signed review record.\nNext review date: Include the planned review date.`;

function Icon({ name, size = 18 }: { name: 'arrow' | 'upload' | 'file' | 'shield' | 'download' | 'spark' | 'close'; size?: number }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m13 5 7 7-7 7"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/></>,
    file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7M8 15h8M8 18h6"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    download: <><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Something went wrong while reading this file. Please try another document.';
}

function FileSlot({
  side, document, progress, disabled, onFile, onClear,
}: {
  side: Side;
  document: DocumentText | null;
  progress: Progress;
  disabled: boolean;
  onFile: (file: File, side: Side) => void;
  onClear: (side: Side) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const loading = progress?.side === side;
  const title = side === 'before' ? 'Earlier revision' : 'Later revision';

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file, side);
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file, side);
    event.target.value = '';
  };

  return (
    <div className={`file-slot ${side} ${dragging ? 'dragging' : ''} ${document ? 'has-file' : ''}`}>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={handleSelect} aria-label={`Choose ${title.toLowerCase()}`} />
      <div
        className="drop-area"
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="slot-heading">
          <span className="revision-mark">{side === 'before' ? '01' : '02'}</span>
          <div><p className="slot-kicker">{side === 'before' ? 'STARTING POINT' : 'NEW VERSION'}</p><h2>{title}</h2></div>
          {document && <button className="icon-button clear-file" onClick={() => onClear(side)} aria-label={`Remove ${document.name}`} title="Remove file"><Icon name="close" size={16} /></button>}
        </div>

        {loading ? (
          <div className="reading-state" aria-live="polite">
            <span className="spinner" />
            <div><strong>Reading pages</strong><span>{progress.page} of {progress.total}</span></div>
            <div className="progress-track"><span style={{ width: `${Math.round((progress.page / progress.total) * 100)}%` }} /></div>
          </div>
        ) : document ? (
          <div className="file-loaded">
            <div className="file-icon"><Icon name="file" size={21} /></div>
            <div className="file-meta"><strong title={document.name}>{document.name}</strong><span>{document.kind}{document.pages ? ` · ${document.pages} pages` : ''} · ready to compare</span></div>
            <button className="change-link" disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</button>
          </div>
        ) : (
          <button className="upload-prompt" disabled={disabled} onClick={() => inputRef.current?.click()}>
            <span className="upload-icon"><Icon name="upload" size={19} /></span>
            <span><strong>Drop a file or <u>browse</u></strong><small>PDF, TXT, or Markdown · up to 30 MB</small></span>
          </button>
        )}
      </div>
      <div className="slot-footnote">{side === 'before' ? 'The version you want to compare from' : 'The version you want to compare to'}</div>
    </div>
  );
}

function App() {
  const [before, setBefore] = useState<DocumentText | null>(null);
  const [after, setAfter] = useState<DocumentText | null>(null);
  const [rows, setRows] = useState<DiffRow[] | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [changesOnly, setChangesOnly] = useState(false);
  const working = progress !== null;

  const loadFile = async (file: File, side: Side) => {
    setError('');
    setRows(null);
    if (file.size > 30 * 1024 * 1024) {
      setError('That file is over 30 MB. Choose a smaller PDF or text file.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf' && extension !== 'txt' && extension !== 'md') {
      setError('Revise reads PDF, TXT, and Markdown files.');
      return;
    }

    setProgress({ side, page: 0, total: 1 });
    try {
      let next: DocumentText;
      if (extension === 'pdf') {
        const parsed = await extractPdfText(file, (page, total) => setProgress({ side, page, total }));
        next = { name: file.name, text: parsed.text, kind: 'PDF', pages: parsed.pages };
      } else {
        next = { name: file.name, text: await file.text(), kind: 'TEXT' };
      }
      if (side === 'before') setBefore(next);
      else setAfter(next);
    } catch (loadError) {
      setError(normalizeError(loadError));
    } finally {
      setProgress(null);
    }
  };

  const clearFile = (side: Side) => {
    if (side === 'before') setBefore(null);
    else setAfter(null);
    setRows(null);
    setError('');
  };

  const loadExample = () => {
    setBefore({ name: 'review-template-v1.txt', text: sampleBefore, kind: 'TEXT' });
    setAfter({ name: 'review-template-v2.txt', text: sampleAfter, kind: 'TEXT' });
    setRows(compareText(sampleBefore, sampleAfter));
    setChangesOnly(false);
    setQuery('');
    setError('');
  };

  const compare = () => {
    if (!before || !after) return;
    setRows(compareText(before.text, after.text));
    setChangesOnly(false);
    setQuery('');
    requestAnimationFrame(() => document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const downloadReport = () => {
    if (!rows || !before || !after) return;
    const summary = summarizeDiff(rows);
    const changed = rows.filter((row) => row.kind !== 'same').map((row) => {
      const beforeLine = row.beforeText === null ? '' : `- ${row.beforeText}`;
      const afterLine = row.afterText === null ? '' : `+ ${row.afterText}`;
      return [beforeLine, afterLine].filter(Boolean).join('\n');
    }).join('\n\n');
    const report = `# Revision comparison\n\n- Earlier: ${before.name}\n- Later: ${after.name}\n- New lines: ${summary.added}\n- Removed lines: ${summary.removed}\n- Changed lines: ${summary.changed}\n\n## Changes\n\n${changed || 'No differences found.'}\n\n---\nGenerated locally with Revise. Review the source documents before making decisions.`;
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown;charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'revision-comparison.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  const summary = rows ? summarizeDiff(rows) : null;
  const visibleRows = rows?.filter((row) => {
    if (changesOnly && row.kind === 'same') return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return `${row.beforeText ?? ''} ${row.afterText ?? ''}`.toLowerCase().includes(needle);
  }) ?? [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Revise home"><span className="brand-icon"><span>R</span></span><span>revise<span className="brand-dot">.</span></span></a>
        <div className="topbar-right"><span className="privacy-pill"><span className="status-dot" /> Local-first</span><a href="https://github.com/goutham-valugula/revise" target="_blank" rel="noreferrer">Open source <span aria-hidden="true">↗</span></a></div>
      </header>

      <main className="page" id="top">
        <section className="intro">
          <div className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> DOCUMENT REVISION REVIEW</p>
            <h1>Know what changed.<br /><em>Keep the review yours.</em></h1>
            <p className="intro-text">Compare two document versions line by line. Your files stay in this browser—no upload, no account, no automated verdict.</p>
          </div>
          <div className="hero-stamp" aria-hidden="true"><span className="stamp-ring"><Icon name="spark" size={25} /></span><span>Clear changes.<br />Human judgment.</span></div>
        </section>

        <section className="compare-card" aria-label="Choose documents to compare">
          <div className="compare-card-head">
            <div><span className="section-number">01</span><div><h2>Choose your revisions</h2><p>Start with the earlier version, then add the new one.</p></div></div>
            <button className="example-link" onClick={loadExample}><Icon name="spark" size={15} /> Try a sample</button>
          </div>
          <div className="file-grid">
            <FileSlot side="before" document={before} progress={progress} disabled={working} onFile={loadFile} onClear={clearFile} />
            <div className="swap-mark" aria-hidden="true"><Icon name="arrow" size={19} /></div>
            <FileSlot side="after" document={after} progress={progress} disabled={working} onFile={loadFile} onClear={clearFile} />
          </div>
          <div className="compare-actions">
            <div className="format-note"><Icon name="file" size={16} /><span>PDF, TXT, Markdown</span><i /> <span>Max 30 MB each</span></div>
            <button className="primary-button" onClick={compare} disabled={!before || !after || working}>
              Compare revisions <Icon name="arrow" size={17} />
            </button>
          </div>
          {error && <div role="alert" className="error-banner"><span>!</span>{error}</div>}
        </section>

        {rows && summary && (
          <section className="results" id="comparison" aria-label="Comparison results">
            <div className="results-heading">
              <div><p className="eyebrow"><span className="eyebrow-line" /> REVISION SUMMARY</p><h2>Here’s what moved.</h2><p className="results-files"><span>{before?.name}</span><Icon name="arrow" size={14} /><span>{after?.name}</span></p></div>
              <button className="outline-button" onClick={downloadReport}><Icon name="download" size={16} /> Export report</button>
            </div>
            <div className="summary-strip">
              <div className="summary-main"><strong>{summary.added + summary.removed + summary.changed}</strong><span>lines changed</span></div>
              <div className="summary-item added-stat"><span className="stat-symbol">+</span><strong>{summary.added}</strong><span>added</span></div>
              <div className="summary-item removed-stat"><span className="stat-symbol">−</span><strong>{summary.removed}</strong><span>removed</span></div>
              <div className="summary-item changed-stat"><span className="stat-symbol">↔</span><strong>{summary.changed}</strong><span>reworded</span></div>
              <div className="summary-unchanged"><span className="status-dot" /> {summary.unchanged} unchanged</div>
            </div>
            <div className="diff-toolbar">
              <div className="view-toggle" role="group" aria-label="Choose comparison rows">
                <button className={!changesOnly ? 'selected' : ''} onClick={() => setChangesOnly(false)}>All lines</button>
                <button className={changesOnly ? 'selected' : ''} onClick={() => setChangesOnly(true)}>Changes only</button>
              </div>
              <label className="search-box"><span className="search-glyph">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in changes" aria-label="Find in changes" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={13} /></button>}</label>
            </div>
            <div className="diff-table" role="table" aria-label="Line-by-line differences">
              <div className="diff-table-head" role="row"><span role="columnheader">EARLIER VERSION</span><span role="columnheader">LATER VERSION</span></div>
              {visibleRows.length ? visibleRows.map((row) => (
                <div className={`diff-row ${row.kind}`} key={row.id} role="row" aria-label={row.kind === 'same' ? 'Unchanged line' : `${row.kind} line`}>
                  <div className={`diff-cell ${row.beforeText === null ? 'empty-cell' : ''}`} role="cell"><span className="line-number">{row.beforeNumber ?? ''}</span>{row.beforeText !== null && <code>{row.beforeText || ' '}</code>}</div>
                  <div className={`diff-cell ${row.afterText === null ? 'empty-cell' : ''}`} role="cell"><span className="line-number">{row.afterNumber ?? ''}</span>{row.afterText !== null && <code>{row.afterText || ' '}</code>}</div>
                </div>
              )) : <div className="no-results">No lines match that search.</div>}
            </div>
            <p className="review-note"><span className="review-mark">i</span> Text extraction can lose page layout, tables, or handwriting. Check the original documents before acting on a change.</p>
          </section>
        )}

        {!rows && <section className="how-it-works">
          <div className="how-title"><span className="section-number">02</span><div><h2>Simple by design</h2><p>A clear diff, with your documents kept in your hands.</p></div></div>
          <div className="principles">
            <article><span className="principle-icon coral"><Icon name="file" size={20} /></span><div><h3>Read, don’t judge</h3><p>Revise shows text-level differences. It never claims a document is correct or compliant.</p></div></article>
            <article><span className="principle-icon mint"><Icon name="shield" size={20} /></span><div><h3>Stay on your device</h3><p>Documents are processed locally in your browser and aren’t sent to a server.</p></div></article>
            <article><span className="principle-icon lavender"><Icon name="spark" size={20} /></span><div><h3>Keep the human in the loop</h3><p>Use the diff to focus your review, then make decisions from the source documents.</p></div></article>
          </div>
        </section>}
      </main>

      <footer className="footer"><a className="footer-brand" href="#top">revise<span>.</span></a><span>Made for careful reviews, not automatic answers.</span><a href="https://github.com/goutham-valugula/revise" target="_blank" rel="noreferrer">Source code <span aria-hidden="true">↗</span></a></footer>
    </div>
  );
}

export default App;
