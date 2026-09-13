import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { dot } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const FILES_THAT_TAKE_MOST_OF_THE_TIME = new Set(['robustness.test.mjs']);

const takesMostOfTheTime = (fileName) => Number(FILES_THAT_TAKE_MOST_OF_THE_TIME.has(fileName));

const testFilesIn = (suite) => fs.readdirSync(path.join(testDirectory, suite))
  .filter((fileName) => fileName.endsWith('.test.mjs'))
  .sort((first, second) => takesMostOfTheTime(first) - takesMostOfTheTime(second) || first.localeCompare(second))
  .map((fileName) => path.join(testDirectory, suite, fileName));

const files = process.argv.slice(2).flatMap(testFilesIn);
if (files.length === 0) throw new Error('name the suites to run, for example: node test/runUntilTheFirstFailure.mjs unit');

run({ files, isolation: 'none', concurrency: 1 })
  .on('test:fail', () => process.exit(1))
  .compose(dot)
  .pipe(process.stdout);
