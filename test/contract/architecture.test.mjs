import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import {
  importsBelowTheTopOf, importsOf, projectFilesUnder, readProjectFile, sourceFiles, withoutCommentLines,
} from '../support/project.mjs';

const ENTRY_POINT = 'bin/shotsort.mjs';
const MODULES_WHOSE_JOB_IS_THE_DISK = ['bin/shotsort.mjs', 'src/apply.mjs', 'src/bytes.mjs', 'src/destination.mjs', 'src/scan.mjs'];
const THE_DISK_MODULE_THAT_ALSO_READS_BUFFERS = 'src/bytes.mjs';
const isADiskModule = (file) => MODULES_WHOSE_JOB_IS_THE_DISK.includes(file);
const WHAT_EACH_PART_MAY_IMPORT = [
  ['src/formats/', (imported) => imported.startsWith('src/formats/') || ['src/bytes.mjs', 'src/clock.mjs', 'src/dateSource.mjs'].includes(imported)],
  ['src/', (imported) => imported.startsWith('src/')],
  ['cli/', (imported) => imported.startsWith('cli/') || (imported.startsWith('src/') && !isADiskModule(imported))],
  ['bin/', (imported) => imported.startsWith('cli/') || imported.startsWith('src/')],
];
const NODE_MODULES_THAT_REACH_THE_DISK = ['fs', 'fs/promises'];
const NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD = ['child_process', 'cluster', 'worker_threads'];
const MODULES_THE_UNIT_SUITE_MAY_NOT_REACH = MODULES_WHOSE_JOB_IS_THE_DISK.filter((file) => file !== THE_DISK_MODULE_THAT_ALSO_READS_BUFFERS);
const STRYKER_RUNS = ['stryker.config.json', 'stryker.disk.json'];
const THE_MODULE_THAT_RUNS_THE_ENTRY_POINT = 'test/support/commandLine.mjs';

const withoutNodePrefix = (specifier) => specifier.replace(/^node:/, '');
const importingAnyOf = (nodeModules) => (file) =>
  importsOf(file).outsideTheProject.some((specifier) => nodeModules.includes(withoutNodePrefix(specifier)));
const matchesPattern = (file, pattern) => (pattern.includes('**')
  ? file.startsWith(pattern.slice(0, pattern.indexOf('**'))) && file.endsWith('.mjs')
  : file === pattern);

function whatEachFileReaches(startingFiles, followInto = () => true) {
  const reached = new Set(startingFiles);
  const queue = [...startingFiles];
  while (queue.length > 0) {
    for (const imported of importsOf(queue.shift()).modules) {
      if (reached.has(imported) || !followInto(imported)) continue;
      reached.add(imported);
      queue.push(imported);
    }
  }
  return reached;
}

function importCycles(files) {
  const cycles = [];
  const state = new Map();
  const visit = (file, chain) => {
    state.set(file, 'being visited');
    for (const imported of importsOf(file).modules) {
      if (state.get(imported) === 'being visited') cycles.push([...chain.slice(chain.indexOf(imported)), imported].join(' -> '));
      else if (!state.has(imported)) visit(imported, [...chain, imported]);
    }
    state.set(file, 'visited');
  };
  for (const file of files) if (!state.has(file)) visit(file, [file]);
  return cycles;
}

test('the parts of the program and what each may use', async (context) => {
  const partOf = (file) => WHAT_EACH_PART_MAY_IMPORT.find(([part]) => file.startsWith(part));
  const mayImport = (importer, imported) => partOf(importer)[1](imported);

  await context.test('each module imports only from the parts of the program its own part may use', () => assert.deepEqual(
    sourceFiles().flatMap((file) => importsOf(file).modules
      .filter((imported) => !mayImport(file, imported)).map((imported) => `${file} imports ${imported}`)),
    [],
  ));
  await context.test('every import is at the top of its module, where the rules above can read it, and none is dynamic',
    () => assert.deepEqual(sourceFiles().filter(importsBelowTheTopOf), []));
  await context.test('no module imports itself through a chain of others',
    () => assert.deepEqual(importCycles(sourceFiles()), []));
  await context.test('every module is reached from the entry point, so none is left behind unused', () => {
    const reached = whatEachFileReaches([ENTRY_POINT]);
    assert.deepEqual(sourceFiles().filter((file) => !reached.has(file)), []);
  });
});

