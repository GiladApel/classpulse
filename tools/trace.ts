/**
 * Builds the traceability matrix (requirement → use cases → design → test cases → status) from the documents
 * and writes it into docs/04-srs.md between the trace markers.
 *
 *   npm run trace            regenerate the matrix
 *   npm run trace -- --check fail if the matrix is stale, a referenced test does not exist, or a Must requirement
 *                            has no test case (used in CI); writes a summary to $GITHUB_STEP_SUMMARY when set
 *
 * Sources: requirement rows in the SRS, "Covers:" lines in the use cases, the allocation table of the SDD and the
 * "Covers" line at the top of each component EDD, and the test-case tables of the STD, whose last column names
 * `path › test name` (checked to exist) or "Manual: …".
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
// Git on Windows may check files out with CRLF; compare and write with LF.
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const SRS = 'docs/04-srs.md';
const START = '<!-- trace:start -->';
const END = '<!-- trace:end -->';

type Status = 'Passed' | 'Manual' | 'Gap';
interface Requirement {
  id: string;
  priority: string;
  useCases: Set<string>;
  design: Set<string>;
  tests: Set<string>;
  automated: boolean;
  manual: boolean;
}

const ID = /\b(FR-[A-Z]+-\d{2}|NFR-\d{2})\b/g;

/** "FR-ATT-01 … FR-ATT-09" and plain lists → every id they name. */
function ids(text: string): string[] {
  const out = new Set<string>();
  const range = /(FR-[A-Z]+-|NFR-)(\d{2})\s*(?:…|\.\.\.)\s*\1(\d{2})/g;
  for (const m of text.matchAll(range)) {
    for (let n = Number(m[2]); n <= Number(m[3]); n++) out.add(`${m[1]}${String(n).padStart(2, '0')}`);
  }
  for (const m of text.replace(range, '').matchAll(ID)) out.add(m[1]);
  return [...out];
}

const cells = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());

function requirements(): Map<string, Requirement> {
  const reqs = new Map<string, Requirement>();
  // Only the specification itself: the generated matrix below the start marker has requirement ids too.
  for (const line of read(SRS).split(START)[0].split('\n')) {
    const c = cells(line);
    if (c.length < 3 || !/^(FR-[A-Z]+-\d{2}|NFR-\d{2})$/.test(c[0])) continue;
    // NFR rows have no priority column; every NFR is a Must.
    const priority = c[0].startsWith('NFR') ? 'M' : c[2];
    reqs.set(c[0], { id: c[0], priority, useCases: new Set(), design: new Set(), tests: new Set(), automated: false, manual: false });
  }
  return reqs;
}

function useCases(reqs: Map<string, Requirement>) {
  const text = read('docs/05-use-cases.md');
  for (const section of text.split(/^#### /m).slice(1)) {
    const uc = /^(UC-\d{2})/.exec(section)?.[1];
    const covers = /\*\*Covers:\*\*(.*)/.exec(section)?.[1];
    if (!uc || !covers) continue;
    for (const id of ids(covers)) reqs.get(id)?.useCases.add(uc);
  }
}

function design(reqs: Map<string, Requirement>) {
  for (const line of read('docs/06-sdd.md').split('\n')) {
    const c = cells(line);
    const section = /^§(\d+\.\d+)/.exec(c[0] ?? '')?.[1];
    const label = section ? `SDD §${section}` : c[0] === 'Whole system' ? 'SDD §7' : null;
    if (!label || c.length < 2) continue;
    for (const id of ids(c[1])) reqs.get(id)?.design.add(label);
  }
  for (const file of readdirSync(join(ROOT, 'docs/07-edd')).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const text = read(`docs/07-edd/${file}`);
    const name = /^# (EDD-\S+)/m.exec(text)?.[1];
    const covers = /(?:Covers|Serves[^.]*?)\s+((?:FR|NFR)-[^.]*)\./.exec(text.split('\n').slice(0, 8).join(' '))?.[1];
    if (!name || !covers) continue;
    for (const id of ids(covers)) reqs.get(id)?.design.add(name);
  }
}

function testCases(reqs: Map<string, Requirement>, problems: string[]) {
  for (const line of read('docs/08-stp-std.md').split('\n')) {
    const c = cells(line);
    if (c.length < 6 || !/^TC-\d{3}$/.test(c[0])) continue;
    const [tc, , verifies, , , test] = c;
    const manual = /^Manual:/.test(test);
    if (!manual) {
      for (const ref of test.split('<br>')) {
        const m = /^`([^`]+)`\s*›\s*(.+)$/.exec(ref.trim());
        if (!m) {
          problems.push(`${tc}: cannot read the test reference "${ref}"`);
          continue;
        }
        const [, path, name] = m;
        if (!existsSync(join(ROOT, path))) problems.push(`${tc}: ${path} does not exist`);
        else if (!read(path).includes(name.trim())) problems.push(`${tc}: no test named "${name.trim()}" in ${path}`);
      }
    }
    for (const id of ids(verifies)) {
      const r = reqs.get(id);
      if (!r) {
        problems.push(`${tc}: ${id} is not in the SRS`);
        continue;
      }
      r.tests.add(tc);
      if (manual) r.manual = true;
      else r.automated = true;
    }
  }
}

const status = (r: Requirement): Status => (r.automated ? 'Passed' : r.manual ? 'Manual' : 'Gap');
const list = (s: Set<string>) => (s.size ? [...s].sort().join(', ') : '—');

function matrix(reqs: Map<string, Requirement>): string {
  const rows = [...reqs.values()].map((r) => `| ${r.id} | ${r.priority} | ${list(r.useCases)} | ${list(r.design)} | ${list(r.tests)} | ${status(r)} |`);
  const counts = { Passed: 0, Manual: 0, Gap: 0 };
  for (const r of reqs.values()) counts[status(r)]++;
  return [
    `${reqs.size} requirements: ${counts.Passed} Passed, ${counts.Manual} Manual, ${counts.Gap} Gap.`,
    '',
    '| Requirement | Pri | Use cases | Design | Test cases | Status |',
    '|-------------|-----|-----------|--------|------------|--------|',
    ...rows,
  ].join('\n');
}

const reqs = requirements();
const problems: string[] = [];
useCases(reqs);
design(reqs);
testCases(reqs, problems);
for (const r of reqs.values()) if (r.priority === 'M' && status(r) === 'Gap') problems.push(`${r.id} is a Must requirement with no test case`);

const srs = read(SRS);
const i = srs.indexOf(START);
const j = srs.indexOf(END);
if (i < 0 || j < 0) throw new Error(`trace markers missing in ${SRS}`);
const updated = `${srs.slice(0, i + START.length)}\n${matrix(reqs)}\n${srs.slice(j)}`;
const check = process.argv.includes('--check');

if (check) {
  if (updated !== srs) problems.push(`the matrix in ${SRS} is out of date: run "npm run trace"`);
} else {
  writeFileSync(join(ROOT, SRS), updated);
}

const summary = [
  '### Traceability',
  matrix(reqs).split('\n')[0],
  problems.length ? `\n**Problems:**\n${problems.map((p) => `- ${p}`).join('\n')}` : '\nEvery referenced test exists; no Must requirement is a Gap.',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
console.log(summary);
if (problems.length) process.exit(1);
