#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanForMediaFiles,
  planPlacements,
  applyPlacements,
  countPlacements,
  UNDATED_FOLDER_NAME,
  PLACEMENT,
  FILESYSTEM_DATE_USE,
} from '../src/sort.mjs';
import { DATE_SOURCE } from '../src/date.mjs';

const PROGRAM_NAME = 'lumix-sort';

const EXIT_CODE = {
  everythingPlaced: 0,
  somethingFailedOrNothingFound: 1,
  badCommandLine: 2,
};

const DEFAULT_LAYOUT = '%Y-%m-%d';
const EARLIEST_HOUR_A_DAY_MAY_START_AT = 0;
const LATEST_HOUR_A_DAY_MAY_START_AT = 12;
const LAYOUT_MUST_CONTAIN_A_DATE_ESCAPE = /%[YmdF]/;
const BYTE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const BYTES_PER_UNIT_STEP = 1024;
const FILE_COUNT_COLUMN_WIDTH = 5;
const BYTE_SIZE_COLUMN_WIDTH = 10;
const BROKEN_PIPE_ERROR_CODE = 'EPIPE';
const SHORT_OPTIONS_THAT_TAKE_A_VALUE = new Set(['s', 'd']);

const USAGE = `Usage: ${PROGRAM_NAME} [OPTION]... FOLDER...

Sort photos and video into one folder per shooting day, using the date the
camera recorded inside each file. Files are copied, never moved, unless you
ask for --move, so the originals survive a mistake.

Every file is examined and its destination decided before anything is written,
so nothing moves until the whole plan is settled. --dry-run prints that plan.

The FOLDER to sort always has to be named: ${PROGRAM_NAME} run with no arguments
prints this text and sorts nothing, and it never falls back to the folder you
happen to be standing in.

  -s, --source FOLDER   the folder to sort. The same as naming it without a
                        flag, and worth spelling out whenever --dest is used
                        too, so it is plain which folder is read and which is
                        written. May be given more than once
  -d, --dest FOLDER     put the day folders in FOLDER instead of inside the
                        source folder. With copying left as the default, this
                        builds a sorted library and leaves the source exactly
                        as it came off the card
  -n, --dry-run         print the plan and change nothing. The plan shown is
                        the one that would be carried out, computed by the
                        same code
  -m, --move            move the files rather than copying them, leaving each
                        source folder empty and then removing it. Without this
                        the originals are left exactly where they are, so the
                        source folder ends up holding both them and the sorted
                        copies unless --dest sends the copies elsewhere

      --layout FORMAT   how to name each day folder. %Y is the year, %m the
                        month, %d the day, and %F all three joined by dashes.
                        A slash makes a subfolder, so --layout '%Y/%F' gives
                        2026/2026-08-27. Must be a relative path holding at
                        least one date escape. Default: ${DEFAULT_LAYOUT}
      --day-start HOUR  the hour at which one shooting day becomes the next.
                        The default, ${EARLIEST_HOUR_A_DAY_MAY_START_AT}, turns the day at midnight, so a wedding
                        shot from 20:00 on the 27th until 01:30 on the 28th is
                        split between 2026-08-27 and 2026-08-28. --day-start 4
                        turns the day at 04:00 instead, filing everything shot
                        before 04:00 under the previous day, so that whole
                        night lands in 2026-08-27 together. An hour from
                        ${EARLIEST_HOUR_A_DAY_MAY_START_AT} to ${LATEST_HOUR_A_DAY_MAY_START_AT}

Every file is filed under the clock the camera was set to when it was taken,
stills and video alike, so the folder a file lands in never depends on where
the computer sorting it happens to be. For video that means preferring a clock
the camera spelled a timezone out for -- the user data Canon and Nikon write,
Apple's creation date, the thumbnail Canon stores beside the clip -- and only
then the movie header, which some makers write in UTC and others in local time.

AVCHD clips and HLG photos record no date this can read. The only date left for
those is the one the filesystem keeps, which is the real shooting time when the
copy off the card preserved it, and meaningless when it did not, because cp
without -p replaces it with the moment of the copy.
So by default the filesystem date is used for such a file only when it still
looks like a shooting time, and the file goes to ${UNDATED_FOLDER_NAME}/ when it does not.
These two settle it by hand instead:

      --use-filesystem-date
                        date every file that records no date inside itself by
                        the date the filesystem keeps, without checking that
                        date first
      --ignore-filesystem-date
                        date none of them that way: every file that records no
                        date inside itself goes to ${UNDATED_FOLDER_NAME}/

  -v, --verbose         print every file as it is placed, as
                        "source -> destination". Files already in the right
                        place are not printed
  -q, --quiet           print nothing but errors
      --json            print the plan and the result as JSON on standard
                        output: every file with the folder chosen for it, the
                        clock the date came from, and what was done
  -h, --help            print this text and exit, exactly as running
                        ${PROGRAM_NAME} with no arguments does
  -V, --version         print the version and exit

Short options may be run together: -nv is -n -v. A -- argument ends option
parsing.

Reads JPEG, TIFF, MPO, HEIF and AVIF stills; DNG and the raw of Panasonic
(RW2), Canon (CR2, CR3, CRW), Nikon (NEF, NRW), Sony (ARW, ARQ, SR2), Olympus
and OM System (ORF), Fujifilm (RAF), Pentax (PEF), Minolta (MRW) and Sigma
(X3F); and MP4, MOV, M4V, 3GP, MTS, M2TS, AVI and the clips action cameras and
drones write. A Canon THM sidecar dates the clip beside it, as does a JPEG on
another card slot when only one shot on the card goes by that name.

Nothing is ever overwritten. When one day holds two different photos with the
same file name, as happens when a card's numbering wraps or two card folders
are copied together, each goes into a numbered subfolder of that day instead:
2026-09-01/01/A9999.RW2 for the earlier one, 2026-09-01/02/A9999.RW2 for the
later. Names that clash with nothing stay directly in the day folder, and a
file already sitting where it belongs is left alone.

Exit status:
  ${EXIT_CODE.everythingPlaced}   every file was placed
  ${EXIT_CODE.somethingFailedOrNothingFound}   some files were not placed, or none were found
  ${EXIT_CODE.badCommandLine}   the command line was wrong, naming no folder to sort included, so
      running ${PROGRAM_NAME} with no arguments at all prints this text and exits ${EXIT_CODE.badCommandLine}

Examples:
  ${PROGRAM_NAME} -s ~/Import -d ~/Pictures/2026
        Read ~/Import and build the sorted day folders under ~/Pictures/2026,
        leaving ~/Import exactly as it came off the card. This is the usual
        way to run it.

  ${PROGRAM_NAME} -n -s ~/Import -d ~/Pictures/2026
        Print what that would do, and do none of it.

  ${PROGRAM_NAME} ~/Import
        Sort ~/Import in place. Day folders appear inside it holding copies,
        and the originals stay in DCIM, so the folder briefly holds both.

  ${PROGRAM_NAME} -m ~/Import
        The same, moving the files rather than copying them, so nothing is
        duplicated and the emptied DCIM folders are removed afterwards.

  ${PROGRAM_NAME} .
        Sort the folder you are standing in.

  ${PROGRAM_NAME} --layout '%Y/%F' ~/Import
        Sort ~/Import into 2026/2026-08-27 rather than 2026-08-27.

  ${PROGRAM_NAME} --day-start 4 ~/Import
        Sort ~/Import, keeping shots taken after midnight with the evening
        they belong to.

  ${PROGRAM_NAME} -v -m ~/Import
        Sort ~/Import, printing every file as it moves.
`;

