import fs from 'node:fs';
import path from 'node:path';
import {
  MEDIA_FILE_EXTENSIONS,
  DATE_SOURCE,
  readTimestampFromFile,
  timestampFromDate,
  timestampToMilliseconds,
  formatDayFolder,
} from './date.mjs';

export const UNDATED_FOLDER_NAME = 'undated';

export const PLACEMENT = {
  intoItsDayFolder: 'place',
  alreadyInItsDayFolder: 'in place',
  duplicateOfAFileAlreadySorted: 'duplicate',
  couldNotBePlaced: 'failed',
};

export const FILESYSTEM_DATE_USE = {
  onlyWhenItStillLooksLikeAShootingTime: 'when-plausible',
  always: 'always',
  never: 'never',
};

const OPERATING_SYSTEM_DIRECTORIES_TO_SKIP = new Set([
  '.Spotlight-V100', '.Trashes', '.fseventsd', '.TemporaryItems',
  'System Volume Information', '$RECYCLE.BIN',
]);

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const HOURS_A_FILE_TIMESTAMP_MAY_TRAIL_THE_NEWEST_RECORDED_DATE = 36;
const MOST_NUMBERED_SUBFOLDERS_IN_A_DAY = 99;
const NUMBERED_SUBFOLDER_PATTERN = /^\d{2}$/;
const BYTES_COMPARED_PER_READ = 1024 * 1024;
const twoDigits = (number) => String(number).padStart(2, '0');

const hasMediaExtension = (filePath) => MEDIA_FILE_EXTENSIONS.has(path.extname(filePath).toUpperCase());

function collectMediaFilesUnder(directory, collected) {
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
      if (!isHiddenDirectory && !isSystemDirectory) collectMediaFilesUnder(fullPath, collected);
    } else if (directoryEntry.isFile() && hasMediaExtension(fullPath)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

export function scanForMediaFiles(inputPaths) {
  const sortRootOfEachFile = new Map();

  for (const inputPath of inputPaths) {
    const inputStats = fs.statSync(inputPath);
    const absoluteInputPath = path.resolve(inputPath);
    const sortRoot = inputStats.isDirectory() ? absoluteInputPath : path.dirname(absoluteInputPath);
    const filesFound = inputStats.isDirectory()
      ? collectMediaFilesUnder(absoluteInputPath, [])
      : hasMediaExtension(absoluteInputPath) ? [absoluteInputPath] : [];

    for (const filePath of filesFound) {
      if (!sortRootOfEachFile.has(filePath)) sortRootOfEachFile.set(filePath, sortRoot);
    }
  }

  return [...sortRootOfEachFile.keys()].sort().map((filePath) => {
    const fileStats = fs.statSync(filePath);
    const dateFound = readTimestampFromFile(filePath, fileStats.size);
    return {
      path: filePath,
      sortRoot: sortRootOfEachFile.get(filePath),
      sizeInBytes: fileStats.size,
      fileTimestamp: fileStats.mtime,
      timestamp: dateFound?.timestamp ?? null,
      dateSource: dateFound?.source ?? null,
    };
  });
}

const sameShotKey = (filePath) =>
  path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath))).toLowerCase();

const shotNameAlone = (filePath) => path.basename(filePath, path.extname(filePath)).toLowerCase();

function fillMissingDatesFromTheSameShot(mediaFiles) {
  const timestampOfEachShot = new Map();
  const timestampsEachNameWasGiven = new Map();

  for (const mediaFile of mediaFiles) {
    if (mediaFile.timestamp === null) continue;

    const key = sameShotKey(mediaFile.path);
    if (!timestampOfEachShot.has(key)) timestampOfEachShot.set(key, mediaFile.timestamp);

    const name = shotNameAlone(mediaFile.path);
    const timestampsSoFar = timestampsEachNameWasGiven.get(name) ?? new Set();
    timestampsSoFar.add(mediaFile.timestamp);
    timestampsEachNameWasGiven.set(name, timestampsSoFar);
  }

  for (const mediaFile of mediaFiles) {
    if (mediaFile.timestamp !== null) continue;

    const inTheSameFolder = timestampOfEachShot.get(sameShotKey(mediaFile.path));
    const everyTimestampThatNameHas = timestampsEachNameWasGiven.get(shotNameAlone(mediaFile.path));
    const theOneTimeThatNameWasUsed = everyTimestampThatNameHas?.size === 1
      ? [...everyTimestampThatNameHas][0]
      : undefined;

    const timestampOfTheOtherFormat = inTheSameFolder ?? theOneTimeThatNameWasUsed;
    if (timestampOfTheOtherFormat === undefined) continue;
    mediaFile.timestamp = timestampOfTheOtherFormat;
    mediaFile.dateSource = DATE_SOURCE.siblingFile;
  }
}

