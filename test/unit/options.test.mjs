import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraClockFrom, dayFolderFor } from '../../src/clock.mjs';
import { WHAT_TO_DO, decideWhatToDo } from '../../cli/options.mjs';

test('the command line is read without starting a process', async (context) => {
  await context.test('clustered short options are each applied', () => assert.ok(
    decideWhatToDo(['-nvm', '/card']).options.dryRun === true
    && decideWhatToDo(['-nvm', '/card']).options.verbose === true
    && decideWhatToDo(['-nvm', '/card']).options.moveInsteadOfCopying === true,
  ));
  await context.test('an option taking a value may only end a cluster', () => assert.equal(
    decideWhatToDo(['-dn', '/library', '/card']).problem,
    "option '-d' takes a value, so it has to be the last letter of '-dn'",
  ));
  await context.test('--source may be given more than once',
    () => assert.equal(decideWhatToDo(['-s', '/one', '-s', '/two']).options.inputPaths.join(), '/one,/two'));
  await context.test('a -- argument ends option parsing',
    () => assert.equal(decideWhatToDo(['--', '-not-an-option']).options.inputPaths.join(), '-not-an-option'));
  await context.test('an option with no value left to take is refused',
    () => assert.equal(decideWhatToDo(['--dest']).problem, "option '--dest' needs a value"));
  await context.test('--day-start outside the hours a day may start at is refused', () => assert.equal(
    decideWhatToDo(['--day-start', '24', '/card']).problem,
    '--day-start must be an hour from 0 to 23',
  ));
  await context.test('but every hour of the clock is one a day may start at', () => assert.ok(
    [0, 4, 12, 13, 23].every((hour) =>
      decideWhatToDo(['--day-start', String(hour), '/card']).whatToDo === WHAT_TO_DO.sort),
  ));
  await context.test('a day starting in the evening files the afternoon before it with the day before', () => assert.ok(
    dayFolderFor(cameraClockFrom(2026, 8, 28, 19, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-27'
    && dayFolderFor(cameraClockFrom(2026, 8, 28, 20, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-28',
  ));
  await context.test('--day-start that is not a whole number is refused',
    () => assert.notEqual(decideWhatToDo(['--day-start', 'noon', '/card']).problem, undefined));
  await context.test('naming no folder to sort is refused',
    () => assert.ok(decideWhatToDo(['-n']).problem.startsWith('name the folder to sort')));
  await context.test('and the refusal shows how, leading with the folder you are standing in', () => assert.ok(
    /^ {2}shotsort \. +the folder you are standing in$/m.test(decideWhatToDo(['-n']).problem)
    && /^ {2}shotsort ~\/Import +a folder named in full$/m.test(decideWhatToDo(['-n']).problem),
    String(decideWhatToDo(['-n']).problem),
  ));
  await context.test('an unrecognised short option is refused by name',
    () => assert.match(decideWhatToDo(['-Z']).problem, /unrecognised option '-Z'/));
  await context.test('an absolute --layout is refused as such',
    () => assert.match(decideWhatToDo(['--layout', '/etc/%F', '/card']).problem, /--layout must be a relative folder name/));
  await context.test('a --layout holding no date escape is refused as such',
    () => assert.match(decideWhatToDo(['--layout', 'photos', '/card']).problem, /--layout must be a relative folder name/));
  await context.test('the -0 that used to take a file list on standard input is now just an unknown option',
    () => assert.match(decideWhatToDo(['-0']).problem, /unrecognised option '-0'/));
  await context.test('--verbose together with --quiet is refused for contradicting, not for anything else',
    () => assert.equal(decideWhatToDo(['--verbose', '--quiet', '/card']).problem, '--verbose and --quiet contradict each other'));
  await context.test('no arguments at all asks for the usage in brief',
    () => assert.equal(decideWhatToDo([]).whatToDo, WHAT_TO_DO.printTheUsageInBrief));
  await context.test('--help asks for the usage in full, which is a different text', () => assert.ok(
    decideWhatToDo(['--help']).whatToDo === WHAT_TO_DO.printTheUsageInFull
    && WHAT_TO_DO.printTheUsageInFull !== WHAT_TO_DO.printTheUsageInBrief,
  ));
  await context.test('-h asks for the same full text as --help',
    () => assert.equal(decideWhatToDo(['-h']).whatToDo, WHAT_TO_DO.printTheUsageInFull));
  await context.test('-V asks for the version',
    () => assert.equal(decideWhatToDo(['-V']).whatToDo, WHAT_TO_DO.printVersion));
  await context.test('a well formed command line comes back as something to sort',
    () => assert.equal(decideWhatToDo(['/card']).whatToDo, WHAT_TO_DO.sort));
});
