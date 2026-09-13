import path from 'node:path';
import { PLACEMENT } from '../src/plan.mjs';
import { formatByteSize } from './report.mjs';

const RETURN_TO_THE_START_OF_THE_LINE = '\r';
const ERASE_TO_THE_END_OF_THE_LINE = '\x1b[K';

const MILLISECONDS_BETWEEN_REDRAWS = 100;
const MILLISECONDS_WATCHED_BEFORE_THE_TIME_LEFT_IS_GUESSED = 3000;

const WIDTH_TO_ASSUME_WHEN_THE_TERMINAL_DOES_NOT_SAY = 80;
const SHARE_OF_THE_WIDTH_THE_BAR_TAKES = 1 / 4;
const WIDEST_BAR = 30;
const NARROWEST_BAR = 10;
const GAP_BETWEEN_PARTS = '  ';
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const PERCENT = 100;

const shareDone = ({ filesDone, filesInAll, bytesDone, bytesInAll }) =>
  (bytesInAll > 0 ? bytesDone / bytesInAll : filesDone / filesInAll);

function timeLeftInWords(millisecondsLeft) {
  const secondsLeft = millisecondsLeft / MILLISECONDS_PER_SECOND;
  if (secondsLeft < SECONDS_PER_MINUTE) return 'under a minute left';
  const minutesLeft = Math.round(secondsLeft / SECONDS_PER_MINUTE);
  if (minutesLeft < MINUTES_PER_HOUR) return `about ${minutesLeft} min left`;
  const hoursLeft = Math.floor(minutesLeft / MINUTES_PER_HOUR);
  const minutesPastTheHour = minutesLeft % MINUTES_PER_HOUR;
  return minutesPastTheHour === 0 ? `about ${hoursLeft} h left` : `about ${hoursLeft} h ${minutesPastTheHour} min left`;
}

function barShowing(share, width) {
  const cellsFilled = Math.floor(share * width);
  return `[${'#'.repeat(cellsFilled)}${'.'.repeat(width - cellsFilled)}]`;
}

// The line stops one column short of the edge, because a terminal wraps a line that reaches
// it and a wrapped line can no longer be drawn over. Parts are added in the order they
// matter and the first one that does not fit ends the line, so a shorter part never slips
// into the gap and changes what the line says from one draw to the next.
export function progressLineText(progress, columns) {
  const longestLine = columns - 1;
  const share = shareDone(progress);
  const verbAndShare = `${progress.verb} ${String(Math.floor(share * PERCENT)).padStart(3)}%`;
  const barWidth = Math.min(WIDEST_BAR, Math.floor(columns * SHARE_OF_THE_WIDTH_THE_BAR_TAKES));
  if (barWidth < NARROWEST_BAR) return verbAndShare.slice(0, Math.max(0, longestLine));

  const partsInTheOrderTheyAreKept = [
    `${progress.filesDone} of ${progress.filesInAll} ${progress.filesInAll === 1 ? 'file' : 'files'}`,
    `${formatByteSize(progress.bytesDone)} of ${formatByteSize(progress.bytesInAll)}`,
    progress.millisecondsLeft === null ? null : timeLeftInWords(progress.millisecondsLeft),
    progress.fileBeingWritten,
  ].filter((part) => part !== null);

  let line = `${verbAndShare}${GAP_BETWEEN_PARTS}${barShowing(share, barWidth)}`;
  for (const part of partsInTheOrderTheyAreKept) {
    const longer = `${line}${GAP_BETWEEN_PARTS}${part}`;
    if (longer.length > longestLine) break;
    line = longer;
  }
  return line;
}

export const aProgressLineBelongsOn = (terminal, { quiet, json }) => terminal.isTTY === true && !quiet && !json;

const NO_PROGRESS_LINE = Object.freeze({
  startedOn: () => {},
  bytesWrittenTo: () => {},
  finishedWith: () => {},
  printAbove: (print) => print(),
  finish: () => {},
});

const isWritten = (entry) => entry.placement === PLACEMENT.intoItsDayFolder;

export function progressLineFor(placements, options, terminal, now = Date.now) {
  if (!aProgressLineBelongsOn(terminal, options)) return NO_PROGRESS_LINE;

  const filesToWrite = placements.filter(isWritten);
  const progress = {
    verb: options.moveInsteadOfCopying ? 'moving' : 'copying',
    filesDone: 0,
    filesInAll: filesToWrite.length,
    bytesDone: 0,
    bytesInAll: filesToWrite.reduce((bytesSoFar, entry) => bytesSoFar + entry.sizeInBytes, 0),
    millisecondsLeft: null,
    fileBeingWritten: null,
  };
  let bytesOfTheFilesFinished = 0;
  let firstFileStartedAt = null;
  let lastDrawnAt = Number.NEGATIVE_INFINITY;
  let lineIsShowing = false;

  const guessTheTimeLeft = () => {
    const millisecondsWatched = now() - firstFileStartedAt;
    if (millisecondsWatched < MILLISECONDS_WATCHED_BEFORE_THE_TIME_LEFT_IS_GUESSED || progress.bytesDone === 0) return null;
    return ((progress.bytesInAll - progress.bytesDone) * millisecondsWatched) / progress.bytesDone;
  };

  const redrawIsDue = () => now() - lastDrawnAt >= MILLISECONDS_BETWEEN_REDRAWS;

  const draw = () => {
    progress.millisecondsLeft = guessTheTimeLeft();
    const columns = terminal.columns > 0 ? terminal.columns : WIDTH_TO_ASSUME_WHEN_THE_TERMINAL_DOES_NOT_SAY;
    terminal.write(`${RETURN_TO_THE_START_OF_THE_LINE}${progressLineText(progress, columns)}${ERASE_TO_THE_END_OF_THE_LINE}`);
    lastDrawnAt = now();
    lineIsShowing = true;
  };

  const erase = () => {
    if (lineIsShowing) terminal.write(`${RETURN_TO_THE_START_OF_THE_LINE}${ERASE_TO_THE_END_OF_THE_LINE}`);
    lineIsShowing = false;
  };

  return {
    startedOn: (entry) => {
      if (!isWritten(entry)) return;
      firstFileStartedAt ??= now();
      progress.fileBeingWritten = path.basename(entry.sourcePath);
      if (redrawIsDue()) draw();
    },
    bytesWrittenTo: (_entryBeingWritten, bytesWritten) => {
      progress.bytesDone = bytesOfTheFilesFinished + bytesWritten;
      if (redrawIsDue()) draw();
    },
    finishedWith: (entry) => {
      if (!isWritten(entry)) return;
      progress.filesDone++;
      bytesOfTheFilesFinished += entry.sizeInBytes;
      progress.bytesDone = bytesOfTheFilesFinished;
    },
    printAbove: (print) => {
      if (!lineIsShowing) {
        print();
        return;
      }
      erase();
      print();
      draw();
    },
    finish: erase,
  };
}
