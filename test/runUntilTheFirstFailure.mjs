import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';
import { dot } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(testDirectory, '..');
const FILES_THAT_TAKE_MOST_OF_THE_TIME = new Set(['unit/robustness.test.mjs']);
const THE_MODULE_THAT_RUNS_THE_ENTRY_POINT = path.join(testDirectory, 'support', 'commandLine.mjs');
const ENTRY_POINT = path.join(projectRoot, 'bin', 'shotsort.mjs');
const A_RELATIVE_IMPORT = /^(?:import|export)\b[^;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm;

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

// Stryker names the mutant it has switched on, and a mutant lives in a single module. Only a
// test file importing that module, however indirectly, can run the mutated code, so every
// other file is left out of the run. A test that runs the entry point reaches whatever the
// entry point imports; a mutant no module is found holding leaves every file in.
function modulesImportedBy(filePath) {
  const imported = [...fs.readFileSync(filePath, 'utf8').matchAll(A_RELATIVE_IMPORT)]
    .map(([, specifier]) => path.resolve(path.dirname(filePath), specifier));
  return filePath === THE_MODULE_THAT_RUNS_THE_ENTRY_POINT ? [...imported, ENTRY_POINT] : imported;
}

function reaches(testFile, module) {
  const reached = new Set([testFile]);
  for (const file of reached) {
    if (file === module) return true;
    for (const imported of modulesImportedBy(file)) reached.add(imported);
  }
  return false;
}

function theModuleHoldingTheMutant(mutantId) {
  const switchedOnByIt = `stryMutAct_9fa48("${mutantId}")`;
  return ['bin', 'cli', 'src']
    .flatMap((directory) => fs.readdirSync(path.join(projectRoot, directory), { recursive: true })
      .filter((fileName) => fileName.endsWith('.mjs')).map((fileName) => path.join(projectRoot, directory, fileName)))
    .find((file) => fs.readFileSync(file, 'utf8').includes(switchedOnByIt));
}

const suitesAndFiles = process.argv.slice(2);
if (suitesAndFiles.length === 0) stopBecause('name the suites to run, for example: node test/runUntilTheFirstFailure.mjs unit');

const everyTestFile = suitesAndFiles.flatMap(testFilesIn);
const activeMutant = process.env.__STRYKER_ACTIVE_MUTANT__;
const mutatedModule = activeMutant === undefined ? undefined : theModuleHoldingTheMutant(activeMutant);
const filesThatCanRunTheMutant = mutatedModule === undefined
  ? everyTestFile
  : everyTestFile.filter((testFile) => reaches(testFile, mutatedModule));

run({ files: filesThatCanRunTheMutant, isolation: 'none', concurrency: 1 })
  .on('test:fail', () => process.exit(1))
  .compose(dot)
  .pipe(process.stdout);
