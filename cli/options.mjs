// Reading the command line, and only that: nothing here prints or exits. What the program
// should do comes back as a value, so every branch of the parser can be checked without
// starting a process.
import {
  DEFAULT_LAYOUT, EARLIEST_HOUR_A_DAY_MAY_START_AT, LATEST_HOUR_A_DAY_MAY_START_AT,
  LAYOUT_MUST_BE, layoutIsUsable,
} from '../src/clock.mjs';
import { FILESYSTEM_DATE_USE } from '../src/dating.mjs';
import { PROGRAM_NAME } from './usage.mjs';

export const WHAT_TO_DO = {
  sort: 'sort',
  // Two, because being asked for the usage and being given nothing to do are different
  // questions: the first wants the manual, the second wants to know what this is.
  printTheUsageInBrief: 'print the usage in brief',
  printTheUsageInFull: 'print the usage in full',
  printVersion: 'print version',
  refuse: 'refuse',
};

const sort = (options) => ({ whatToDo: WHAT_TO_DO.sort, options });
const printTheUsageInBrief = () => ({ whatToDo: WHAT_TO_DO.printTheUsageInBrief });
const printTheUsageInFull = () => ({ whatToDo: WHAT_TO_DO.printTheUsageInFull });
const printVersion = () => ({ whatToDo: WHAT_TO_DO.printVersion });
const refuse = (problem) => ({ whatToDo: WHAT_TO_DO.refuse, problem });

class TheCommandLineWasWrong extends Error {
  constructor(problem) {
    super(problem);
    this.problem = problem;
  }
}

class NothingToDoButPrint extends Error {
  constructor(result) {
    super('nothing to do but print');
    this.result = result;
  }
}

export const OPTIONS = [
  { short: '-s', long: '--source', takes: 'FOLDER', apply: (options, folder) => options.inputPaths.push(folder) },
  { short: '-d', long: '--dest', takes: 'FOLDER', apply: (options, folder) => { options.destination = folder; } },
  { short: '-n', long: '--dry-run', apply: (options) => { options.dryRun = true; } },
  { short: '-m', long: '--move', apply: (options) => { options.moveInsteadOfCopying = true; } },
  { long: '--layout', takes: 'FORMAT', apply: (options, layout) => { options.layout = layout; } },
  { long: '--day-start', takes: 'HOUR', apply: (options, hour) => { options.hourTheDayStartsAt = Number(hour); } },
  {
    long: '--use-filesystem-date',
    apply: (options) => { options.filesystemDateUse = FILESYSTEM_DATE_USE.always; },
  },
  {
    long: '--ignore-filesystem-date',
    apply: (options) => { options.filesystemDateUse = FILESYSTEM_DATE_USE.never; },
  },
  { short: '-v', long: '--verbose', apply: (options) => { options.verbose = true; } },
  { short: '-q', long: '--quiet', apply: (options) => { options.quiet = true; } },
  { long: '--json', apply: (options) => { options.json = true; } },
  { short: '-h', long: '--help', apply: () => { throw new NothingToDoButPrint(printTheUsageInFull()); } },
  { short: '-V', long: '--version', apply: () => { throw new NothingToDoButPrint(printVersion()); } },
];

const optionNamed = (name) => OPTIONS.find((option) => option.short === name || option.long === name);

function parseEveryArgument(commandLineArguments, options) {
  let everythingLeftIsAPath = false;
  let argumentIndex = 0;

  const applyOption = (nameAsTyped) => {
    const option = optionNamed(nameAsTyped);
    if (option === undefined) throw new TheCommandLineWasWrong(`unrecognised option '${nameAsTyped}'`);
    if (option.takes === undefined) {
      option.apply(options);
      return;
    }
    argumentIndex++;
    if (argumentIndex >= commandLineArguments.length) throw new TheCommandLineWasWrong(`option '${nameAsTyped}' needs a value`);
    option.apply(options, commandLineArguments[argumentIndex]);
  };

  const applyClusteredShortOptions = (cluster) => {
    const letters = cluster.slice(1);
    for (let position = 0; position < letters.length; position++) {
      const shortName = `-${letters[position]}`;
      const isTheLastLetter = position === letters.length - 1;
      if (optionNamed(shortName)?.takes !== undefined && !isTheLastLetter) {
        throw new TheCommandLineWasWrong(
          `option '${shortName}' takes a value, so it has to be the last letter of '${cluster}'`,
        );
      }
      applyOption(shortName);
    }
  };

  for (; argumentIndex < commandLineArguments.length; argumentIndex++) {
    const argument = commandLineArguments[argumentIndex];

    if (everythingLeftIsAPath || !argument.startsWith('-')) {
      options.inputPaths.push(argument);
    } else if (argument === '--') {
      everythingLeftIsAPath = true;
    } else if (argument.startsWith('--')) {
      applyOption(argument);
    } else {
      applyClusteredShortOptions(argument);
    }
  }
}

// The refusal a first run is likeliest to hit, so it answers the question it raises:
// what does naming a folder look like? The folder you are already standing in still has
// to be spelled out, and '.' is not obvious to everyone, which is why it leads.
const NAME_THE_FOLDER_TO_SORT = `name the folder to sort, for example:
  ${PROGRAM_NAME} .            the folder you are standing in
  ${PROGRAM_NAME} ~/Import     a folder named in full`;

function theProblemWith(options) {
  const dayStartIsAnHour = Number.isInteger(options.hourTheDayStartsAt)
    && options.hourTheDayStartsAt >= EARLIEST_HOUR_A_DAY_MAY_START_AT
    && options.hourTheDayStartsAt <= LATEST_HOUR_A_DAY_MAY_START_AT;
  if (!dayStartIsAnHour) {
    return `--day-start must be an hour from ${EARLIEST_HOUR_A_DAY_MAY_START_AT} to ${LATEST_HOUR_A_DAY_MAY_START_AT}`;
  }
  if (!layoutIsUsable(options.layout)) return `--layout must be ${LAYOUT_MUST_BE}`;
  if (options.verbose && options.quiet) return '--verbose and --quiet contradict each other';
  if (options.inputPaths.length === 0) return NAME_THE_FOLDER_TO_SORT;
  return null;
}

export function decideWhatToDo(commandLineArguments) {
  if (commandLineArguments.length === 0) return printTheUsageInBrief();

  const options = {
    inputPaths: [],
    dryRun: false,
    moveInsteadOfCopying: false,
    destination: null,
    layout: DEFAULT_LAYOUT,
    hourTheDayStartsAt: EARLIEST_HOUR_A_DAY_MAY_START_AT,
    filesystemDateUse: FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime,
    verbose: false,
    quiet: false,
    json: false,
  };

  try {
    parseEveryArgument(commandLineArguments, options);
  } catch (error) {
    if (error instanceof NothingToDoButPrint) return error.result;
    if (error instanceof TheCommandLineWasWrong) return refuse(error.problem);
    throw error;
  }

  const problem = theProblemWith(options);
  return problem === null ? sort(options) : refuse(problem);
}
