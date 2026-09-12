// Carrying out a plan that has already been settled. Nothing here decides anything: every
// target path was chosen before this ran, which is what makes --dry-run honest.
import fs from 'node:fs';
import path from 'node:path';
import { PLACEMENT } from './plan.mjs';

function moveFile(sourcePath, targetPath, fileTimestamp) {
  if (fs.existsSync(targetPath)) {
    throw Object.assign(new Error('target appeared after the plan was made'), { code: 'EEXIST' });
  }
  try {
    fs.renameSync(sourcePath, targetPath);
    return;
  } catch (renameError) {
    const targetIsOnAnotherFilesystem = renameError.code === 'EXDEV';
    if (!targetIsOnAnotherFilesystem) throw renameError;
  }

  // Across filesystems a move is a copy and a delete, and the delete only happens once the
  // copy is known to be whole.
  fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  fs.utimesSync(targetPath, fileTimestamp, fileTimestamp);
  const copyIsComplete = fs.statSync(targetPath).size === fs.statSync(sourcePath).size;
  if (!copyIsComplete) {
    fs.unlinkSync(targetPath);
    throw new Error('copy was incomplete, original left untouched');
  }
  fs.unlinkSync(sourcePath);
}

function copyFile(sourcePath, targetPath, fileTimestamp) {
  fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  fs.utimesSync(targetPath, fileTimestamp, fileTimestamp);
}

function removeEmptyDirectoriesUnder(directory, isTheDirectoryTheUserNamed) {
  let directoriesRemoved = 0;
  let directoryEntries;
  try {
    directoryEntries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return directoriesRemoved;
  }

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isDirectory()) {
      directoriesRemoved += removeEmptyDirectoriesUnder(path.join(directory, directoryEntry.name), false);
    }
  }
  if (isTheDirectoryTheUserNamed) return directoriesRemoved;

  try {
    if (fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
      directoriesRemoved++;
    }
  } catch {
    return directoriesRemoved;
  }
  return directoriesRemoved;
}

// Failures come back as the path and the reason, not as a finished sentence: how to word
// them for a terminal is the command line's business, not this module's.
export function applyPlan(placements, { moveInsteadOfCopying = false, directoriesToTidy = [], onFilePlaced = null } = {}) {
  const outcome = {
    placed: 0, alreadyInPlace: 0, duplicates: 0, failed: 0,
    emptyDirectoriesRemoved: 0, failures: [],
  };

  for (const entry of placements) {
    if (entry.placement === PLACEMENT.couldNotBePlaced) {
      outcome.failed++;
      outcome.failures.push({ sourcePath: entry.sourcePath, reason: entry.failureReason });
      continue;
    }
    if (entry.placement === PLACEMENT.alreadyInItsDayFolder) {
      outcome.alreadyInPlace++;
      onFilePlaced?.(entry);
      continue;
    }

    try {
      if (entry.placement === PLACEMENT.duplicateOfAFileAlreadySorted) {
        if (moveInsteadOfCopying) fs.unlinkSync(entry.sourcePath);
        outcome.duplicates++;
      } else {
        fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
        if (moveInsteadOfCopying) moveFile(entry.sourcePath, entry.targetPath, entry.fileTimestamp);
        else copyFile(entry.sourcePath, entry.targetPath, entry.fileTimestamp);
        outcome.placed++;
      }
      onFilePlaced?.(entry);
    } catch (error) {
      outcome.failed++;
      outcome.failures.push({ sourcePath: entry.sourcePath, reason: error.code ?? error.message });
    }
  }

  if (moveInsteadOfCopying) {
    for (const directory of directoriesToTidy) {
      outcome.emptyDirectoriesRemoved += removeEmptyDirectoriesUnder(path.resolve(directory), true);
    }
  }
  return outcome;
}
