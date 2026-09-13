import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { jpegFile, jpegFilePaddedTo } from '../fixtures/jpeg.mjs';
import { EXIT_CODE } from '../../cli/usage.mjs';
import { COMMAND, runCommand } from '../support/commandLine.mjs';
import { THE_PLATFORM_PIPES_OUTPUT_THE_UNIX_WAY } from '../support/platform.mjs';
import { aPathNotYetTaken, aTemporaryDirectory, freshCardDump } from '../support/temporaryDirectories.mjs';
import { writeFixtureFile } from '../support/files.mjs';

test('the summary the user reads', async (context) => {
  const dump = aTemporaryDirectory('summary');
  const shotAt = (day, hour) => `2026:01:${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00:00`;

  writeFixtureFile(path.join(dump, 'a', 'BYTES.JPG'), jpegFilePaddedTo(shotAt(1, 10), 512));
  writeFixtureFile(path.join(dump, 'a', 'EDGE.JPG'), jpegFilePaddedTo(shotAt(2, 10), 1023));
  writeFixtureFile(path.join(dump, 'a', 'ONEKB.JPG'), jpegFilePaddedTo(shotAt(3, 10), 1024));
  writeFixtureFile(path.join(dump, 'a', 'HALF.JPG'), jpegFilePaddedTo(shotAt(4, 10), 1536));
  writeFixtureFile(path.join(dump, 'a', 'PAIR1.JPG'), jpegFilePaddedTo(shotAt(5, 10), 1024));
  writeFixtureFile(path.join(dump, 'a', 'PAIR2.JPG'), jpegFilePaddedTo(shotAt(5, 11), 1024));
  writeFixtureFile(path.join(dump, 'a', 'NODATE.HSP'), Buffer.alloc(2048, 3), new Date('2026-01-06T10:00:00'));

  const rows = runCommand(['-n', dump]).standardOutput.split('\n').filter((line) => /^\d{4}-/.test(line));
  const rowFor = (day) => rows.find((line) => line.startsWith(day)) ?? `(no row for ${day})`;

  await context.test('a size under a kilobyte is shown as whole bytes',
    () => assert.match(rowFor('2026-01-01'), /\s512 B$/));
  await context.test('one byte below a kilobyte is still shown as bytes',
    () => assert.match(rowFor('2026-01-02'), /\s1023 B$/));
  await context.test('exactly a kilobyte steps up to KB with one decimal',
    () => assert.match(rowFor('2026-01-03'), /\s1\.0 KB$/));
  await context.test('a size between units keeps its one decimal',
    () => assert.match(rowFor('2026-01-04'), /\s1\.5 KB$/));
  await context.test('a day holding one file says file, not files',
    () => assert.match(rowFor('2026-01-01'), / {4}1 file {2}/));
  await context.test('a day holding two says files, and their sizes are added', () => assert.ok(
    / {4}2 files/.test(rowFor('2026-01-05')) && /\s2\.0 KB$/.test(rowFor('2026-01-05')),
    rowFor('2026-01-05'),
  ));
  await context.test('a day dated only by the filesystem is marked with a tilde',
    () => assert.match(rowFor('2026-01-06'), /^2026-01-06 ~ /));
  await context.test('a day whose files carry their own dates is not marked',
    () => assert.match(rowFor('2026-01-01'), /^2026-01-01 {2}/));
  await context.test('the rows run oldest first',
    () => assert.deepEqual(rows.map((line) => line.slice(0, 10)), [...rows.map((line) => line.slice(0, 10))].sort()));
  await context.test('every row is aligned to the same width',
    () => assert.equal(new Set(rows.map((line) => line.indexOf(' file'))).size, 1));
});

