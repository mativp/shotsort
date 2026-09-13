import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCardDump } from '../fixtures/cardDump.mjs';
import { writeFixtureFile } from './files.mjs';

const everyDirectoryMade = [];
process.on('exit', () => {
  for (const directory of everyDirectoryMade) {
    openUp(directory);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// A check may shut a folder to its owner and be stopped before it opens it again, and a
// folder nobody may list cannot be emptied.
function openUp(directory) {
  if (!fs.existsSync(directory)) return;
  fs.chmodSync(directory, 0o700);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) openUp(path.join(directory, entry.name));
  }
}

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

export const freshCardDump = (name, options) => buildCardDump(aTemporaryDirectory(name), options);
