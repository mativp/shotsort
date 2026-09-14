// Deciding where every file goes, and deciding all of it before anything is written. This
// asks the disk only what the probe allows -- whether a path is taken, and whether what is
// there is the same photo -- so the whole plan can be worked out in memory and checked.
import path from 'node:path';
import { DEFAULT_LAYOUT, EARLIEST_HOUR_A_DAY_MAY_START_AT, compareCameraClocks, dayFolderFor } from './clock.mjs';
import { FILESYSTEM_DATE_USE, fillClocksFromTheFilesystem, fillClocksFromTheSameShot } from './dating.mjs';

export const UNDATED_FOLDER_NAME = 'undated';

export const PLACEMENT = {
  intoItsDayFolder: 'place',
  alreadyInItsDayFolder: 'in place',
  duplicateOfAFileAlreadySorted: 'duplicate',
  couldNotBePlaced: 'failed',
};

const MOST_NUMBERED_SUBFOLDERS_IN_A_DAY = 99;
const NUMBERED_SUBFOLDER_PATTERN = /^\d{2}$/;
const numberedSubfolderName = (number) => String(number).padStart(2, '0');

export const NO_FREE_NAME_IN_THE_DAY_FOLDER =
  `no free name in the day folder or its first ${MOST_NUMBERED_SUBFOLDERS_IN_A_DAY} subfolders`;

// Files are placed oldest first so that, where two photos of one day share a name, the
// earlier one takes the lower numbered subfolder. Clocks compare as a total order and a
// file with no clock sorts last, so this ordering is the same every run.
const byShootingTimeThenSize = (firstFile, secondFile) => {
  const byClock = compareCameraClocks(firstFile.clock, secondFile.clock);
  if (byClock !== 0) return byClock;
  if (firstFile.sizeInBytes !== secondFile.sizeInBytes) return firstFile.sizeInBytes - secondFile.sizeInBytes;
  return firstFile.path < secondFile.path ? -1 : 1;
};

const assignDayFolders = (datedFiles, { destination, hourTheDayStartsAt, layout }) =>
  datedFiles.map((datedFile) => {
    const folderName = datedFile.clock === null
      ? UNDATED_FOLDER_NAME
      : dayFolderFor(datedFile.clock, { hourTheDayStartsAt, layout });
    return Object.freeze({
      ...datedFile,
      folderName,
      dayFolderPath: path.resolve(destination ?? datedFile.sortRoot, folderName),
    });
  });

function distinctVariantsAmong(filesSharingADayAndName, probe) {
  const variants = [];
  for (const file of filesSharingADayAndName) {
    const variantHoldingTheSameBytes = variants.find((variant) =>
      variant[0].sizeInBytes === file.sizeInBytes
      && probe.contentsMatch(variant[0].path, file.path, file.sizeInBytes));

    if (variantHoldingTheSameBytes === undefined) variants.push([file]);
    else variantHoldingTheSameBytes.push(file);
  }
  return variants;
}

// Two photos of one day may arrive under one name when a card's numbering wraps or two
// card folders are copied together. Neither may overwrite the other, so each variant takes
// a numbered subfolder of that day. Copies of one photo are not variants and collapse.
function numberTheFilesThatShareANameWithADifferentPhoto(filesInShootingOrder, probe) {
  const filesOfEachDayAndName = new Map();
  for (const file of filesInShootingOrder) {
    const key = `${file.dayFolderPath}\0${path.basename(file.path).toLowerCase()}`;
    const sharingTheKey = filesOfEachDayAndName.get(key) ?? [];
    sharingTheKey.push(file);
    filesOfEachDayAndName.set(key, sharingTheKey);
  }

  const subfolderOfEachFile = new Map();
  let namesSplitIntoSubfolders = 0;

  for (const filesSharingADayAndName of filesOfEachDayAndName.values()) {
    const variants = distinctVariantsAmong(filesSharingADayAndName, probe);
    if (variants.length === 1) continue;

    namesSplitIntoSubfolders++;
    variants.forEach((filesOfOneVariant, variantIndex) => {
      for (const file of filesOfOneVariant) subfolderOfEachFile.set(file.path, variantIndex + 1);
    });
  }

  const numbered = filesInShootingOrder.map((file) => Object.freeze({
    ...file,
    subfolderNumber: subfolderOfEachFile.get(file.path) ?? null,
  }));
  return { numbered, namesSplitIntoSubfolders };
}

