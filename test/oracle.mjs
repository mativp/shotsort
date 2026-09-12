#!/usr/bin/env node
// Checking this tool's reading against exiftool's, which is the reference implementation
// for every format here.
//
// The point is not to depend on exiftool -- shotsort never runs it, and this file is the
// only place in the repository that knows it exists. The point is that a byte-level
// fixture is only worth as much as its realism: a parser and the fixture that exercises it
// can share the same misunderstanding of a format and agree with each other forever. Put
// the fixture to exiftool and that stops being possible, because exiftool was written from
// the real files.
//
// Nothing here runs when exiftool is not installed, so a machine without it still gets a
// full test suite; it gets one check fewer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { everyFixtureFormatIsBuiltFrom, THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS } from './fixtures.mjs';
import { readCameraClockFromFile } from '../src/formats/registry.mjs';
import { formatCameraClock } from '../src/clock.mjs';

// Every tag exiftool would call a shooting time, in the order this tool trusts them.
const WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME = [
  'DateTimeOriginal', 'CreationDate', 'ContentCreateDate', 'CreateDate',
  'DateCreated', 'CreationTime', 'MediaCreateDate', 'ModifyDate',
];

const EXIT_EVERYTHING_AGREED = 0;
const EXIT_SOMETHING_DISAGREED = 1;

// A fixture exiftool reads differently, and why that is the right outcome rather than a
// fault to fix. Anything not named here has to agree with exiftool exactly.
const WHERE_THE_TWO_ARE_MEANT_TO_PART = {
  'jpeg-behind-more-segments-than-are-walked.JPG':
    'the walk stops after a ceiling no real photo reaches; exiftool has no ceiling',
  'movie-whose-box-runs-to-the-end.MOV':
    'a movie box sized to the end of the file is read here and skipped by exiftool',
  'movie-with-an-apple-date-in-an-iso-metadata-box.MP4':
    'exiftool reads Apple keys only from a QuickTime metadata box; this reads either',
};
const exiftoolIsInstalled = () => spawnSync('exiftool', ['-ver'], { encoding: 'utf8' }).status === 0;

function askExiftool(filePaths) {
  const answer = spawnSync('exiftool', [
    '-json', '-ignoreMinorErrors', '-quiet', '-quiet',
    ...WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME.map((tag) => `-${tag}`),
    ...filePaths,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const printed = (answer.stdout ?? '').trim();
  return printed === '' ? [] : JSON.parse(printed);
}

// exiftool writes a date its own way -- colons between the numbers, sometimes a zone or a
// trailing Z -- so both sides are reduced to the same shape before they are compared.
const asAPlainDate = (written) => {
  if (written === undefined || written === null) return null;
  const parts = /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(written));
  return parts === null ? null : `${parts[1]}-${parts[2]}-${parts[3]} ${parts[4]}:${parts[5]}:${parts[6]}`;
};

function main() {
  if (!exiftoolIsInstalled()) {
    console.log('  skip  exiftool is not installed, so the fixtures were not checked against it\n');
    return EXIT_EVERYTHING_AGREED;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shotsort-oracle-'));
  const built = everyFixtureFormatIsBuiltFrom();
  for (const [name, bytes] of built) fs.writeFileSync(path.join(directory, name), bytes);

  const answers = askExiftool(built.map(([name]) => path.join(directory, name)));
  const answerFor = new Map(answers.map((answer) => [path.basename(answer.SourceFile), answer]));

  let disagreementCount = 0;
  for (const [name] of built) {
    const filePath = path.join(directory, name);
    const found = readCameraClockFromFile(filePath, fs.statSync(filePath).size);
    const ours = found === null ? null : formatCameraClock(found.clock);

    const answer = answerFor.get(name) ?? {};
    const theirs = WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME
      .map((tag) => asAPlainDate(answer[tag])).find((date) => date !== null) ?? null;

    const meantToPart = WHERE_THE_TWO_ARE_MEANT_TO_PART[name];
    const agreed = meantToPart === undefined
      ? ours === THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS && theirs === THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS
      : ours !== theirs;

    console.log(`${agreed ? '  ok  ' : '  FAIL'} ${name}${meantToPart === undefined ? '' : ` -- ${meantToPart}`}`);
    if (agreed) continue;
    disagreementCount++;
    console.log(`        this tool read ${ours ?? 'nothing'}, exiftool read ${theirs ?? 'nothing'}`);
  }

  fs.rmSync(directory, { recursive: true, force: true });
  console.log(disagreementCount === 0
    ? `\n  all ${built.length} fixtures read the way exiftool reads them\n`
    : `\n  ${disagreementCount} fixtures are not read the way exiftool reads them\n`);
  return disagreementCount === 0 ? EXIT_EVERYTHING_AGREED : EXIT_SOMETHING_DISAGREED;
}

process.exit(main());
