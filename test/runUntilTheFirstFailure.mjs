import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { dot } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const FILES_THAT_TAKE_MOST_OF_THE_TIME = new Set(['unit/robustness.test.mjs']);

const takesMostOfTheTime = (fileInASuite) => Number(FILES_THAT_TAKE_MOST_OF_THE_TIME.has(fileInASuite));

function stopBecause(problem) {
  console.error(`runUntilTheFirstFailure: ${problem}`);
  process.exit(1);
}

function testFilesIn(suiteOrFile) {
  if (!fs.existsSync(path.join(testDirectory, suiteOrFile))) stopBecause(`there is no suite or test file called ${suiteOrFile} under test/`);
  if (suiteOrFile.endsWith('.test.mjs')) return [path.join(testDirectory, suiteOrFile)];
  const suite = suiteOrFile;
  return fs.readdirSync(path.join(testDirectory, suite), { recursive: true })
    .filter((fileName) => fileName.endsWith('.test.mjs'))
    .map((fileName) => `${suite}/${fileName.split(path.sep).join('/')}`)
    .sort((first, second) => takesMostOfTheTime(first) - takesMostOfTheTime(second) || first.localeCompare(second))
    .map((fileInASuite) => path.join(testDirectory, fileInASuite));
}

const suitesAndFiles = process.argv.slice(2);
if (suitesAndFiles.length === 0) stopBecause('name the suites to run, for example: node test/runUntilTheFirstFailure.mjs unit');

run({ files: suitesAndFiles.flatMap(testFilesIn), isolation: 'none', concurrency: 1 })
  .on('test:fail', () => process.exit(1))
  .compose(dot)
  .pipe(process.stdout);
