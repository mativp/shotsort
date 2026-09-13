// Everything the program says to a terminal. A report is handed the same four things
// whichever shape it prints in, so neither shape can quietly learn something the other
// does not know.
import { formatCameraClock } from '../src/clock.mjs';
import { DATE_SOURCE } from '../src/dateSource.mjs';
import { PLACEMENT, UNDATED_FOLDER_NAME } from '../src/plan.mjs';
import { PROGRAM_NAME } from './usage.mjs';

const BYTE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const BYTES_PER_UNIT_STEP = 1024;
const FILE_COUNT_COLUMN_WIDTH = 5;
const BYTE_SIZE_COLUMN_WIDTH = 10;

export function formatByteSize(byteCount) {
  let size = byteCount;
  let unitIndex = 0;
  while (size >= BYTES_PER_UNIT_STEP && unitIndex < BYTE_SIZE_UNITS.length - 1) {
    size /= BYTES_PER_UNIT_STEP;
    unitIndex++;
  }
  const sizeText = unitIndex === 0 ? String(size) : size.toFixed(1);
  return `${sizeText} ${BYTE_SIZE_UNITS[unitIndex]}`;
}

function summariseByFolder(placements) {
  const summaryOfEachFolder = new Map();
  for (const entry of placements) {
    const summary = summaryOfEachFolder.get(entry.folderName)
      ?? { fileCount: 0, totalBytes: 0, filesDatedByFilesystemTime: 0 };
    summary.fileCount++;
    summary.totalBytes += entry.sizeInBytes;
    if (entry.dateSource === DATE_SOURCE.fileTimestamp) summary.filesDatedByFilesystemTime++;
    summaryOfEachFolder.set(entry.folderName, summary);
  }
  return [...summaryOfEachFolder].sort(([firstName], [secondName]) => (firstName < secondName ? -1 : 1));
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function folderSummaryLines(placements) {
  const foldersInOrder = summariseByFolder(placements);
  const widestFolderName = Math.max(...foldersInOrder.map(([folderName]) => folderName.length));

  return foldersInOrder.map(([folderName, summary]) => {
    const filesystemTimeMark = summary.filesDatedByFilesystemTime > 0 ? '~' : ' ';
    const fileWord = summary.fileCount === 1 ? 'file ' : 'files';
    return `${folderName.padEnd(widestFolderName)} ${filesystemTimeMark} `
      + `${String(summary.fileCount).padStart(FILE_COUNT_COLUMN_WIDTH)} ${fileWord} `
      + `${formatByteSize(summary.totalBytes).padStart(BYTE_SIZE_COLUMN_WIDTH)}`;
  });
}

function outcomeLine(outcome, { dryRun, moveInsteadOfCopying }) {
  const placedVerb = dryRun
    ? `to ${moveInsteadOfCopying ? 'move' : 'copy'}`
    : moveInsteadOfCopying ? 'moved' : 'copied';

  const parts = [`${outcome.placed} ${placedVerb}`];
  if (outcome.alreadyInPlace > 0) parts.push(`${outcome.alreadyInPlace} already in place`);
  if (outcome.duplicates > 0) {
    const duplicateVerb = dryRun
      ? (moveInsteadOfCopying ? 'to drop' : 'to skip')
      : moveInsteadOfCopying ? 'dropped' : 'skipped';
    parts.push(`${plural(outcome.duplicates, 'duplicate')} ${duplicateVerb}`);
  }
  if (outcome.emptyDirectoriesRemoved > 0) parts.push(`${plural(outcome.emptyDirectoriesRemoved, 'empty folder')} removed`);
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);

  return `${parts.join(', ')}${dryRun ? '  (dry run)' : ''}`;
}

function notes({ filesystemDateUseCounts, namesSplitIntoSubfolders }) {
  const written = [];
  if (filesystemDateUseCounts.filesDatedByTheFilesystem > 0) {
    written.push(
      `~ marks days holding ${filesystemDateUseCounts.filesDatedByTheFilesystem} file(s) that record no date `
      + 'inside themselves, filed by their filesystem date',
    );
  }
  if (filesystemDateUseCounts.filesLeftUndated > 0) {
    written.push(
      `${filesystemDateUseCounts.filesLeftUndated} file(s) record no date inside themselves and their filesystem `
      + `date looks like the moment of a copy rather than a shooting time, so they went to ${UNDATED_FOLDER_NAME}/. `
      + "Re-copy the card with 'ditto', 'cp -p' or 'rsync -a' to keep the real times, or pass "
      + '--use-filesystem-date to take them as they are.',
    );
  }
  if (namesSplitIntoSubfolders > 0) {
    const namePlural = namesSplitIntoSubfolders === 1 ? 'name is' : 'names are';
    written.push(
      `${namesSplitIntoSubfolders} file ${namePlural} used by more than one photo on the same day; `
      + 'each photo went into a numbered subfolder of that day, oldest first',
    );
  }
  return written;
}

export function fileAsItIsPlaced(entry, moveInsteadOfCopying) {
  if (entry.placement === PLACEMENT.intoItsDayFolder) return `${entry.sourcePath} -> ${entry.targetPath}`;
  if (entry.placement === PLACEMENT.duplicateOfAFileAlreadySorted) {
    const whatHappenedToIt = moveInsteadOfCopying ? 'dropped' : 'skipped';
    return `${entry.sourcePath} -> ${whatHappenedToIt}, already at ${entry.targetPath}`;
  }
  return null;
}

export function reportForATerminal({ plan, outcome, options }, { out, error }) {
  if (!options.quiet && !options.verbose && plan.placements.length > 0) {
    for (const line of folderSummaryLines(plan.placements)) out(line);
  }
  if (!options.quiet) out(outcomeLine(outcome, options));

  for (const note of notes(plan)) error(`${PROGRAM_NAME}: ${note}`);
  for (const failure of outcome.failures) error(`${PROGRAM_NAME}: ${failure.sourcePath}: ${failure.reason}`);
}

// The same facts the terminal gets, including the two counts the notes are drawn from,
// which a machine reading this had no way of seeing before.
export function reportAsJson({ plan, outcome, fileCount, options }, { out }) {
  out(JSON.stringify({
    actions: plan.placements.map((entry) => ({
      src: entry.sourcePath,
      target: entry.targetPath,
      folder: entry.folderName,
      stamp: entry.clock === null ? null : formatCameraClock(entry.clock),
      dateFrom: entry.dateSource,
      size: entry.sizeInBytes,
      verdict: entry.placement,
      error: entry.failureReason,
    })),
    summary: {
      placed: outcome.placed,
      alreadyInPlace: outcome.alreadyInPlace,
      duplicates: outcome.duplicates,
      failed: outcome.failed,
      emptyDirectoriesRemoved: outcome.emptyDirectoriesRemoved,
      // `errors` is the older spelling, kept so a script reading this output goes on
      // working; `failures` is the same thing with the path and the reason kept apart.
      errors: outcome.failures.map((failure) => `${failure.sourcePath}: ${failure.reason}`),
      failures: outcome.failures,
      found: fileCount,
      dryRun: options.dryRun,
      datedByTheFilesystem: plan.filesystemDateUseCounts.filesDatedByTheFilesystem,
      leftUndated: plan.filesystemDateUseCounts.filesLeftUndated,
      namesSplitIntoSubfolders: plan.namesSplitIntoSubfolders,
    },
  }, null, 2));
}