function newestDateRecordedInsideAnyFile(mediaFiles) {
  const timestampsReadFromFileContents = mediaFiles
    .filter((mediaFile) => mediaFile.dateSource === DATE_SOURCE.exifMetadata || mediaFile.dateSource === DATE_SOURCE.videoHeader)
    .map((mediaFile) => timestampToMilliseconds(mediaFile.timestamp));
  return timestampsReadFromFileContents.length === 0 ? null : Math.max(...timestampsReadFromFileContents);
}

function filesystemDateStillLooksLikeAShootingTime(mediaFile, newestRecordedDate) {
  if (newestRecordedDate === null) return true;
  const howFarItTrailsTheShoot = mediaFile.fileTimestamp.getTime() - newestRecordedDate;
  return howFarItTrailsTheShoot <= HOURS_A_FILE_TIMESTAMP_MAY_TRAIL_THE_NEWEST_RECORDED_DATE * MILLISECONDS_PER_HOUR;
}

function fillMissingDatesFromTheFilesystem(mediaFiles, useSetting) {
  const newestRecordedDate = newestDateRecordedInsideAnyFile(mediaFiles);
  let filesDatedByTheFilesystem = 0;
  let filesLeftUndated = 0;

  for (const mediaFile of mediaFiles) {
    if (mediaFile.timestamp !== null) continue;

    const mayUseTheFilesystemDate = useSetting === FILESYSTEM_DATE_USE.always
      || (useSetting === FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime
        && filesystemDateStillLooksLikeAShootingTime(mediaFile, newestRecordedDate));

    if (!mayUseTheFilesystemDate) {
      filesLeftUndated++;
      continue;
    }
    mediaFile.timestamp = timestampFromDate(mediaFile.fileTimestamp);
    mediaFile.dateSource = DATE_SOURCE.fileTimestamp;
    filesDatedByTheFilesystem++;
  }
  return { filesDatedByTheFilesystem, filesLeftUndated };
}

function filesHaveIdenticalContents(firstPath, secondPath, sizeInBytes) {
  let firstDescriptor;
  let secondDescriptor;
  try {
    if (fs.statSync(secondPath).size !== sizeInBytes) return false;
    firstDescriptor = fs.openSync(firstPath, 'r');
    secondDescriptor = fs.openSync(secondPath, 'r');

    const firstChunk = Buffer.alloc(BYTES_COMPARED_PER_READ);
    const secondChunk = Buffer.alloc(BYTES_COMPARED_PER_READ);
    for (let position = 0; position < sizeInBytes;) {
      const bytesFromFirst = fs.readSync(firstDescriptor, firstChunk, 0, BYTES_COMPARED_PER_READ, position);
      if (bytesFromFirst === 0) return false;
      const bytesFromSecond = fs.readSync(secondDescriptor, secondChunk, 0, bytesFromFirst, position);
      if (bytesFromSecond !== bytesFromFirst) return false;
      if (!firstChunk.subarray(0, bytesFromFirst).equals(secondChunk.subarray(0, bytesFromFirst))) return false;
      position += bytesFromFirst;
    }
    return true;
  } catch {
    return false;
  } finally {
    if (firstDescriptor !== undefined) fs.closeSync(firstDescriptor);
    if (secondDescriptor !== undefined) fs.closeSync(secondDescriptor);
  }
}

