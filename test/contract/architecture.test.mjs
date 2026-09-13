import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { importsOf, projectFilesUnder, readProjectFile, sourceFiles, withoutCommentLines } from '../support/project.mjs';

const ENTRY_POINT = 'bin/shotsort.mjs';
const MODULES_WHOSE_JOB_IS_THE_DISK = ['bin/shotsort.mjs', 'src/apply.mjs', 'src/bytes.mjs', 'src/destination.mjs', 'src/scan.mjs'];
const WHAT_EACH_PART_MAY_IMPORT = [
  ['src/formats/', ['src/formats/', 'src/bytes.mjs', 'src/clock.mjs', 'src/dateSource.mjs']],
  ['src/', ['src/']],
  ['cli/', ['cli/', 'src/clock.mjs', 'src/dateSource.mjs', 'src/dating.mjs', 'src/plan.mjs']],
  ['bin/', ['cli/', 'src/']],
];
const NODE_MODULES_THAT_REACH_THE_DISK = ['fs', 'fs/promises'];
const NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD = ['child_process', 'cluster', 'worker_threads'];
const MODULES_THE_UNIT_SUITE_MAY_NOT_REACH = ['bin/shotsort.mjs', 'src/apply.mjs', 'src/destination.mjs', 'src/scan.mjs'];
const STRYKER_RUNS = ['stryker.config.json', 'stryker.disk.json'];

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
  const mayImport = (importer, imported) => partOf(importer)[1]
    .some((allowed) => (allowed.endsWith('/') ? imported.startsWith(allowed) : imported === allowed));

  await context.test('each module imports only from the parts of the program its own part may use', () => assert.deepEqual(
    sourceFiles().flatMap((file) => importsOf(file).modules
      .filter((imported) => !mayImport(file, imported)).map((imported) => `${file} imports ${imported}`)),
    [],
  ));
  await context.test('no module imports itself through a chain of others',
    () => assert.deepEqual(importCycles(sourceFiles()), []));
  await context.test('every module is reached from the entry point, so none is left behind unused', () => {
    const reached = whatEachFileReaches([ENTRY_POINT]);
    assert.deepEqual(sourceFiles().filter((file) => !reached.has(file)), []);
  });
});

test('the modules that must not touch the disk', async (context) => {
  await context.test('the disk is reached, in any spelling, only by the modules whose job is the disk', () => assert.deepEqual(
    sourceFiles().filter(importingAnyOf(NODE_MODULES_THAT_REACH_THE_DISK)).sort(),
    [...MODULES_WHOSE_JOB_IS_THE_DISK].sort(),
  ));
  await context.test('no module starts a process or a thread',
    () => assert.deepEqual(sourceFiles().filter(importingAnyOf(NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD)), []));
  await context.test('only the entry point reads the process it runs in', () => assert.deepEqual(
    sourceFiles().filter((file) => file !== ENTRY_POINT && /\bprocess\.[A-Za-z]/.test(withoutCommentLines(readProjectFile(file)))),
    [],
  ));

  const planSource = readProjectFile('src/plan.mjs');
  await context.test('planning asks the disk nothing except through the probe it was handed', () => assert.ok(
    /probe\.exists/.test(planSource) && /probe\.contentsMatch/.test(planSource) && !/existsSync/.test(planSource),
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
  await context.test('every module is mutated by exactly one of the two Stryker runs', () => {
    const mutatedBy = STRYKER_RUNS.map((run) => JSON.parse(readProjectFile(run)).mutate);
    assert.deepEqual(
      sourceFiles().map((file) => [file, mutatedBy.filter((patterns) => patterns.some((pattern) => matchesPattern(file, pattern))).length])
        .filter(([, runs]) => runs !== 1).map(([file, runs]) => `${file} is mutated by ${runs} runs`),
      [],
    );
  });
});

test('the unit suite', async (context) => {
  await context.test('touches neither the disk nor a process, directly or through what it imports from test/', () => {
    const unitTests = projectFilesUnder('test/unit').filter((file) => file.endsWith('.test.mjs'));
    const testSide = whatEachFileReaches(unitTests, (imported) => imported.startsWith('test/'));
    const reachingOut = [...testSide].flatMap((file) => [
      ...importsOf(file).outsideTheProject
        .filter((specifier) => [...NODE_MODULES_THAT_REACH_THE_DISK, ...NODE_MODULES_THAT_START_A_PROCESS_OR_A_THREAD, 'os']
          .includes(withoutNodePrefix(specifier))),
      ...importsOf(file).modules.filter((imported) => MODULES_THE_UNIT_SUITE_MAY_NOT_REACH.includes(imported)),
    ].map((reached) => `${file} imports ${reached}`));
    assert.deepEqual(reachingOut, []);
  });
});
