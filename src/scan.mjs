// Walking the folders the user named and nothing more: this finds candidate files and
// says how big each is, and leaves reading anything out of them to the dating step.
import fs from 'node:fs';
import path from 'node:path';
import { hasMediaExtension } from './extensions.mjs';

// A CandidateFile is { path, sortRoot, sizeInBytes, fileTimestamp } and nothing else.
// `sortRoot` is the folder the day folders go under when no --dest was given.

const OPERATING_SYSTEM_DIRECTORIES_TO_SKIP = new Set([
  '.Spotlight-V100', '.Trashes', '.fseventsd', '.TemporaryItems',
  'System Volume Information', '$RECYCLE.BIN',
]);

function collectMediaFilePathsUnder(directory, collected) {
  let directoryEntries;
  try {
    directoryEntries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return collected;
  }

  for (const directoryEntry of directoryEntries) {
    const fullPath = path.join(directory, directoryEntry.name);
    const isHiddenDirectory = directoryEntry.name.startsWith('.');
    const isSystemDirectory = OPERATING_SYSTEM_DIRECTORIES_TO_SKIP.has(directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      if (!isHiddenDirectory && !isSystemDirectory) collectMediaFilePathsUnder(fullPath, collected);
    } else if (directoryEntry.isFile() && hasMediaExtension(fullPath)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

export function findMediaFiles(inputPaths) {
  const sortRootOfEachFile = new Map();

  for (const inputPath of inputPaths) {
    const inputStats = fs.statSync(inputPath);
    const absoluteInputPath = path.resolve(inputPath);
    const sortRoot = inputStats.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath);
    const filesFound = inputStats.isDirectory()
      ? collectMediaFilePathsUnder(absoluteInputPath, [])
      : hasMediaExtension(absoluteInputPath) ? [absoluteInputPath] : [];

    for (const filePath of filesFound) {
      if (!sortRootOfEachFile.has(filePath)) sortRootOfEachFile.set(filePath, sortRoot);
    }
  }

  return [...sortRootOfEachFile.keys()].sort().map((filePath) => {
    const fileStats = fs.statSync(filePath);
    return Object.freeze({
      path: filePath,
      sortRoot: sortRootOfEachFile.get(filePath),
      sizeInBytes: fileStats.size,
      fileTimestamp: fileStats.mtime,
    });
  });
}
