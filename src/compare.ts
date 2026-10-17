import { diffArrays } from 'diff';

export type DiffKind = 'same' | 'added' | 'removed' | 'changed';

export type DiffRow = {
  id: string;
  kind: DiffKind;
  beforeNumber: number | null;
  afterNumber: number | null;
  beforeText: string | null;
  afterText: string | null;
};

function linesOf(value: string): string[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function compareText(beforeText: string, afterText: string): DiffRow[] {
  const before = linesOf(beforeText);
  const after = linesOf(afterText);
  const parts = diffArrays(before, after);
  const rows: DiffRow[] = [];
  let beforeNumber = 1;
  let afterNumber = 1;
  let serial = 0;
  let removed: string[] = [];
  let added: string[] = [];

  const push = (kind: DiffKind, left: string | null, right: string | null) => {
    rows.push({
      id: `line-${serial++}`,
      kind,
      beforeNumber: left === null ? null : beforeNumber++,
      afterNumber: right === null ? null : afterNumber++,
      beforeText: left,
      afterText: right,
    });
  };

  const flushChanges = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index += 1) {
      const left = removed[index] ?? null;
      const right = added[index] ?? null;
      push(left !== null && right !== null ? 'changed' : left !== null ? 'removed' : 'added', left, right);
    }
    removed = [];
    added = [];
  };

  for (const part of parts) {
    if (part.removed) {
      removed.push(...part.value);
    } else if (part.added) {
      added.push(...part.value);
    } else {
      flushChanges();
      for (const line of part.value) push('same', line, line);
    }
  }
  flushChanges();
  return rows;
}

export function summarizeDiff(rows: DiffRow[]) {
  return {
    added: rows.filter((row) => row.kind === 'added').length,
    removed: rows.filter((row) => row.kind === 'removed').length,
    changed: rows.filter((row) => row.kind === 'changed').length,
    unchanged: rows.filter((row) => row.kind === 'same').length,
  };
}