function distinctVariantsAmong(filesSharingADayAndName) {
  const variants = [];
  for (const mediaFile of filesSharingADayAndName) {
    const variantHoldingTheSameBytes = variants.find((variant) =>
      variant.files[0].sizeInBytes === mediaFile.sizeInBytes
      && filesHaveIdenticalContents(variant.files[0].path, mediaFile.path, mediaFile.sizeInBytes));

    if (variantHoldingTheSameBytes === undefined) variants.push({ files: [mediaFile] });
    else variantHoldingTheSameBytes.files.push(mediaFile);
  }
  return variants;
}

function numberTheFilesThatShareANameWithADifferentPhoto(mediaFiles) {
  const filesOfEachDayAndName = new Map();
  for (const mediaFile of mediaFiles) {
    const key = `${mediaFile.dayFolderPath}\0${path.basename(mediaFile.path).toLowerCase()}`;
    const sharingTheKey = filesOfEachDayAndName.get(key) ?? [];
    sharingTheKey.push(mediaFile);
    filesOfEachDayAndName.set(key, sharingTheKey);
  }

  let namesSplitIntoSubfolders = 0;
  for (const filesSharingADayAndName of filesOfEachDayAndName.values()) {
    for (const mediaFile of filesSharingADayAndName) {
      mediaFile.subfolderNumber = null;
    }
    if (filesSharingADayAndName.length === 1) continue;

    const variants = distinctVariantsAmong(filesSharingADayAndName);
    if (variants.length === 1) continue;

    namesSplitIntoSubfolders++;
    variants.forEach((variant, variantIndex) => {
      for (const mediaFile of variant.files) {
        mediaFile.subfolderNumber = variantIndex + 1;
      }
    });
  }
  return namesSplitIntoSubfolders;
}

function subfolderItAlreadySitsIn(filePath, dayFolderPath) {
  const parentDirectory = path.dirname(filePath);
  if (parentDirectory === dayFolderPath) return parentDirectory;

  const parentIsANumberedSubfolderOfTheDay = path.dirname(parentDirectory) === dayFolderPath
    && NUMBERED_SUBFOLDER_PATTERN.test(path.basename(parentDirectory));
  return parentIsANumberedSubfolderOfTheDay ? parentDirectory : null;
}

function directoriesToTryFor(mediaFile) {
  const directories = [];
  const whereItAlreadySits = subfolderItAlreadySitsIn(mediaFile.path, mediaFile.dayFolderPath);
  if (whereItAlreadySits !== null) directories.push(whereItAlreadySits);

  directories.push(mediaFile.subfolderNumber === null
    ? mediaFile.dayFolderPath
    : path.join(mediaFile.dayFolderPath, twoDigits(mediaFile.subfolderNumber)));

  for (let subfolder = 1; subfolder <= MOST_NUMBERED_SUBFOLDERS_IN_A_DAY; subfolder++) {
    directories.push(path.join(mediaFile.dayFolderPath, twoDigits(subfolder)));
  }
  return [...new Set(directories)];
}

function chooseTargetPath(mediaFile, filesClaimingEachTarget) {
  const fileName = path.basename(mediaFile.path);

  for (const directory of directoriesToTryFor(mediaFile)) {
    const candidatePath = path.join(directory, fileName);
    if (candidatePath === mediaFile.path) {
      return { targetPath: candidatePath, placement: PLACEMENT.alreadyInItsDayFolder };
    }

    const fileAlreadyClaimingIt = filesClaimingEachTarget.get(candidatePath);
    if (fileAlreadyClaimingIt !== undefined) {
      const itIsTheSamePhoto = filesHaveIdenticalContents(fileAlreadyClaimingIt.path, mediaFile.path, mediaFile.sizeInBytes);
      if (itIsTheSamePhoto) {
        return { targetPath: candidatePath, placement: PLACEMENT.duplicateOfAFileAlreadySorted };
      }
      continue;
    }

    if (!fs.existsSync(candidatePath)) {
      return { targetPath: candidatePath, placement: PLACEMENT.intoItsDayFolder };
    }
    if (filesHaveIdenticalContents(mediaFile.path, candidatePath, mediaFile.sizeInBytes)) {
      return { targetPath: candidatePath, placement: PLACEMENT.duplicateOfAFileAlreadySorted };
    }
  }
  return { targetPath: null, placement: PLACEMENT.couldNotBePlaced };
}