// A file already sorted sits either in its day folder or in a numbered subfolder of it,
// and either counts as being where it belongs, so a second run does not nest it deeper.
function subfolderItAlreadySitsIn(filePath, dayFolderPath) {
  const parentDirectory = path.dirname(filePath);
  if (parentDirectory === dayFolderPath) return parentDirectory;

  const parentIsANumberedSubfolderOfTheDay = path.dirname(parentDirectory) === dayFolderPath
    && NUMBERED_SUBFOLDER_PATTERN.test(path.basename(parentDirectory));
  return parentIsANumberedSubfolderOfTheDay ? parentDirectory : null;
}

function directoriesToTryFor(file) {
  const directories = [];
  const whereItAlreadySits = subfolderItAlreadySitsIn(file.path, file.dayFolderPath);
  if (whereItAlreadySits !== null) directories.push(whereItAlreadySits);

  directories.push(file.subfolderNumber === null
    ? file.dayFolderPath
    : path.join(file.dayFolderPath, numberedSubfolderName(file.subfolderNumber)));

  for (let subfolder = 1; subfolder <= MOST_NUMBERED_SUBFOLDERS_IN_A_DAY; subfolder++) {
    directories.push(path.join(file.dayFolderPath, numberedSubfolderName(subfolder)));
  }
  return [...new Set(directories)];
}

function chooseTargetPath(file, filesClaimingEachTarget, probe) {
  const fileName = path.basename(file.path);

  for (const directory of directoriesToTryFor(file)) {
    const candidatePath = path.join(directory, fileName);
    if (candidatePath === file.path) {
      return { targetPath: candidatePath, placement: PLACEMENT.alreadyInItsDayFolder };
    }

    const fileAlreadyClaimingIt = filesClaimingEachTarget.get(candidatePath);
    if (fileAlreadyClaimingIt !== undefined) {
      const itIsTheSamePhoto = probe.contentsMatch(fileAlreadyClaimingIt.path, file.path, file.sizeInBytes);
      if (itIsTheSamePhoto) {
        return { targetPath: candidatePath, placement: PLACEMENT.duplicateOfAFileAlreadySorted };
      }
      continue;
    }

    if (!probe.exists(candidatePath)) {
      return { targetPath: candidatePath, placement: PLACEMENT.intoItsDayFolder };
    }
    if (probe.contentsMatch(file.path, candidatePath, file.sizeInBytes)) {
      return { targetPath: candidatePath, placement: PLACEMENT.duplicateOfAFileAlreadySorted };
    }
  }
  return { targetPath: null, placement: PLACEMENT.couldNotBePlaced };
}

function choosePlacements(filesInShootingOrder, probe) {
  const filesClaimingEachTarget = new Map();

  return filesInShootingOrder.map((file) => {
    const { targetPath, placement } = chooseTargetPath(file, filesClaimingEachTarget, probe);
    filesClaimingEachTarget.set(targetPath, file);

    return Object.freeze({
      sourcePath: file.path,
      targetPath,
      folderName: file.folderName,
      clock: file.clock,
      dateSource: file.dateSource,
      sizeInBytes: file.sizeInBytes,
      fileTimestamp: file.fileTimestamp,
      placement,
      failureReason: placement === PLACEMENT.couldNotBePlaced ? NO_FREE_NAME_IN_THE_DAY_FOLDER : null,
    });
  });
}

export function buildPlan(datedFiles, {
  destination = null,
  hourTheDayStartsAt = EARLIEST_HOUR_A_DAY_MAY_START_AT,
  layout = DEFAULT_LAYOUT,
  filesystemDateUse = FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime,
} = {}, probe) {
  const datedFromSiblings = fillClocksFromTheSameShot(datedFiles);
  const { files, counts: filesystemDateUseCounts } = fillClocksFromTheFilesystem(datedFromSiblings, filesystemDateUse);

  const withDayFolders = assignDayFolders(files, { destination, hourTheDayStartsAt, layout });
  const filesInShootingOrder = [...withDayFolders].sort(byShootingTimeThenSize);
  const { numbered, namesSplitIntoSubfolders } = numberTheFilesThatShareANameWithADifferentPhoto(filesInShootingOrder, probe);

  return {
    placements: choosePlacements(numbered, probe),
    filesystemDateUseCounts,
    namesSplitIntoSubfolders,
  };
}

export function countPlacements(placements) {
  const countOf = (placement) => placements.filter((entry) => entry.placement === placement).length;
  return {
    placed: countOf(PLACEMENT.intoItsDayFolder),
    alreadyInPlace: countOf(PLACEMENT.alreadyInItsDayFolder),
    duplicates: countOf(PLACEMENT.duplicateOfAFileAlreadySorted),
    failed: countOf(PLACEMENT.couldNotBePlaced),
    emptyDirectoriesRemoved: 0,
    failures: [],
  };
}