function exitWithUsageError(problem) {
  console.error(`${PROGRAM_NAME}: ${problem}\nTry '${PROGRAM_NAME} --help'.`);
  process.exit(EXIT_CODE.badCommandLine);
}

function readVersionFromPackageManifest() {
  const binDirectory = path.dirname(fileURLToPath(import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(path.join(binDirectory, '..', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function printUsageAndExit(exitCode) {
  console.log(USAGE);
  process.exit(exitCode);
}

function printVersionAndExit() {
  console.log(readVersionFromPackageManifest());
  process.exit(EXIT_CODE.everythingPlaced);
}

function parseCommandLine(commandLineArguments) {
  const options = {
    inputPaths: [],
    dryRun: false,
    moveInsteadOfCopying: false,
    destination: null,
    layout: DEFAULT_LAYOUT,
    hourTheDayStartsAt: 0,
    filesystemDateUse: FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime,
    verbose: false,
    quiet: false,
    json: false,
  };

  let everythingLeftIsAPath = false;
  let argumentIndex = 0;

  const nextArgumentAsValue = (optionName) => {
    argumentIndex++;
    if (argumentIndex >= commandLineArguments.length) exitWithUsageError(`option '${optionName}' needs a value`);
    return commandLineArguments[argumentIndex];
  };

  const applyShortOption = (letter) => {
    if (letter === 'n') options.dryRun = true;
    else if (letter === 'm') options.moveInsteadOfCopying = true;
    else if (letter === 'v') options.verbose = true;
    else if (letter === 'q') options.quiet = true;
    else if (letter === 'd') options.destination = nextArgumentAsValue('-d');
    else if (letter === 's') options.inputPaths.push(nextArgumentAsValue('-s'));
    else if (letter === 'h') printUsageAndExit(EXIT_CODE.everythingPlaced);
    else if (letter === 'V') printVersionAndExit();
    else exitWithUsageError(`unrecognised option '-${letter}'`);
  };

  const applyClusteredShortOptions = (cluster) => {
    const letters = cluster.slice(1);
    for (let position = 0; position < letters.length; position++) {
      const letter = letters[position];
      const isTheLastLetter = position === letters.length - 1;
      if (SHORT_OPTIONS_THAT_TAKE_A_VALUE.has(letter) && !isTheLastLetter) {
        exitWithUsageError(`option '-${letter}' takes a value, so it has to be the last letter of '${cluster}'`);
      }
      applyShortOption(letter);
    }
  };

  const applyLongOption = (optionName) => {
    if (optionName === '--dry-run') options.dryRun = true;
    else if (optionName === '--move') options.moveInsteadOfCopying = true;
    else if (optionName === '--verbose') options.verbose = true;
    else if (optionName === '--quiet') options.quiet = true;
    else if (optionName === '--json') options.json = true;
    else if (optionName === '--use-filesystem-date') options.filesystemDateUse = FILESYSTEM_DATE_USE.always;
    else if (optionName === '--ignore-filesystem-date') options.filesystemDateUse = FILESYSTEM_DATE_USE.never;
    else if (optionName === '--dest') options.destination = nextArgumentAsValue(optionName);
    else if (optionName === '--source') options.inputPaths.push(nextArgumentAsValue(optionName));
    else if (optionName === '--layout') options.layout = nextArgumentAsValue(optionName);
    else if (optionName === '--day-start') options.hourTheDayStartsAt = Number(nextArgumentAsValue(optionName));
    else if (optionName === '--help') printUsageAndExit(EXIT_CODE.everythingPlaced);
    else if (optionName === '--version') printVersionAndExit();
    else exitWithUsageError(`unrecognised option '${optionName}'`);
  };

  for (; argumentIndex < commandLineArguments.length; argumentIndex++) {
    const argument = commandLineArguments[argumentIndex];

    if (everythingLeftIsAPath || !argument.startsWith('-')) {
      options.inputPaths.push(argument);
    } else if (argument === '--') {
      everythingLeftIsAPath = true;
    } else if (argument.startsWith('--')) {
      applyLongOption(argument);
    } else {
      applyClusteredShortOptions(argument);
    }
  }
  return validatedOptions(options);
}

function validatedOptions(options) {
  const dayStartIsAnHour = Number.isInteger(options.hourTheDayStartsAt)
    && options.hourTheDayStartsAt >= EARLIEST_HOUR_A_DAY_MAY_START_AT
    && options.hourTheDayStartsAt <= LATEST_HOUR_A_DAY_MAY_START_AT;
  if (!dayStartIsAnHour) {
    exitWithUsageError(
      `--day-start must be an hour from ${EARLIEST_HOUR_A_DAY_MAY_START_AT} to ${LATEST_HOUR_A_DAY_MAY_START_AT}`,
    );
  }

  const layoutIsARelativeFolderName = !path.isAbsolute(options.layout)
    && !options.layout.split(/[\\/]/).includes('..')
    && LAYOUT_MUST_CONTAIN_A_DATE_ESCAPE.test(options.layout);
  if (!layoutIsARelativeFolderName) {
    exitWithUsageError('--layout must be a relative folder name using %Y, %m, %d or %F');
  }

  if (options.verbose && options.quiet) {
    exitWithUsageError('--verbose and --quiet contradict each other');
  }
  const noFolderToSort = options.inputPaths.length === 0;
  if (noFolderToSort) {
    exitWithUsageError(`name the folder to sort, for example: ${PROGRAM_NAME} ~/Import`);
  }
  return options;
}

function formatByteSize(byteCount) {
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

function printFolderSummary(placements) {
  const foldersInOrder = summariseByFolder(placements);
  const widestFolderName = Math.max(...foldersInOrder.map(([folderName]) => folderName.length));

  for (const [folderName, summary] of foldersInOrder) {
    const filesystemTimeMark = summary.filesDatedByFilesystemTime > 0 ? '~' : ' ';
    const fileWord = summary.fileCount === 1 ? 'file ' : 'files';
    console.log(
      `${folderName.padEnd(widestFolderName)} ${filesystemTimeMark} `
      + `${String(summary.fileCount).padStart(FILE_COUNT_COLUMN_WIDTH)} ${fileWord} `
      + `${formatByteSize(summary.totalBytes).padStart(BYTE_SIZE_COLUMN_WIDTH)}`,
    );
  }
}

function printOutcomeLine(outcome, options) {
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const placedVerb = options.dryRun
    ? `to ${options.moveInsteadOfCopying ? 'move' : 'copy'}`
    : options.moveInsteadOfCopying ? 'moved' : 'copied';

  const parts = [`${outcome.placed} ${placedVerb}`];
  if (outcome.alreadyInPlace > 0) parts.push(`${outcome.alreadyInPlace} already in place`);
  if (outcome.duplicates > 0) {
    const duplicateVerb = options.dryRun
      ? (options.moveInsteadOfCopying ? 'to drop' : 'to skip')
      : options.moveInsteadOfCopying ? 'dropped' : 'skipped';
    parts.push(`${plural(outcome.duplicates, 'duplicate')} ${duplicateVerb}`);
  }
  if (outcome.emptyDirectoriesRemoved > 0) {
    parts.push(`${plural(outcome.emptyDirectoriesRemoved, 'empty folder')} removed`);
  }
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);

  console.log(`${parts.join(', ')}${options.dryRun ? '  (dry run)' : ''}`);
}

function printFilesystemDateNotes(counts) {
  if (counts.filesDatedByTheFilesystem > 0) {
    console.error(
      `${PROGRAM_NAME}: ~ marks days holding ${counts.filesDatedByTheFilesystem} file(s) that record no date `
      + 'inside themselves, filed by their filesystem date',
    );
  }
  if (counts.filesLeftUndated > 0) {
    console.error(
      `${PROGRAM_NAME}: ${counts.filesLeftUndated} file(s) record no date inside themselves and their filesystem `
      + `date looks like the moment of a copy rather than a shooting time, so they went to ${UNDATED_FOLDER_NAME}/. `
      + "Re-copy the card with 'ditto', 'cp -p' or 'rsync -a' to keep the real times, or pass "
      + '--use-filesystem-date to take them as they are.',
    );
  }
}

function printSubfolderNote(namesSplitIntoSubfolders) {
  if (namesSplitIntoSubfolders === 0) return;
  const namePlural = namesSplitIntoSubfolders === 1 ? 'name is' : 'names are';
  console.error(
    `${PROGRAM_NAME}: ${namesSplitIntoSubfolders} file ${namePlural} used by more than one photo on the same day; `
    + 'each photo went into a numbered subfolder of that day, oldest first',
  );
}

function printJson(placements, outcome, fileCount, options) {
  console.log(JSON.stringify({
    actions: placements.map((entry) => ({
      src: entry.sourcePath,
      target: entry.targetPath,
      folder: entry.folderName,
      stamp: entry.timestamp,
      dateFrom: entry.dateSource,
      size: entry.sizeInBytes,
      verdict: entry.placement,
      error: entry.failureReason,
    })),
    summary: { ...outcome, found: fileCount, dryRun: options.dryRun },
  }, null, 2));
}

function printFileAsItIsPlaced(entry, moveInsteadOfCopying) {
  if (entry.placement === PLACEMENT.intoItsDayFolder) {
    console.log(`${entry.sourcePath} -> ${entry.targetPath}`);
  } else if (entry.placement === PLACEMENT.duplicateOfAFileAlreadySorted) {
    const whatHappenedToIt = moveInsteadOfCopying ? 'dropped' : 'skipped';
    console.log(`${entry.sourcePath} -> ${whatHappenedToIt}, already at ${entry.targetPath}`);
  }
}

function directoriesAmong(inputPaths) {
  return inputPaths.filter((inputPath) => {
    try {
      return fs.statSync(inputPath).isDirectory();
    } catch {
      return false;
    }
  });
}

function main() {
  process.stdout.on('error', (error) => {
    if (error.code === BROKEN_PIPE_ERROR_CODE) process.exit(EXIT_CODE.everythingPlaced);
  });

  const commandLineArguments = process.argv.slice(2);
  if (commandLineArguments.length === 0) printUsageAndExit(EXIT_CODE.badCommandLine);

  const options = parseCommandLine(commandLineArguments);
  const inputPaths = options.inputPaths;

  let mediaFiles;
  try {
    mediaFiles = scanForMediaFiles(inputPaths);
  } catch (error) {
    console.error(`${PROGRAM_NAME}: ${error.path ?? ''}: ${error.code ?? error.message}`);
    process.exit(EXIT_CODE.somethingFailedOrNothingFound);
  }

  if (mediaFiles.length === 0) {
    if (options.json) printJson([], countPlacements([]), 0, options);
    else console.error(`${PROGRAM_NAME}: no photos or video found`);
    process.exit(EXIT_CODE.somethingFailedOrNothingFound);
  }

  const { placements, filesystemDateUseCounts, namesSplitIntoSubfolders } = planPlacements(mediaFiles, {
    destination: options.destination === null ? null : path.resolve(options.destination),
    hourTheDayStartsAt: options.hourTheDayStartsAt,
    layout: options.layout,
    filesystemDateUse: options.filesystemDateUse,
  });

  const outcome = options.dryRun
    ? countPlacements(placements)
    : applyPlacements(placements, {
      moveInsteadOfCopying: options.moveInsteadOfCopying,
      directoriesToTidy: directoriesAmong(inputPaths),
      onFilePlaced: options.verbose ? (entry) => printFileAsItIsPlaced(entry, options.moveInsteadOfCopying) : null,
    });

  if (options.json) {
    printJson(placements, outcome, mediaFiles.length, options);
    process.exit(outcome.failed > 0 ? EXIT_CODE.somethingFailedOrNothingFound : EXIT_CODE.everythingPlaced);
  }

  if (!options.quiet && !options.verbose) printFolderSummary(placements);
  if (!options.quiet) printOutcomeLine(outcome, options);

  printFilesystemDateNotes(filesystemDateUseCounts);
  printSubfolderNote(namesSplitIntoSubfolders);
  for (const errorText of outcome.errors) console.error(`${PROGRAM_NAME}: ${errorText}`);

  process.exit(outcome.failed > 0 ? EXIT_CODE.somethingFailedOrNothingFound : EXIT_CODE.everythingPlaced);
}

main();
