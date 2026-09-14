// Reads an lcov report on standard input and writes one shields.io endpoint file per
// figure the README shows, into the folder named on the command line.
import fs from 'node:fs';
import path from 'node:path';

const FLOOR_THE_COVERAGE_CHECK_ENFORCES = 90;
const FIGURES = [
  { label: 'lines', found: 'LF', hit: 'LH' },
  { label: 'branches', found: 'BRF', hit: 'BRH' },
  { label: 'functions', found: 'FNF', hit: 'FNH' },
];

const [destination] = process.argv.slice(2);
if (destination === undefined) {
  console.error('coverageBadges: name the folder to write the badge files into');
  process.exit(1);
}

const totalOf = (report, field) => [...report.matchAll(new RegExp(`^${field}:(\\d+)$`, 'gm'))]
  .reduce((total, [, count]) => total + Number(count), 0);

// Rounded down, so a figure a hair under 100 is never shown as 100.
const asPercent = (hit, found) => (found === 0 ? 100 : Math.floor((hit / found) * 1000) / 10);

const report = fs.readFileSync(0, 'utf8');
fs.mkdirSync(destination, { recursive: true });
for (const { label, found, hit } of FIGURES) {
  const percent = asPercent(totalOf(report, hit), totalOf(report, found));
  fs.writeFileSync(path.join(destination, `${label}.json`), `${JSON.stringify({
    schemaVersion: 1,
    label,
    message: `${percent}%`,
    color: percent >= FLOOR_THE_COVERAGE_CHECK_ENFORCES ? 'brightgreen' : 'red',
  })}\n`);
  console.log(`${label} ${percent}%`);
}