test('the verbs in the closing line', async (context) => {
  const forRun = (commandArguments) => {
    const dump = freshCardDump('verbs');
    return runCommand([...commandArguments, dump]).standardOutput.trim().split('\n').pop();
  };
  await context.test('copying is what a plain run reports', () => assert.match(forRun([]), /^11 copied$/));
  await context.test('moving is what --move reports', () => assert.match(forRun(['-m']), /^11 moved,/));
  await context.test('a dry run says it would copy, not that it did',
    () => assert.match(forRun(['-n']), /^11 to copy {2}\(dry run\)$/));
  await context.test('a dry run with --move says it would move',
    () => assert.match(forRun(['-n', '-m']), /^11 to move {2}\(dry run\)$/));
});

test('the quiet and verbose switches', async (context) => {
  const quietly = freshCardDump('quiet');
  const quietRun = runCommand(['-q', quietly]);
  await context.test('--quiet prints nothing at all on a run that succeeds', () => assert.ok(
    quietRun.standardOutput === '' && quietRun.exitCode === EXIT_CODE.everythingPlaced,
    JSON.stringify(quietRun.standardOutput),
  ));
  await context.test('and still does the sorting',
    () => assert.ok(fs.existsSync(path.join(quietly, '2026-08-27', 'P1000002.JPG'))));

  const clustered = freshCardDump('clustered');
  const clusteredRun = runCommand(['-nq', clustered]);
  await context.test('clustered short options combine, so -nq is -n and -q together', () => assert.ok(
    clusteredRun.standardOutput === ''
    && clusteredRun.exitCode === EXIT_CODE.everythingPlaced
    && fs.existsSync(path.join(clustered, 'DCIM', '100_PANA', 'P1000001.JPG')),
    JSON.stringify(clusteredRun.standardOutput),
  ));

  const longForm = freshCardDump('long-form-dry-run');
  const longFormRun = runCommand(['--dry-run', longForm]);
  await context.test('--dry-run spelled out does the same as -n', () => assert.ok(
    /\(dry run\)$/m.test(longFormRun.standardOutput)
    && fs.existsSync(path.join(longForm, 'DCIM', '100_PANA', 'P1000001.JPG')),
    longFormRun.standardOutput,
  ));

  const valueLast = freshCardDump('value-last');
  const valueLastDestination = aPathNotYetTaken('value-last-library');
  const valueLastRun = runCommand(['-nd', valueLastDestination, valueLast]);
  await context.test('a value-taking short option may end a cluster, so -nd DIR is -n -d DIR', () => assert.ok(
    /\(dry run\)$/m.test(valueLastRun.standardOutput) && valueLastRun.exitCode === EXIT_CODE.everythingPlaced,
    valueLastRun.standardOutput + valueLastRun.standardError,
  ));

  const clusteredVerbose = freshCardDump('clustered-verbose');
  const verboseRun = runCommand(['-vm', clusteredVerbose]);
  await context.test('and -vm is -v and -m together', () => assert.ok(
    verboseRun.standardOutput.split('\n').filter((line) => line.includes(' -> ')).length === 11
    && !fs.existsSync(path.join(clusteredVerbose, 'DCIM')),
    verboseRun.standardOutput.slice(0, 200),
  ));
});

test('the counts in the notes', async (context) => {
  const dump = freshCardDump('counts');
  const run = runCommand(['-n', dump]);
  await context.test('the tilde note counts the files dated from the filesystem, and there are two',
    () => assert.match(run.standardError, /shotsort: ~ marks days holding 2 file\(s\)/));

  const clashing = aTemporaryDirectory('clash-count');
  const shot = '2026:04:08 14:00:00';
  for (const [folder, size] of [['100_PANA', 800], ['101_PANA', 900], ['102_PANA', 1000]]) {
    writeFixtureFile(path.join(clashing, 'DCIM', folder, 'DUP.JPG'), jpegFilePaddedTo(shot, size));
    writeFixtureFile(path.join(clashing, 'DCIM', folder, 'OTHER.JPG'), jpegFilePaddedTo(shot, size + 1));
  }
  const clashRun = runCommand(['-n', clashing]);
  await context.test('the subfolder note counts the names that clashed, and there are two',
    () => assert.match(clashRun.standardError, /shotsort: 2 file names are used by more than one photo/));
});

