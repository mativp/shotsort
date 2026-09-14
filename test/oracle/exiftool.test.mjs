import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { everyFixtureFormatIsBuiltFrom } from '../fixtures/catalogue.mjs';
import { readCameraClockFromFile } from '../../src/formats/registry.mjs';
import { formatCameraClock } from '../../src/clock.mjs';
import { aTemporaryDirectory } from '../support/temporaryDirectories.mjs';

const WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME_IN_THE_ORDER_THIS_TOOL_TRUSTS_THEM = [
  'DateTimeOriginal', 'CreationDate', 'ContentCreateDate', 'CreateDate',
  'DateCreated', 'CreationTime', 'MediaCreateDate', 'ModifyDate',
];

const exiftoolIsInstalled = spawnSync('exiftool', ['-ver'], { encoding: 'utf8' }).status === 0;

function askExiftool(filePaths) {
  const answer = spawnSync('exiftool', [
    '-json', '-ignoreMinorErrors', '-quiet', '-quiet',
    ...WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME_IN_THE_ORDER_THIS_TOOL_TRUSTS_THEM.map((tag) => `-${tag}`),
    ...filePaths,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const printed = (answer.stdout ?? '').trim();
  return printed === '' ? [] : JSON.parse(printed);
}

const asAPlainDate = (written) => {
  if (written === undefined || written === null) return null;
  const parts = /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(written));
  return parts === null ? null : `${parts[1]}-${parts[2]}-${parts[3]} ${parts[4]}:${parts[5]}:${parts[6]}`;
};

test('every fixture is read the way exiftool reads it', {
  skip: !exiftoolIsInstalled && 'exiftool is not installed',
}, async (context) => {
  const directory = aTemporaryDirectory('oracle');
  const catalogue = everyFixtureFormatIsBuiltFrom();
  for (const { fileName, bytes } of catalogue) fs.writeFileSync(path.join(directory, fileName), bytes);

  const answers = askExiftool(catalogue.map(({ fileName }) => path.join(directory, fileName)));
  const answerFor = new Map(answers.map((answer) => [path.basename(answer.SourceFile), answer]));

  for (const { fileName, readAs, exiftoolReadsItDifferentlyBecause } of catalogue) {
    const filePath = path.join(directory, fileName);
    const found = readCameraClockFromFile(filePath, fs.statSync(filePath).size);
    const ours = found === null ? null : formatCameraClock(found.clock);
    const answer = answerFor.get(fileName) ?? {};
    const theirs = WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME_IN_THE_ORDER_THIS_TOOL_TRUSTS_THEM
      .map((tag) => asAPlainDate(answer[tag])).find((date) => date !== null) ?? null;

    const because = exiftoolReadsItDifferentlyBecause === undefined ? '' : ` -- ${exiftoolReadsItDifferentlyBecause}`;
    await context.test(`${fileName}${because}`, () => {
      if (exiftoolReadsItDifferentlyBecause === undefined) assert.deepEqual({ ours, theirs }, { ours: readAs, theirs: readAs });
      else assert.notEqual(ours, theirs);
    });
  }
});
