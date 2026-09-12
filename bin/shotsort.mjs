#!/usr/bin/env node
// Wiring, and the exit code. Every decision this makes is made somewhere else: the command
// line is read in cli/options.mjs, the plan is settled in src/plan.mjs, carried out in
// src/apply.mjs, and worded in cli/report.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WHAT_TO_DO, decideWhatToDo } from '../cli/options.mjs';
import { fileAsItIsPlaced, reportAsJson, reportForATerminal } from '../cli/report.mjs';
import { EXIT_CODE, PROGRAM_NAME, USAGE } from '../cli/usage.mjs';
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

  const outcome = options.dryRun
    ? countPlacements(plan.placements)
    : applyPlan(plan.placements, {
      moveInsteadOfCopying: options.moveInsteadOfCopying,
      directoriesToTidy: directoriesAmong(options.inputPaths),
      onFilePlaced: options.verbose
        ? (entry) => {
          const line = fileAsItIsPlaced(entry, options.moveInsteadOfCopying);
          if (line !== null) out(line);
        }
        : null,
    });

  const report = options.json ? reportAsJson : reportForATerminal;
  report({ plan, outcome, fileCount: candidateFiles.length, options }, { out, error });

  return outcome.failed > 0 ? EXIT_CODE.somethingFailedOrNothingFound : EXIT_CODE.everythingPlaced;
}

function main() {
  process.stdout.on('error', (streamError) => {
    if (streamError.code === BROKEN_PIPE_ERROR_CODE) process.exit(EXIT_CODE.everythingPlaced);
  });

  const commandLineArguments = process.argv.slice(2);
  const decision = decideWhatToDo(commandLineArguments);

  if (decision.whatToDo === WHAT_TO_DO.printUsage) {
    out(USAGE);
    // Asked for the usage, it is a success; shown the usage because nothing was asked of
    // it, the command line was wrong.
    process.exit(commandLineArguments.length === 0 ? EXIT_CODE.badCommandLine : EXIT_CODE.everythingPlaced);
  }
  if (decision.whatToDo === WHAT_TO_DO.printVersion) {
    out(readVersionFromPackageManifest());
    process.exit(EXIT_CODE.everythingPlaced);
  }
  if (decision.whatToDo === WHAT_TO_DO.refuse) {
    error(`${PROGRAM_NAME}: ${decision.problem}\nTry '${PROGRAM_NAME} --help'.`);
    process.exit(EXIT_CODE.badCommandLine);
  }

  process.exit(sort(decision.options));
}

main();