test('the progress line never reaches anything but a terminal', async (context) => {
  const dump = freshCardDump('progress-off-a-terminal');
  const copied = runCommand([dump]);
  const verboseMove = runCommand(['-v', '-m', freshCardDump('progress-off-a-terminal-verbose')]);
  const drawingCharacters = ['\r', '\x1b'];
  const drawnInto = (printed) => drawingCharacters.some((character) => printed.includes(character));

  await context.test('a copy whose output is captured carries no progress line, neither drawn nor taken down', () => assert.ok(
    copied.exitCode === EXIT_CODE.everythingPlaced && !drawnInto(copied.standardError) && !drawnInto(copied.standardOutput),
    JSON.stringify(copied.standardError),
  ));
  await context.test('and nor does a --verbose move, the one run that prints above the line', () => assert.ok(
    verboseMove.exitCode === EXIT_CODE.everythingPlaced
    && !drawnInto(verboseMove.standardError) && !drawnInto(verboseMove.standardOutput),
    JSON.stringify(verboseMove.standardError),
  ));
});

test('a card with nothing on it and a machine reading the answer', async (context) => {
  const empty = aTemporaryDirectory('empty-card');
  const asJson = runCommand(['--json', empty]);

  await context.test('an empty card still answers in json when json was asked for',
    () => assert.equal(asJson.exitCode, EXIT_CODE.somethingFailedOrNothingFound));
  const said = JSON.parse(asJson.standardOutput);
  await context.test('and the answer says plainly that it found nothing',
    () => assert.ok(said.summary.found === 0 && said.actions.length === 0, asJson.standardOutput));
  await context.test('rather than printing a sentence a script would have to read',
    () => assert.equal(asJson.standardError, ''));
});

// A pipe holds a limited amount before a write to it blocks, so this has to be a listing
// too long to fit in one: a shorter one lands in the pipe whole and the reader going away
// is never noticed.
const FILES_ENOUGH_TO_FILL_A_PIPE = 700;

test('output cut off by something reading it', {
  skip: !THE_PLATFORM_PIPES_OUTPUT_THE_UNIX_WAY && 'this platform does not pipe output the Unix way',
}, async (context) => {
  const throughAPipe = spawnSync('sh', ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(COMMAND)} --help | head -3`], { encoding: 'utf8' });
  await context.test('closing the pipe early is not an error, as with any unix tool', () => assert.ok(
    throughAPipe.status === 0 && throughAPipe.stderr === '',
    `status ${throughAPipe.status}: ${throughAPipe.stderr}`,
  ));

  // `shotsort --json card | head -1` closes the pipe the moment it has its line. Writing to
  // a pipe nobody is reading is an error, and one the run must take as its cue to stop
  // rather than as a fault to report.
  const dump = aTemporaryDirectory('cut-off');
  for (let fileNumber = 0; fileNumber < FILES_ENOUGH_TO_FILL_A_PIPE; fileNumber++) {
    writeFixtureFile(path.join(dump, `P${String(fileNumber).padStart(7, '0')}.JPG`),
      jpegFile('2026:08:27 09:07:01'));
  }

  // pipefail so the answer is the program's own rather than the exit status of whatever
  // was reading it.
  const pipeline = spawnSync('bash', ['-c',
    `set -o pipefail; ${JSON.stringify(process.execPath)} ${JSON.stringify(COMMAND)} --json -n ${JSON.stringify(dump)} | head -1`],
  { encoding: 'utf8' });

  await context.test('output cut off by something reading only the start of it is not an error',
    () => assert.equal(pipeline.status, EXIT_CODE.everythingPlaced));
  await context.test('and nothing is said about the broken pipe',
    () => assert.doesNotMatch(pipeline.stderr ?? '', /EPIPE/));
});
