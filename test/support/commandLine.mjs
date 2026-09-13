import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildCardDump } from '../fixtures/cardDump.mjs';
import { projectRoot } from './project.mjs';
import { aTemporaryDirectory } from './temporaryDirectories.mjs';

export const COMMAND = path.join(projectRoot, 'bin', 'shotsort.mjs');

export const EXIT_EVERYTHING_PLACED = 0;
export const EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND = 1;
export const EXIT_BAD_COMMAND_LINE = 2;

export function runCommand(commandArguments, spawnOptions = {}) {
  const result = spawnSync('node', [COMMAND, ...commandArguments], { encoding: 'utf8', ...spawnOptions });
  return { exitCode: result.status, standardOutput: result.stdout ?? '', standardError: result.stderr ?? '' };
}

export function filesUnder(directory) {
  const walk = (currentDirectory, pathSoFar) => fs.readdirSync(currentDirectory, { withFileTypes: true })
    .flatMap((directoryEntry) => (directoryEntry.isDirectory()
      ? walk(path.join(currentDirectory, directoryEntry.name), `${pathSoFar}${directoryEntry.name}/`)
      : [`${pathSoFar}${directoryEntry.name}`]));
  return walk(directory, '').sort();
}

export const visibleFilesUnder = (directory) => filesUnder(directory).filter((filePath) => !filePath.startsWith('.'));
export const freshCardDump = (name, options) => buildCardDump(aTemporaryDirectory(name), options);
export const filesAreIdentical = (firstPath, secondPath) => fs.readFileSync(firstPath).equals(fs.readFileSync(secondPath));
export const folderChosenFor = (jsonOutput, fileName) =>
  JSON.parse(jsonOutput).actions.find((action) => action.src.endsWith(fileName)).folder;
