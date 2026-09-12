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

const SHORT_OPTIONS_THAT_TAKE_A_VALUE = new Set(['s', 'd']);

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

function parseEveryArgument(commandLineArguments, options) {
  let everythingLeftIsAPath = false;
  let argumentIndex = 0;

  const nextArgumentAsValue = (optionName) => {
    argumentIndex++;
    if (argumentIndex >= commandLineArguments.length) throw new TheCommandLineWasWrong(`option '${optionName}' needs a value`);
    return commandLineArguments[argumentIndex];
  };

  const applyShortOption = (letter) => {
    if (letter === 'n') options.dryRun = true;
    else if (letter === 'm') options.moveInsteadOfCopying = true;
    else if (letter === 'v') options.verbose = true;
    else if (letter === 'q') options.quiet = true;
    else if (letter === 'd') options.destination = nextArgumentAsValue('-d');
    else if (letter === 's') options.inputPaths.push(nextArgumentAsValue('-s'));
    else if (letter === 'h') throw new NothingToDoButPrint(printTheUsageInFull());
    else if (letter === 'V') throw new NothingToDoButPrint(printVersion());
    else throw new TheCommandLineWasWrong(`unrecognised option '-${letter}'`);
  };

  const applyClusteredShortOptions = (cluster) => {
    const letters = cluster.slice(1);
    for (let position = 0; position < letters.length; position++) {
      const letter = letters[position];
      const isTheLastLetter = position === letters.length - 1;
      if (SHORT_OPTIONS_THAT_TAKE_A_VALUE.has(letter) && !isTheLastLetter) {
        throw new TheCommandLineWasWrong(
          `option '-${letter}' takes a value, so it has to be the last letter of '${cluster}'`,
        );
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
    else if (optionName === '--help') throw new NothingToDoButPrint(printTheUsageInFull());
    else if (optionName === '--version') throw new NothingToDoButPrint(printVersion());
    else throw new TheCommandLineWasWrong(`unrecognised option '${optionName}'`);
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
}

// The refusal a first run is likeliest to hit, so it answers the question it raises:
// what does naming a folder look like? The folder you are already standing in still has
// to be spelled out, and '.' is not obvious to everyone, which is why it leads.
const NAME_THE_FOLDER_TO_SORT = `name the folder to sort, for example:
  ${PROGRAM_NAME} .             the folder you are standing in
  ${PROGRAM_NAME} ~/Import      a folder named in full`;

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
