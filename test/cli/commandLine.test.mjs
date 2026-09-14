import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT_CODE, USAGE_IN_BRIEF, USAGE_IN_FULL } from '../../cli/usage.mjs';
import { runCommand } from '../support/commandLine.mjs';
import { projectRoot } from '../support/project.mjs';
import { aTemporaryDirectory, freshCardDump } from '../support/temporaryDirectories.mjs';

const versionFromManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;

test('the command line itself', async (context) => {
  const emptyFolder = aTemporaryDirectory('empty');

  const refusedFor = (commandArguments) => {
    const attempt = runCommand(commandArguments);
    return attempt.exitCode === EXIT_CODE.badCommandLine ? attempt.standardError : `exited ${attempt.exitCode}`;
  };

  await context.test('finding nothing exits 1, as grep does',
    () => assert.equal(runCommand([emptyFolder]).exitCode, EXIT_CODE.somethingFailedOrNothingFound));
  await context.test('an unrecognised long option is refused by name',
    () => assert.match(refusedFor(['--nope']), /unrecognised option '--nope'/));

  for (const flag of ['-V', '--version']) {
    const printed = runCommand([flag]);
    await context.test(`${flag} prints the version from the manifest and exits 0`, () => assert.ok(
      printed.standardOutput.trim() === versionFromManifest && printed.exitCode === EXIT_CODE.everythingPlaced,
      `${printed.standardOutput.trim()} vs ${versionFromManifest}`,
    ));
  }
  const cardDumpItShouldNotTouch = freshCardDump('never-touched');
  const bareInvocation = runCommand([], { cwd: cardDumpItShouldNotTouch });
  const askedForHelp = runCommand(['--help']);
  const askedWithTheShortFlag = runCommand(['-h']);

  await context.test('-h prints the same usage as --help', () => assert.deepEqual(
    [askedWithTheShortFlag.standardOutput, askedWithTheShortFlag.exitCode],
    [askedForHelp.standardOutput, EXIT_CODE.everythingPlaced],
  ));

  // Printed and then exited on the spot, the tail of a text this long never leaves the
  // buffer standard output holds while it is a pipe: the first 8192 bytes arrive and the
  // rest is dropped, so anything reading the output rather than showing it -- this suite
  // included -- was reading a text cut off mid-word. Both are checked whole, against the
  // strings themselves, since a check reading the same truncated output cannot see it.
  for (const [whatWasAskedFor, run, whole] of [['the brief', bareInvocation, USAGE_IN_BRIEF], ['the full text', askedForHelp, USAGE_IN_FULL]]) {
    await context.test(`${whatWasAskedFor} arrives whole, not cut off where the buffer ends`,
      () => assert.equal(run.standardOutput, `${whole}\n`));
  }

  const afterTheTerminator = freshCardDump('after-terminator');
  const terminated = runCommand(['-n', '--', afterTheTerminator]);
  await context.test('a -- argument ends option parsing and the rest is a folder', () => assert.ok(
    terminated.exitCode === EXIT_CODE.everythingPlaced && /11 to copy/.test(terminated.standardOutput),
    terminated.standardOutput + terminated.standardError,
  ));

  await context.test('running it with no arguments prints the brief on standard output', () => assert.ok(
    bareInvocation.standardOutput.startsWith('Usage: shotsort') && bareInvocation.standardError === '',
    bareInvocation.standardOutput.slice(0, 120) + bareInvocation.standardError,
  ));
  await context.test('running it with no arguments exits 2, having been asked to do nothing',
    () => assert.equal(bareInvocation.exitCode, EXIT_CODE.badCommandLine));
  await context.test('--help prints the whole manual instead, and exits 0, having been asked for it', () => assert.ok(
    askedForHelp.standardOutput !== bareInvocation.standardOutput
    && (askedForHelp.standardOutput.match(/^ {2,6}-/gm) ?? []).length >= 9
    && askedForHelp.standardOutput.includes('Examples:')
    && askedForHelp.standardOutput.includes('Exit status:')
    && askedForHelp.exitCode === EXIT_CODE.everythingPlaced,
  ));
  await context.test('and sorts nothing in the folder it was run from',
    () => assert.ok(fs.existsSync(path.join(cardDumpItShouldNotTouch, 'DCIM/100_PANA/P1000001.JPG'))));
  await context.test('options without a folder to sort are refused',
    () => assert.equal(runCommand(['-n'], { cwd: cardDumpItShouldNotTouch }).exitCode, EXIT_CODE.badCommandLine));
  await context.test('the current folder still sorts when it is named',
    () => assert.equal(runCommand(['-n', '.'], { cwd: cardDumpItShouldNotTouch }).exitCode, EXIT_CODE.everythingPlaced));
});

test('installed without its manifest', async (context) => {
  // npm always installs the manifest; a copy made by hand may not. Asked its version then,
  // it has nowhere to read one from and has to say so rather than fall over.
  const installation = aTemporaryDirectory('no-manifest');
  for (const directory of ['bin', 'cli', 'src']) {
    fs.cpSync(path.join(projectRoot, directory), path.join(installation, directory), { recursive: true });
  }

  const asked = spawnSync(process.execPath, [path.join(installation, 'bin', 'shotsort.mjs'), '--version'], { encoding: 'utf8' });
  await context.test('a copy installed without its manifest says its version is unknown rather than failing', () => assert.ok(
    asked.status === EXIT_CODE.everythingPlaced && asked.stdout.trim() === 'unknown',
    `${asked.status}: ${asked.stdout}${asked.stderr}`,
  ));

  const withTheManifest = runCommand(['--version']);
  await context.test('and a proper installation says the version the manifest gives',
    () => assert.equal(withTheManifest.standardOutput.trim(), versionFromManifest));
});
