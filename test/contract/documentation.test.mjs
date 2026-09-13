import test from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS, WHAT_TO_DO, decideWhatToDo } from '../../cli/options.mjs';
import { EXIT_CODE, USAGE_IN_BRIEF, USAGE_IN_FULL } from '../../cli/usage.mjs';
import { DEFAULT_LAYOUT, EARLIEST_HOUR_A_DAY_MAY_START_AT, LATEST_HOUR_A_DAY_MAY_START_AT } from '../../src/clock.mjs';
import { MEDIA_FILE_EXTENSIONS } from '../../src/extensions.mjs';
import { UNDATED_FOLDER_NAME } from '../../src/plan.mjs';
import { readProjectFile } from '../support/project.mjs';

const FACTS_TAKEN_FROM_THE_PROGRAM = [
  ['the hours a day may start at', `${EARLIEST_HOUR_A_DAY_MAY_START_AT} to ${LATEST_HOUR_A_DAY_MAY_START_AT}`],
  ['the default layout', DEFAULT_LAYOUT],
  ['the folder files with no date go to', `${UNDATED_FOLDER_NAME}/`],
];

const CLAIMS_EVERY_SURFACE_MUST_MAKE = [
  ['copying is the default', /copied,? never moved/i],
  ['nothing is written before the plan is complete', /before anything is written|before the whole plan|until the whole plan is settled/i],
  ['a folder must always be named', /no arguments/i],
  ['clashing names go to numbered subfolders', /numbered subfolder/i],
  ['the camera clock decides the day', /clock the camera was set to|camera's own clock/i],
];

const manualPageSource = readProjectFile('man/shotsort.1');
const manualPageAsPlainText = manualPageSource
  .replace(/\\f[IBRP]/g, '')
  .replace(/\\\(lq|\\\(rq/g, '"')
  .replace(/\\-/g, '-')
  .replace(/\\&/g, '')
  .replace(/^\.[A-Za-z]+ ?/gm, '')
  .replace(/"/g, ' ')
  .replace(/[ \t]+/g, ' ');
const readme = readProjectFile('README.md');

const sectionOf = (text, heading, nextHeading) => {
  const start = text.indexOf(heading);
  const end = text.indexOf(nextHeading, start + heading.length);
  return text.slice(start, end === -1 ? undefined : end);
};
const commandLinesIndentedIn = (usage) => usage.split('\n')
  .filter((line) => /^ {2,4}shotsort\b/.test(line)).map((line) => line.trim().split(/ {2,}/)[0]);
const commandLinesInTheCodeBlocksOf = (markdown) => [...markdown.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gm)]
  .flatMap(([, block]) => block.split('\n')).flatMap((line) => line.replace(/^\$ /, '').split(/ {2,}/))
  .filter((segment) => /^shotsort\b/.test(segment)).map((segment) => segment.split(/ \| | #/)[0].trim());
const statusesListedIn = (section, listing) => [...section.matchAll(listing)].map(([, code]) => Number(code));

const SURFACES = {
  '--help': {
    text: USAGE_IN_FULL,
    commandLines: commandLinesIndentedIn(USAGE_IN_FULL),
    exitStatuses: statusesListedIn(sectionOf(USAGE_IN_FULL, 'Exit status:', '\n\n'), /^ {2}(\d+) /gm),
  },
  'the man page': {
    text: manualPageAsPlainText,
    commandLines: sectionOf(manualPageSource, '.SH EXAMPLES', '\n.SH ').split('\n')
      .filter((line) => line.startsWith('.B shotsort')).map((line) => line.slice('.B '.length).replace(/\\-/g, '-')),
    exitStatuses: statusesListedIn(sectionOf(manualPageSource, '.SH EXIT STATUS', '\n.SH '), /^\.B (\d+)$/gm),
    listOfFileTypes: sectionOf(manualPageSource, '.SH FILE TYPES', '\n.SH '),
  },
  'the README': {
    text: readme,
    commandLines: commandLinesInTheCodeBlocksOf(readme),
    exitStatuses: statusesListedIn(sectionOf(readme, '### Exit status', '\n#'), /^\| `(\d+)` \|/gm),
    listOfFileTypes: sectionOf(readme, '## What it reads', '\n## '),
    longOptionsOfOtherProgramsItQuotes: ['--no-save', '--no'],
  },
};
const THE_BRIEF_USAGE = { text: USAGE_IN_BRIEF, commandLines: commandLinesIndentedIn(USAGE_IN_BRIEF) };

const everyOptionName = OPTIONS.flatMap((option) => [option.short, option.long]).filter((name) => name !== undefined);
const namedOnItsOwn = (name, text) => new RegExp(`(?<![-\\w])${name}(?![\\w-])`).test(text);
const longOptionsNamedIn = (text) => [...new Set(text.match(/(?<![-\w])--[a-z][a-z-]+/g) ?? [])];
const placeholdersGivenIn = (text) => [...text.replace(/`/g, '').matchAll(/(?<![-\w])(--[a-z][a-z-]+) ([A-Z]+)(?![a-z])/g)];
const argumentsOf = (commandLine) => commandLine.split(/\s+/).slice(1).map((argument) => argument.replace(/^'(.*)'$/, '$1'));

test('the options the documentation describes', async (context) => {
  await context.test('the program declares options for the documentation to be held to',
    () => assert.ok(everyOptionName.length > 0));

  for (const [surfaceName, { text }] of Object.entries(SURFACES)) {
    await context.test(`every option the program accepts appears in ${surfaceName}`,
      () => assert.deepEqual(everyOptionName.filter((name) => !namedOnItsOwn(name, text)), []));
    await context.test(`${surfaceName} gives each option's short form beside its long one`, () => assert.deepEqual(
      OPTIONS.filter((option) => option.short !== undefined
        && !new RegExp(`(?<![-\\w])${option.short}\\s?,\\s?${option.long}(?![\\w-])`).test(text.replace(/`/g, '')))
        .map((option) => `${option.short}, ${option.long}`),
      [],
    ));
    await context.test(`${surfaceName} names the value each option takes as the program does`, () => {
      const given = placeholdersGivenIn(text);
      const namedOtherwise = given.filter(([, long, placeholder]) => OPTIONS.some((option) => option.long === long && option.takes !== placeholder));
      const neverNamed = OPTIONS.filter((option) => option.takes !== undefined
        && !given.some(([, long, placeholder]) => long === option.long && placeholder === option.takes));
      assert.deepEqual({ namedOtherwise: namedOtherwise.map(([mention]) => mention), neverNamed: neverNamed.map((option) => option.long) },
        { namedOtherwise: [], neverNamed: [] });
    });
  }

  for (const [surfaceName, { text, longOptionsOfOtherProgramsItQuotes = [] }] of [...Object.entries(SURFACES), ['the brief usage', THE_BRIEF_USAGE]]) {
    await context.test(`${surfaceName} names no option the program does not accept`, () => assert.deepEqual(
      longOptionsNamedIn(text).filter((name) => !everyOptionName.includes(name) && !longOptionsOfOtherProgramsItQuotes.includes(name)),
      [],
    ));
  }
});

test('the facts the documentation states', async (context) => {
  for (const [surfaceName, { text, exitStatuses, listOfFileTypes }] of Object.entries(SURFACES)) {
    await context.test(`${surfaceName} states the values the program uses`, () => assert.deepEqual(
      FACTS_TAKEN_FROM_THE_PROGRAM.filter(([, value]) => !text.includes(value)).map(([fact, value]) => `${fact}: ${value}`),
      [],
    ));
    await context.test(`${surfaceName} explains exactly the exit statuses the program uses`,
      () => assert.deepEqual([...exitStatuses].sort(), Object.values(EXIT_CODE).sort()));
    if (listOfFileTypes === undefined) continue;
    await context.test(`${surfaceName} names every kind of file the program reads in its list of file types`, () => assert.deepEqual(
      [...MEDIA_FILE_EXTENSIONS].map((extension) => extension.slice(1))
        .filter((name) => !new RegExp(`(?<![A-Za-z0-9])${name}(?![A-Za-z0-9])`).test(listOfFileTypes)),
      [],
    ));
  }

  await context.test('the man page carries the version in the manifest', () => assert.equal(
    /^\.TH \S+ \d+ "[^"]*" "shotsort ([^"]+)"/m.exec(manualPageSource)?.[1],
    JSON.parse(readProjectFile('package.json')).version,
  ));
});

test('the command lines the documentation shows', async (context) => {
  for (const [surfaceName, { commandLines }] of [...Object.entries(SURFACES), ['the brief usage', THE_BRIEF_USAGE]]) {
    await context.test(`every command line ${surfaceName} shows is one the program accepts`, () => {
      assert.ok(commandLines.length > 0, `no command line found in ${surfaceName}`);
      assert.deepEqual(commandLines.filter((commandLine) => decideWhatToDo(argumentsOf(commandLine)).whatToDo === WHAT_TO_DO.refuse), []);
    });
  }
});

test('the claims every surface makes', async (context) => {
  for (const [surfaceName, { text }] of Object.entries(SURFACES)) {
    await context.test(`${surfaceName} states every claim the other surfaces state`, () => assert.deepEqual(
      CLAIMS_EVERY_SURFACE_MUST_MAKE.filter(([, phrasing]) => !phrasing.test(text)).map(([claim]) => claim),
      [],
    ));
  }
  await context.test('no surface still says files are moved by default', () => assert.deepEqual(
    Object.entries(SURFACES).filter(([, { text }]) => /files are moved within|files are moved into/i.test(text)).map(([surfaceName]) => surfaceName),
    [],
  ));
});

test('the brief usage', async (context) => {
  const shownInTheBrief = (command) => new RegExp(`^ +${command.replace(/[.\\/-]/g, '\\$&')} *(?: |$)`, 'm').test(USAGE_IN_BRIEF);
  await context.test('the brief shows previewing, copying and moving, both here and between two folders', () => assert.deepEqual(
    ['shotsort -n .', 'shotsort .', 'shotsort -m .',
      'shotsort -n -s ~/Import -d ~/Pictures/2026',
      'shotsort -s ~/Import -d ~/Pictures/2026',
      'shotsort -m ~/Import -d ~/Pictures/2026'].filter((command) => !shownInTheBrief(command)),
    [],
  ));
  await context.test('and it is brief: no manual, and it says where the manual is', () => assert.ok(
    !USAGE_IN_BRIEF.includes('Exit status:') && USAGE_IN_BRIEF.length < USAGE_IN_FULL.length / 2 && /--help/.test(USAGE_IN_BRIEF),
    `${USAGE_IN_BRIEF.length} against ${USAGE_IN_FULL.length}`,
  ));
  await context.test('every option the brief names is in the full text too', () => assert.deepEqual(
    longOptionsNamedIn(USAGE_IN_BRIEF).filter((name) => !longOptionsNamedIn(USAGE_IN_FULL).includes(name)),
    [],
  ));
});