const byShootingTimeThenSize = (firstFile, secondFile) => {
  if (firstFile.timestamp !== secondFile.timestamp) return firstFile.timestamp < secondFile.timestamp ? -1 : 1;
  if (firstFile.sizeInBytes !== secondFile.sizeInBytes) return firstFile.sizeInBytes - secondFile.sizeInBytes;
  return firstFile.path < secondFile.path ? -1 : 1;
};

export function planPlacements(mediaFiles, {
  destination = null,
  hourTheDayStartsAt = 0,
  layout = '%Y-%m-%d',
  filesystemDateUse = FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime,
} = {}) {
  fillMissingDatesFromTheSameShot(mediaFiles);
  const filesystemDateUseCounts = fillMissingDatesFromTheFilesystem(mediaFiles, filesystemDateUse);

  const filesInShootingOrder = [...mediaFiles].sort(byShootingTimeThenSize);
  for (const mediaFile of filesInShootingOrder) {
    mediaFile.folderName = mediaFile.timestamp === null
      ? UNDATED_FOLDER_NAME
      : formatDayFolder(mediaFile.timestamp, { hourTheDayStartsAt, layout });
    mediaFile.dayFolderPath = path.resolve(destination ?? mediaFile.sortRoot, mediaFile.folderName);
  }
  const namesSplitIntoSubfolders = numberTheFilesThatShareANameWithADifferentPhoto(filesInShootingOrder);

  const filesClaimingEachTarget = new Map();
  const placements = [];

  for (const mediaFile of filesInShootingOrder) {
    const { targetPath, placement } = chooseTargetPath(mediaFile, filesClaimingEachTarget);
    if (targetPath !== null) filesClaimingEachTarget.set(targetPath, mediaFile);

    placements.push({
      sourcePath: mediaFile.path,
      targetPath,
      folderName: mediaFile.folderName,
      timestamp: mediaFile.timestamp,
      dateSource: mediaFile.dateSource,
      sizeInBytes: mediaFile.sizeInBytes,
      fileTimestamp: mediaFile.fileTimestamp,
      placement,
      failureReason: placement === PLACEMENT.couldNotBePlaced
        ? `no free name in the day folder or its first ${MOST_NUMBERED_SUBFOLDERS_IN_A_DAY} subfolders`
        : null,
    });
  }
  return { placements, filesystemDateUseCounts, namesSplitIntoSubfolders };
}

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

export function countPlacements(placements) {
  const countOf = (placement) => placements.filter((entry) => entry.placement === placement).length;
  return {
    placed: countOf(PLACEMENT.intoItsDayFolder),
    alreadyInPlace: countOf(PLACEMENT.alreadyInItsDayFolder),
    duplicates: countOf(PLACEMENT.duplicateOfAFileAlreadySorted),
    failed: countOf(PLACEMENT.couldNotBePlaced),
    emptyDirectoriesRemoved: 0,
    errors: [],
  };
}

export function applyPlacements(placements, { moveInsteadOfCopying = false, directoriesToTidy = [], onFilePlaced = null } = {}) {
  const outcome = {
    placed: 0, alreadyInPlace: 0, duplicates: 0, failed: 0,
    emptyDirectoriesRemoved: 0, errors: [],
  };

  for (const entry of placements) {
    if (entry.placement === PLACEMENT.couldNotBePlaced) {
      outcome.failed++;
      outcome.errors.push(`${entry.sourcePath}: ${entry.failureReason}`);
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
      outcome.errors.push(`${entry.sourcePath}: ${error.code ?? error.message}`);
    }
  }

  if (moveInsteadOfCopying) {
    for (const directory of directoriesToTidy) {
      outcome.emptyDirectoriesRemoved += removeEmptyDirectoriesUnder(path.resolve(directory), true);
    }
  }
  return outcome;
}
