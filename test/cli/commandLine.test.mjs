import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { USAGE_IN_BRIEF, USAGE_IN_FULL } from '../../cli/usage.mjs';
import {
  COMMAND, EXIT_BAD_COMMAND_LINE, EXIT_EVERYTHING_PLACED, EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND,
  freshCardDump, runCommand,
} from '../support/commandLine.mjs';
import { projectRoot } from '../support/project.mjs';
import { aTemporaryDirectory } from '../support/temporaryDirectories.mjs';

test('the command line itself', async (context) => {
  const emptyFolder = aTemporaryDirectory('empty');

  const refusedFor = (commandArguments) => {
    const attempt = runCommand(commandArguments);
    return attempt.exitCode === EXIT_BAD_COMMAND_LINE ? attempt.standardError : `exited ${attempt.exitCode}`;
  };

  await context.test('finding nothing exits 1, as grep does',
    () => assert.equal(runCommand([emptyFolder]).exitCode, EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND));
  await context.test('an unrecognised long option is refused by name',
    () => assert.match(refusedFor(['--nope']), /unrecognised option '--nope'/));

  const versionFromManifest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
  for (const flag of ['-V', '--version']) {
    const printed = runCommand([flag]);
    await context.test(`${flag} prints the version from the manifest and exits 0`, () => assert.ok(
      printed.standardOutput.trim() === versionFromManifest && printed.exitCode === EXIT_EVERYTHING_PLACED,
      `${printed.standardOutput.trim()} vs ${versionFromManifest}`,
    ));
  }
  await context.test('-h prints the same usage as --help', () => assert.ok(
    runCommand(['-h']).standardOutput === runCommand(['--help']).standardOutput
    && runCommand(['-h']).exitCode === EXIT_EVERYTHING_PLACED,
  ));

  // Printed and then exited on the spot, the tail of a text this long never leaves the
  // buffer standard output holds while it is a pipe: the first 8192 bytes arrive and the
  // rest is dropped, so anything reading the output rather than showing it -- this suite
  // included -- was reading a text cut off mid-word. Both are checked whole, against the
  // strings themselves, since a check reading the same truncated output cannot see it.
  for (const [flags, whole] of [[[], USAGE_IN_BRIEF], [['--help'], USAGE_IN_FULL]]) {
    const printed = runCommand(flags).standardOutput;
    await context.test(`${flags.length === 0 ? 'the brief' : 'the full text'} arrives whole, not cut off where the buffer ends`,
      () => assert.equal(printed, `${whole}\n`));
  }

  const afterTheTerminator = freshCardDump('after-terminator');
  const terminated = runCommand(['-n', '--', afterTheTerminator]);
  await context.test('a -- argument ends option parsing and the rest is a folder', () => assert.ok(
    terminated.exitCode === EXIT_EVERYTHING_PLACED && /11 to copy/.test(terminated.standardOutput),
    terminated.standardOutput + terminated.standardError,
  ));

  const throughAPipe = spawnSync('sh', ['-c', `node ${JSON.stringify(COMMAND)} --help | head -3`], { encoding: 'utf8' });
  await context.test('closing the pipe early is not an error, as with any unix tool', () => assert.ok(
    throughAPipe.status === 0 && throughAPipe.stderr === '',
    `status ${throughAPipe.status}: ${throughAPipe.stderr}`,
  ));

  const cardDumpItShouldNotTouch = freshCardDump('never-touched');
  const bareInvocation = runCommand([], { cwd: cardDumpItShouldNotTouch });
  const askedForHelp = runCommand(['--help']);

  await context.test('running it with no arguments prints the brief on standard output', () => assert.ok(
    bareInvocation.standardOutput.startsWith('Usage: shotsort') && bareInvocation.standardError === '',
    bareInvocation.standardOutput.slice(0, 120) + bareInvocation.standardError,
  ));
  await context.test('running it with no arguments exits 2, having been asked to do nothing',
    () => assert.equal(bareInvocation.exitCode, EXIT_BAD_COMMAND_LINE));
  await context.test('--help prints the whole manual instead, and exits 0, having been asked for it', () => assert.ok(
    askedForHelp.standardOutput !== bareInvocation.standardOutput
    && (askedForHelp.standardOutput.match(/^ {2,6}-/gm) ?? []).length >= 9
    && askedForHelp.standardOutput.includes('Examples:')
    && askedForHelp.standardOutput.includes('Exit status:')
    && askedForHelp.exitCode === EXIT_EVERYTHING_PLACED,
  ));
  await context.test('and sorts nothing in the folder it was run from',
    () => assert.ok(fs.existsSync(path.join(cardDumpItShouldNotTouch, 'DCIM/100_PANA/P1000001.JPG'))));
  await context.test('options without a folder to sort are refused',
    () => assert.equal(runCommand(['-n'], { cwd: cardDumpItShouldNotTouch }).exitCode, EXIT_BAD_COMMAND_LINE));
  await context.test('the current folder still sorts when it is named',
    () => assert.equal(runCommand(['-n', '.'], { cwd: cardDumpItShouldNotTouch }).exitCode, EXIT_EVERYTHING_PLACED));

  const missingFolder = runCommand(['/nope/nowhere']);
  await context.test('a folder that does not exist is reported rather than thrown', () => assert.ok(
    missingFolder.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND && /ENOENT/.test(missingFolder.standardError),
    String(missingFolder.standardError),
  ));
});

test('installed without its manifest', async (context) => {
  // npm always installs the manifest; a copy made by hand may not. Asked its version then,
  // it has nowhere to read one from and has to say so rather than fall over.
  const installation = aTemporaryDirectory('no-manifest');
  for (const directory of ['bin', 'cli', 'src']) {
    fs.cpSync(path.join(projectRoot, directory), path.join(installation, directory), { recursive: true });
  }

  const asked = spawnSync('node', [path.join(installation, 'bin', 'shotsort.mjs'), '--version'], { encoding: 'utf8' });
  await context.test('a copy installed without its manifest says its version is unknown rather than failing', () => assert.ok(
    asked.status === EXIT_EVERYTHING_PLACED && asked.stdout.trim() === 'unknown',
    `${asked.status}: ${asked.stdout}${asked.stderr}`,
  ));

  const withTheManifest = runCommand(['--version']);
  await context.test('and a proper installation says the version the manifest gives', () => assert.ok(
    withTheManifest.stdout === undefined || /^\d+\.\d+\.\d+$/.test(withTheManifest.standardOutput.trim()),
    String(withTheManifest.standardOutput),
  ));
});
