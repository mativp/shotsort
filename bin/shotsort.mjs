#!/usr/bin/env node
// Wiring, and the exit code. Every decision this makes is made somewhere else: the command
// line is read in cli/options.mjs, the plan is settled in src/plan.mjs, carried out in
// src/apply.mjs, and worded in cli/report.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WHAT_TO_DO, decideWhatToDo } from '../cli/options.mjs';
import { progressLineFor } from '../cli/progress.mjs';
import { fileAsItIsPlaced, reportAsJson, reportForATerminal } from '../cli/report.mjs';
import { EXIT_CODE, PROGRAM_NAME, USAGE_IN_BRIEF, USAGE_IN_FULL } from '../cli/usage.mjs';
import { applyPlan } from '../src/apply.mjs';
import { readTheClockInsideEachFile } from '../src/dating.mjs';
import { destinationProbeOverTheFilesystem } from '../src/destination.mjs';
import { buildPlan, countPlacements } from '../src/plan.mjs';
import { findMediaFiles } from '../src/scan.mjs';

const BROKEN_PIPE_ERROR_CODE = 'EPIPE';

const out = (line) => console.log(line);
const error = (line) => console.error(line);

function readVersionFromPackageManifest() {
  const binDirectory = path.dirname(fileURLToPath(import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(path.join(binDirectory, '..', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
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

function placeEveryFile(plan, options) {
  const progress = progressLineFor(plan.placements, options, process.stderr);
  try {
    return applyPlan(plan.placements, {
      moveInsteadOfCopying: options.moveInsteadOfCopying,
      directoriesToTidy: directoriesAmong(options.inputPaths),
      onFileStarted: progress.startedOn,
      onBytesWritten: progress.bytesWrittenTo,
      onFileFinished: progress.finishedWith,
      onFilePlaced: options.verbose
        ? (entry) => {
          const line = fileAsItIsPlaced(entry, options.moveInsteadOfCopying);
          if (line !== null) progress.printAbove(() => out(line));
        }
        : null,
    });
  } finally {
    progress.finish();
  }
}

function sort(options) {
  let candidateFiles;
  try {
    candidateFiles = findMediaFiles(options.inputPaths);
  } catch (folderCouldNotBeRead) {
    error(`${PROGRAM_NAME}: ${folderCouldNotBeRead.path ?? ''}: ${folderCouldNotBeRead.code ?? folderCouldNotBeRead.message}`);
    return EXIT_CODE.somethingFailedOrNothingFound;
  }

  const emptyPlan = { placements: [], filesystemDateUseCounts: { filesDatedByTheFilesystem: 0, filesLeftUndated: 0 }, namesSplitIntoSubfolders: 0 };
  if (candidateFiles.length === 0) {
    if (options.json) reportAsJson({ plan: emptyPlan, outcome: countPlacements([]), fileCount: 0, options }, { out });
    else error(`${PROGRAM_NAME}: no photos or video found`);
    return EXIT_CODE.somethingFailedOrNothingFound;
  }

  const probe = destinationProbeOverTheFilesystem();
  const plan = buildPlan(readTheClockInsideEachFile(candidateFiles), {
    destination: options.destination === null ? null : path.resolve(options.destination),
    hourTheDayStartsAt: options.hourTheDayStartsAt,
    layout: options.layout,
    filesystemDateUse: options.filesystemDateUse,
  }, probe);

  const outcome = options.dryRun ? countPlacements(plan.placements) : placeEveryFile(plan, options);

  const report = options.json ? reportAsJson : reportForATerminal;
  report({ plan, outcome, fileCount: candidateFiles.length, options }, { out, error });

  return outcome.failed > 0 ? EXIT_CODE.somethingFailedOrNothingFound : EXIT_CODE.everythingPlaced;
}

// Every way out of here sets the exit code and returns rather than calling process.exit,
// which would cut off whatever console.log has not yet handed to the operating system.
// Standard output is a stream whenever it is not a terminal, and the usage text is longer
// than the buffer that stream holds, so exiting on the spot loses the end of it to
// anything that captures the output rather than showing it.
function main() {
  process.stdout.on('error', (streamError) => {
    // Nobody is reading any more, so there is nothing left to flush and nothing to wait
    // for: this is the one place stopping on the spot is the right thing to do.
    if (streamError.code === BROKEN_PIPE_ERROR_CODE) process.exit(EXIT_CODE.everythingPlaced);
  });

  const decision = decideWhatToDo(process.argv.slice(2));

  // Shown the usage because nothing was asked of it, the command line was wrong; asked
  // for the usage, it is a success. Which of the two texts to print follows from that.
  if (decision.whatToDo === WHAT_TO_DO.printTheUsageInBrief) {
    out(USAGE_IN_BRIEF);
    process.exitCode = EXIT_CODE.badCommandLine;
    return;
  }
  if (decision.whatToDo === WHAT_TO_DO.printTheUsageInFull) {
    out(USAGE_IN_FULL);
    process.exitCode = EXIT_CODE.everythingPlaced;
    return;
  }
  if (decision.whatToDo === WHAT_TO_DO.printVersion) {
    out(readVersionFromPackageManifest());
    process.exitCode = EXIT_CODE.everythingPlaced;
    return;
  }
  if (decision.whatToDo === WHAT_TO_DO.refuse) {
    error(`${PROGRAM_NAME}: ${decision.problem}\nTry '${PROGRAM_NAME} --help'.`);
    process.exitCode = EXIT_CODE.badCommandLine;
    return;
  }

  process.exitCode = sort(decision.options);
}

main();