test('the modules that must not touch the disk', async (context) => {
  await context.test('the disk is reached, in any spelling, only by the modules whose job is the disk', () => assert.deepEqual(
    sourceFiles().filter(importingAnyOf(NODE_MODULES_THAT_REACH_THE_DISK)).filter((file) => !MODULES_WHOSE_JOB_IS_THE_DISK.includes(file)),
    [],
  ));
  await context.test('no module starts a process or a thread',
    () => assert.deepEqual(sourceFiles().filter(importingAnyOf(NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD)), []));
  await context.test('only the entry point reads the process it runs in', () => assert.deepEqual(
    sourceFiles().filter((file) => file !== ENTRY_POINT && /\bprocess\.[A-Za-z]/.test(withoutCommentLines(readProjectFile(file)))),
    [],
  ));
});

test('the package', async (context) => {
  const manifest = JSON.parse(readProjectFile('package.json'));

  await context.test('nothing outside Node itself is imported, and the manifest names no dependency', () => {
    const fromOutsideNode = sourceFiles().flatMap((file) => importsOf(file).outsideTheProject
      .filter((specifier) => !builtinModules.includes(withoutNodePrefix(specifier))).map((specifier) => `${file} imports ${specifier}`));
    assert.deepEqual({ fromOutsideNode, dependencies: manifest.dependencies ?? {} }, { fromOutsideNode: [], dependencies: {} });
  });
  await context.test('the published package carries every part of the program', () => assert.deepEqual(
    [...new Set(sourceFiles().map((file) => file.split('/')[0]))].filter((topLevel) => !manifest.files.includes(topLevel)),
    [],
  ));
});

test('what each suite may reach', async (context) => {
  const WHAT_EACH_SUITE_MAY_NOT_REACH = [
    ['the unit suite', 'test/unit', 'touches neither the disk nor a process',
      [...NODE_MODULES_THAT_REACH_THE_DISK, ...NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD, 'os'], MODULES_THE_UNIT_SUITE_MAY_NOT_REACH],
    ['the disk suite', 'test/disk', 'starts no process',
      NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD, [ENTRY_POINT, 'test/support/commandLine.mjs']],
    ['the contract suite', 'test/contract', 'starts no process and makes no directory',
      NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD, ['test/support/commandLine.mjs', 'test/support/temporaryDirectories.mjs']],
  ];

  for (const [suiteName, directory, whatItMayNotDo, forbiddenNodeModules, forbiddenModules] of WHAT_EACH_SUITE_MAY_NOT_REACH) {
    await context.test(`${suiteName} ${whatItMayNotDo}, directly or through what it imports from test/`, () => {
      const suiteFiles = projectFilesUnder(directory).filter((file) => file.endsWith('.test.mjs'));
      const testSide = whatEachFileReaches(suiteFiles, (imported) => imported.startsWith('test/'));
      const reachingOut = [...testSide].flatMap((file) => [
        ...importsOf(file).outsideTheProject.filter((specifier) => forbiddenNodeModules.includes(withoutNodePrefix(specifier))),
        ...importsOf(file).modules.filter((imported) => forbiddenModules.includes(imported)),
      ].map((reached) => `${file} imports ${reached}`));
      assert.deepEqual(reachingOut, []);
    });
  }
});

test('the mutation runs', async (context) => {
  const runs = STRYKER_RUNS.map((configFile) => {
    const config = JSON.parse(readProjectFile(configFile));
    const words = config.commandRunner.command.split(/\s+/);
    const suites = words.slice(words.indexOf('test/runUntilTheFirstFailure.mjs') + 1);
    const testFiles = suites.flatMap((suiteOrFile) => (suiteOrFile.endsWith('.test.mjs')
      ? [`test/${suiteOrFile}`]
      : projectFilesUnder(`test/${suiteOrFile}`).filter((file) => file.endsWith('.test.mjs'))));
    const reachedByImports = whatEachFileReaches(testFiles);
    const runsTheEntryPoint = reachedByImports.has(THE_MODULE_THAT_RUNS_THE_ENTRY_POINT);
    const reached = new Set([...reachedByImports, ...(runsTheEntryPoint ? whatEachFileReaches([ENTRY_POINT]) : [])]);
    return { configFile, suites, reached, mutates: (file) => config.mutate.some((pattern) => matchesPattern(file, pattern)) };
  });

  await context.test('every module is mutated by exactly one of the two Stryker runs', () => assert.deepEqual(
    sourceFiles().map((file) => [file, runs.filter((run) => run.mutates(file)).length])
      .filter(([, count]) => count !== 1).map(([file, count]) => `${file} is mutated by ${count} runs`),
    [],
  ));
  await context.test('and the suites of that run reach it, so a mutant there has a test that could kill it', () => assert.deepEqual(
    runs.flatMap((run) => sourceFiles().filter((file) => run.mutates(file) && !run.reached.has(file))
      .map((file) => `${run.configFile} mutates ${file}, which no test in ${run.suites.join(', ')} reaches`)),
    [],
  ));
});
