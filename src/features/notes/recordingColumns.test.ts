import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 20260919152000 replaced the table-level SELECT grant on public.recordings with a column
// list that deliberately omits `storage_path` (the private object key must not be readable
// by members). 20260919152300 re-validated that decision and kept it: restoring the table
// grant would re-open the exfil the column list exists to close, so the escape hatch is the
// new select=*-safe view public.recordings_client, not a wider grant on the base table.
//
// The unavoidable side effect on the BASE TABLE: any query that asks for all columns, or for
// storage_path by name, fails with an opaque
//   403 {"code":"42501","message":"permission denied for table recordings"}
// for every role including the owning coach, and the message names no column.
//
// PostgREST asks for all columns when supabase-js is given a bare `.select()` OR an explicit
// `.select('*')`. The first version of this guard only caught the bare form and only within
// 400 characters of `.from('recordings')`, so `.select('*')`, `.select("*")` and any longer
// chain reached production as a runtime 403. This version parses the first `.select(...)`
// after each `.from('recordings')` in the same statement and classifies its argument.

const ROOTS = ['src', 'app', 'supabase/functions'];
const EXTENSIONS = ['.ts', '.tsx'];
const REPO_ROOT = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

// The closing quote must sit straight after the table name, so `.from('recordings_client')`
// — the select=*-safe view — is correctly NOT matched. The leading group captures the
// receiver, because the column grant binds anon/authenticated only: an Edge Function's
// SERVICE-ROLE client holds the full table grant and legitimately reads storage_path
// (transcribe-recording must, to fetch the object).
const FROM_RECORDINGS = /(\w*)\s*\n?\s*\.from\(\s*['"`]recordings['"`]\s*\)/g;
const SELECT_CALL = /\.select\s*\(/;
const STAR_ARGUMENT = /^(['"`])\s*\*\s*\1$/;
const SERVICE_ROLE_RECEIVER = /^(service|admin)$|(Service|Admin)$/;

/** Text between the parens of a call whose `(` is at `open`, honouring nesting and quotes. */
function callArgument(source: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;

  for (let i = open; i < source.length; i += 1) {
    const char = source[i];

    if (quote !== null) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

export type RecordingsSelect = {
  receiver: string;
  argument: string;
  serviceRole: boolean;
  reason: string | null;
};

/**
 * Every `.select(...)` that reads the public.recordings BASE TABLE in `source`, with the
 * reason it would 403 (or null when it is safe).
 *
 * The search for the `.select(` is bounded by the end of the statement (`;`) rather than by
 * a character count, so a long chain is still covered and an unrelated later `.select()`
 * cannot be mistaken for this query's.
 *
 * A service-role receiver is reported with `serviceRole: true` and never carries a reason:
 * the column grant restricts anon/authenticated, and service_role holds the whole table.
 */
export function recordingsSelects(source: string): RecordingsSelect[] {
  const found: RecordingsSelect[] = [];
  FROM_RECORDINGS.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FROM_RECORDINGS.exec(source)) !== null) {
    const receiver = match[1] ?? '';
    const rest = source.slice(match.index + match[0].length);
    const statementEnd = rest.indexOf(';');
    const statement = statementEnd === -1 ? rest : rest.slice(0, statementEnd);

    const selectMatch = SELECT_CALL.exec(statement);
    // No `.select()` in this statement at all: an insert/update/delete that reads nothing.
    if (!selectMatch) continue;

    const open = selectMatch.index + selectMatch[0].length - 1;
    const raw = callArgument(statement, open);
    if (raw === null) continue;

    const argument = raw.trim();
    const serviceRole = SERVICE_ROLE_RECEIVER.test(receiver);

    let reason: string | null = null;
    if (serviceRole) {
      reason = null;
    } else if (argument.length === 0) {
      reason = 'bare .select() — PostgREST sends select=*, which is 403 on this table';
    } else if (STAR_ARGUMENT.test(argument)) {
      reason = ".select('*') — PostgREST sends select=*, which is 403 on this table";
    } else if (argument.includes('storage_path')) {
      reason = 'selects storage_path, which no client role is granted (403)';
    }

    found.push({ receiver, argument, serviceRole, reason });
  }

  return found;
}

describe('recordings column-level SELECT grant', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root))).filter(
    (file) => !file.endsWith('recordingColumns.test.ts'),
  );

  it('finds source files to scan (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('finds the real call sites, so the scan is not silently matching nothing', () => {
    const hits = files.reduce(
      (total, file) => total + recordingsSelects(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(hits).toBeGreaterThan(0);
  });

  it('never reads public.recordings in a shape the grant refuses with 403', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const hit of recordingsSelects(readFileSync(file, 'utf8'))) {
        if (hit.reason) offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${hit.reason}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The service-role exemption is the one way past the checks above, so the sites that
  // use it are pinned. A new one must be reviewed (does it really need storage_path, and
  // is the caller's entitlement checked separately?) rather than added silently.
  it('keeps the service-role exemption to the reviewed call sites', () => {
    const exempt = new Set<string>();
    for (const file of files) {
      for (const hit of recordingsSelects(readFileSync(file, 'utf8'))) {
        if (hit.serviceRole) exempt.add(file.slice(REPO_ROOT.length + 1));
      }
    }

    // transcribe-recording downloads the object, so it must read storage_path; it checks
    // the caller separately via the rpc can_manage_recording on a user-scoped client.
    expect([...exempt].sort()).toEqual(['supabase/functions/transcribe-recording/index.ts']);
  });
});

describe('recordingsSelects (the guard itself)', () => {
  const flag = (source: string) => recordingsSelects(source).map((hit) => hit.reason !== null);

  it('catches a bare .select()', () => {
    expect(flag("supabase.from('recordings').select();")).toEqual([true]);
    expect(flag("supabase.from('recordings').select(  );")).toEqual([true]);
  });

  it("catches .select('*') and .select(\"*\"), which the first version of this guard missed", () => {
    expect(flag("supabase.from('recordings').select('*');")).toEqual([true]);
    expect(flag('supabase.from("recordings").select("*");')).toEqual([true]);
    expect(flag("supabase.from('recordings').select(` * `);")).toEqual([true]);
  });

  it('catches an explicit storage_path, which is 403 for every client role', () => {
    expect(flag("supabase.from('recordings').select('id, storage_path');")).toEqual([true]);
  });

  it('catches a bare .select() further than 400 characters down the chain', () => {
    const long = `supabase.from('recordings')\n${'  // padding padding padding\n'.repeat(30)}.select();`;
    expect(long.length).toBeGreaterThan(400);
    expect(flag(long)).toEqual([true]);
  });

  it('accepts an explicit column list and a constant', () => {
    expect(flag("supabase.from('recordings').select('id, status');")).toEqual([false]);
    expect(flag("supabase.from('recordings').select(RECORDING_COLUMNS);")).toEqual([false]);
  });

  it('does not flag the select=*-safe view public.recordings_client', () => {
    expect(recordingsSelects("supabase.from('recordings_client').select('*');")).toEqual([]);
  });

  it('does not borrow a later, unrelated .select() from the next statement', () => {
    const source = "supabase.from('recordings').insert(row);\nsupabase.from('profiles').select();";
    expect(recordingsSelects(source)).toEqual([]);
  });

  it('handles nested parens in the select argument', () => {
    expect(flag("supabase.from('recordings').select(columns.join(', '));")).toEqual([false]);
  });

  it('exempts a service-role receiver, which holds the whole table grant', () => {
    expect(flag("service.from('recordings').select('id, storage_path');")).toEqual([false]);
    expect(flag("service.from('recordings').select('*');")).toEqual([false]);
    expect(recordingsSelects("service.from('recordings').select('*');")[0].serviceRole).toBe(true);
  });

  it('keeps the exemption narrow — a user-scoped receiver is still flagged', () => {
    expect(flag("caller.from('recordings').select('id, storage_path');")).toEqual([true]);
    expect(flag("supabase.from('recordings').select('*');")).toEqual([true]);
    expect(flag("client.from('recordings').select();")).toEqual([true]);
  });
});
