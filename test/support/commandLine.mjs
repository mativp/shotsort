import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './project.mjs';

export const COMMAND = path.join(projectRoot, 'bin', 'shotsort.mjs');

export function runCommand(commandArguments, spawnOptions = {}) {
  const result = spawnSync(process.execPath, [COMMAND, ...commandArguments], { encoding: 'utf8', ...spawnOptions });
  return { exitCode: result.status, standardOutput: result.stdout ?? '', standardError: result.stderr ?? '' };
}

export const folderChosenFor = (jsonOutput, fileName) =>
  JSON.parse(jsonOutput).actions.find((action) => action.src.endsWith(fileName)).folder;
