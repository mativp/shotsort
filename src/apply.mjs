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

function moveFile(filesystem, sourcePath, targetPath, fileTimestamp) {
  if (filesystem.existsSync(targetPath)) {
    throw Object.assign(new Error('target appeared after the plan was made'), { code: 'EEXIST' });
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
  filesystem.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  filesystem.utimesSync(targetPath, fileTimestamp, fileTimestamp);
  const copyIsComplete = filesystem.statSync(targetPath).size === filesystem.statSync(sourcePath).size;
  if (!copyIsComplete) {
    filesystem.unlinkSync(targetPath);
    throw new Error('copy was incomplete, original left untouched');
  }
  filesystem.unlinkSync(sourcePath);
}

function copyFile(filesystem, sourcePath, targetPath, fileTimestamp) {
  filesystem.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  filesystem.utimesSync(targetPath, fileTimestamp, fileTimestamp);
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
    if (filesystem.readdirSync(directory).length === 0) {
      filesystem.rmdirSync(directory);
      directoriesRemoved++;
    }
  } catch {
    return directoriesRemoved;
  }
  return directoriesRemoved;
}

function carryOutOnePlacement(entry, outcome, { moveInsteadOfCopying, onFilePlaced, filesystem }) {
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
      if (moveInsteadOfCopying) moveFile(filesystem, entry.sourcePath, entry.targetPath, entry.fileTimestamp);
      else copyFile(filesystem, entry.sourcePath, entry.targetPath, entry.fileTimestamp);
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
  onFileStarted = null, onFilePlaced = null, onFileFinished = null, filesystem = fs,
} = {}) {
  const outcome = {
    placed: 0, alreadyInPlace: 0, duplicates: 0, failed: 0,
    emptyDirectoriesRemoved: 0, failures: [],
  };

  for (const entry of placements) {
    onFileStarted?.(entry);
    carryOutOnePlacement(entry, outcome, { moveInsteadOfCopying, onFilePlaced, filesystem });
    onFileFinished?.(entry);
  }

  if (moveInsteadOfCopying) {
    for (const directory of directoriesToTidy) {
      outcome.emptyDirectoriesRemoved += removeEmptyDirectoriesUnder(filesystem, path.resolve(directory), true);
    }
  }
  return outcome;
}
