import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFixtureFile } from '../fixtures/cardDump.mjs';

const everyDirectoryMade = [];
process.on('exit', () => {
  for (const directory of everyDirectoryMade) fs.rmSync(directory, { recursive: true, force: true });
});

export function aTemporaryDirectory(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `shotsort-${name}-`));
  everyDirectoryMade.push(directory);
  return directory;
}

export const aPathNotYetTaken = (name) => path.join(aTemporaryDirectory(name), name);

export function aDirectoryHolding(name, files) {
  const directory = aTemporaryDirectory(name);
  for (const [relativePath, contents] of Object.entries(files)) {
    writeFixtureFile(path.join(directory, relativePath), contents);
  }
  return directory;
}
