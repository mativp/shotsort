import fs from 'node:fs';
import path from 'node:path';

export function writeFixtureFile(filePath, contents, fileTimestamp) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  if (fileTimestamp) fs.utimesSync(filePath, fileTimestamp, fileTimestamp);
}

export function filesUnder(directory) {
  const walk = (currentDirectory, pathSoFar) => fs.readdirSync(currentDirectory, { withFileTypes: true })
    .flatMap((directoryEntry) => (directoryEntry.isDirectory()
      ? walk(path.join(currentDirectory, directoryEntry.name), `${pathSoFar}${directoryEntry.name}/`)
      : [`${pathSoFar}${directoryEntry.name}`]));
  return walk(directory, '').sort();
}

export const visibleFilesUnder = (directory) => filesUnder(directory).filter((filePath) => !filePath.startsWith('.'));

export const filesAreIdentical = (firstPath, secondPath) => fs.readFileSync(firstPath).equals(fs.readFileSync(secondPath));
