// Carrying out a plan that has already been settled. Nothing here decides anything: every
// target path was chosen before this ran, which is what makes --dry-run honest.
//
// The filesystem is taken as an argument for the same reason planning takes a probe: the
// ways a move goes wrong -- a target that appeared after the plan was made, a card pulled
// out mid-copy, a destination on another disk -- are the paths that must never lose a
// file, and they are the ones a real disk will not perform on demand.
import fs from 'node:fs';
import path from 'node:path';
import { PLACEMENT } from './plan.mjs';

const BYTES_IN_A_FILE_COPIED_IN_CHUNKS = 64 * 1024 * 1024;
const BYTES_COPIED_PER_CHUNK = 1024 * 1024;
const A_COPY_THAT_CAME_UP_SHORT = 'copy was incomplete, original left untouched';

function writeEveryChunk(filesystem, sourceDescriptor, targetDescriptor, reportBytesWritten) {
  const chunk = Buffer.allocUnsafe(BYTES_COPIED_PER_CHUNK);
  let bytesWritten = 0;
  for (;;) {
    const bytesRead = filesystem.readSync(sourceDescriptor, chunk, 0, chunk.length, bytesWritten);
    if (bytesRead === 0) return bytesWritten;
    for (let bytesOfTheChunkWritten = 0; bytesOfTheChunkWritten < bytesRead;) {
      bytesOfTheChunkWritten += filesystem.writeSync(
        targetDescriptor, chunk, bytesOfTheChunkWritten, bytesRead - bytesOfTheChunkWritten, bytesWritten + bytesOfTheChunkWritten,
      );
    }
    bytesWritten += bytesRead;
    reportBytesWritten(bytesWritten);
  }
}

function copyInChunks(filesystem, entry, reportBytesWritten) {
  const sourceDescriptor = filesystem.openSync(entry.sourcePath, 'r');
  try {
    const bytesInTheSource = filesystem.fstatSync(sourceDescriptor).size;
    const targetDescriptor = filesystem.openSync(entry.targetPath, 'wx');
    let bytesWritten = null;
    try {
      bytesWritten = writeEveryChunk(filesystem, sourceDescriptor, targetDescriptor, reportBytesWritten);
    } finally {
      filesystem.closeSync(targetDescriptor);
      if (bytesWritten !== bytesInTheSource) filesystem.unlinkSync(entry.targetPath);
    }
    if (bytesWritten !== bytesInTheSource) throw new Error(A_COPY_THAT_CAME_UP_SHORT);
  } finally {
    filesystem.closeSync(sourceDescriptor);
  }
}

// copyFileSync leaves the copy to the operating system, which can do it faster or without
// moving the bytes at all, but says nothing until the whole file is written. Only a file big
// enough for that wait to be watched is copied in chunks instead.
function copyContents(filesystem, entry, reportBytesWritten) {
  if (entry.sizeInBytes >= BYTES_IN_A_FILE_COPIED_IN_CHUNKS) copyInChunks(filesystem, entry, reportBytesWritten);
  else filesystem.copyFileSync(entry.sourcePath, entry.targetPath, fs.constants.COPYFILE_EXCL);
  filesystem.utimesSync(entry.targetPath, entry.fileTimestamp, entry.fileTimestamp);
}

function moveFile(filesystem, entry, reportBytesWritten) {
  const { sourcePath, targetPath } = entry;
  if (filesystem.existsSync(targetPath)) {
    throw Object.assign(new Error(), { code: 'EEXIST' });
  }
  try {
    filesystem.renameSync(sourcePath, targetPath);
    return;
  } catch (renameError) {
    const targetIsOnAnotherFilesystem = renameError.code === 'EXDEV';
    if (!targetIsOnAnotherFilesystem) throw renameError;
  }

  // Across filesystems a move is a copy and a delete, and the delete only happens once the
  // copy is known to be whole.
  copyContents(filesystem, entry, reportBytesWritten);
  const copyIsComplete = filesystem.statSync(targetPath).size === filesystem.statSync(sourcePath).size;
  if (!copyIsComplete) {
    filesystem.unlinkSync(targetPath);
    throw new Error(A_COPY_THAT_CAME_UP_SHORT);
  }
  filesystem.unlinkSync(sourcePath);
}

function removeEmptyDirectoriesUnder(filesystem, directory, isTheDirectoryTheUserNamed) {
  let directoriesRemoved = 0;
  let directoryEntries;
  try {
    directoryEntries = filesystem.readdirSync(directory, { withFileTypes: true });
  } catch {
    return directoriesRemoved;
  }

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isDirectory()) {
      directoriesRemoved += removeEmptyDirectoriesUnder(filesystem, path.join(directory, directoryEntry.name), false);
    }
  }
  if (isTheDirectoryTheUserNamed) return directoriesRemoved;

  try {
    filesystem.rmdirSync(directory);
    return directoriesRemoved + 1;
  } catch {
    return directoriesRemoved;
  }
}

function carryOutOnePlacement(entry, outcome, { moveInsteadOfCopying, onFilePlaced, onBytesWritten, filesystem }) {
  if (entry.placement === PLACEMENT.couldNotBePlaced) {
    outcome.failed++;
    outcome.failures.push({ sourcePath: entry.sourcePath, reason: entry.failureReason });
    return;
  }
  if (entry.placement === PLACEMENT.alreadyInItsDayFolder) {
    outcome.alreadyInPlace++;
    onFilePlaced?.(entry);
    return;
  }

  try {
    if (entry.placement === PLACEMENT.duplicateOfAFileAlreadySorted) {
      if (moveInsteadOfCopying) filesystem.unlinkSync(entry.sourcePath);
      outcome.duplicates++;
    } else {
      filesystem.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
      const reportBytesWritten = (bytesWritten) => onBytesWritten?.(entry, bytesWritten);
      if (moveInsteadOfCopying) moveFile(filesystem, entry, reportBytesWritten);
      else copyContents(filesystem, entry, reportBytesWritten);
      outcome.placed++;
    }
    onFilePlaced?.(entry);
  } catch (error) {
    outcome.failed++;
    outcome.failures.push({ sourcePath: entry.sourcePath, reason: error.code ?? error.message });
  }
}

// Failures come back as the path and the reason, not as a finished sentence: how to word
// them for a terminal is the command line's business, not this module's.
export function applyPlan(placements, {
  moveInsteadOfCopying = false, directoriesToTidy = [],
  onFileStarted = null, onFilePlaced = null, onBytesWritten = null, onFileFinished = null, filesystem = fs,
} = {}) {
  const outcome = {
    placed: 0, alreadyInPlace: 0, duplicates: 0, failed: 0,
    emptyDirectoriesRemoved: 0, failures: [],
  };

  for (const entry of placements) {
    onFileStarted?.(entry);
    carryOutOnePlacement(entry, outcome, { moveInsteadOfCopying, onFilePlaced, onBytesWritten, filesystem });
    onFileFinished?.(entry);
  }

  if (moveInsteadOfCopying) {
    for (const directory of directoriesToTidy) {
      outcome.emptyDirectoriesRemoved += removeEmptyDirectoriesUnder(filesystem, path.resolve(directory), true);
    }
  }
  return outcome;
}
