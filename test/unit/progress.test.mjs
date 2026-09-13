import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT } from '../../src/plan.mjs';
import { aProgressLineBelongsOn, progressLineFor, progressLineText } from '../../cli/progress.mjs';
import { asThisPlatformSpellsIt } from '../support/inMemory.mjs';

const BYTES_IN_A_MEGABYTE = 1024 * 1024;

const theBarIn = (line) => line.match(/\[[#.]*\]/)?.[0] ?? null;

const partWayThroughACopy = {
  verb: 'copying', filesDone: 1, filesInAll: 4,
  bytesDone: 3 * BYTES_IN_A_MEGABYTE, bytesInAll: 8 * BYTES_IN_A_MEGABYTE,
  millisecondsLeft: null, fileBeingWritten: 'P1000002.JPG',
};

test('the progress line says how far the copy has got', async (context) => {
  await context.test('part way through a copy the line gives the share done, the bar, the files, the bytes and the file', () => assert.equal(
    progressLineText(partWayThroughACopy, 120),
    'copying  37%  [###########...................]  1 of 4 files  3.0 MB of 8.0 MB  P1000002.JPG',
  ));
  await context.test('the share is of the bytes rather than the files, a big file being a long wait', () => assert.ok(
    progressLineText({ ...partWayThroughACopy, filesDone: 1, filesInAll: 2, bytesDone: 3, bytesInAll: 4 }, 120)
      .startsWith('copying  75%'),
  ));
  await context.test('and of the files when every file is empty, there being no bytes to go by', () => assert.ok(
    progressLineText({ ...partWayThroughACopy, filesDone: 1, filesInAll: 2, bytesDone: 0, bytesInAll: 0 }, 120)
      .startsWith('copying  50%'),
  ));
  await context.test('it does not say 100% until the last byte is written', () => assert.ok(
    progressLineText({ ...partWayThroughACopy, bytesDone: 999, bytesInAll: 1000 }, 120).startsWith('copying  99%'),
  ));
  await context.test('one file is not called files', () => assert.ok(
    progressLineText({ ...partWayThroughACopy, filesDone: 0, filesInAll: 1 }, 120).includes('0 of 1 file '),
  ));

  const timeLeftSaid = (seconds) =>
    progressLineText({ ...partWayThroughACopy, millisecondsLeft: seconds * 1000 }, 200)
      .split('  ').find((part) => part.endsWith(' left'));
  const timesLeftAndWhatIsSaid = [
    ['a time left under a minute is not given to the second', 59, 'under a minute left'],
    ['a minute on the dot is a minute', 60, 'about 1 min left'],
    ['a longer time is given to the nearest minute', 10 * 60 + 29, 'about 10 min left'],
    ['an hour on the dot is an hour', 60 * 60, 'about 1 h left'],
    ['and a longer time still in hours and minutes', 125 * 60, 'about 2 h 5 min left'],
  ];
  for (const [whatShouldBeSaid, seconds, words] of timesLeftAndWhatIsSaid) {
    await context.test(whatShouldBeSaid, () => assert.equal(timeLeftSaid(seconds), words));
  }

  const withTheTimeLeft = { ...partWayThroughACopy, millisecondsLeft: 10 * 60 * 1000 };
  await context.test('the bar keeps its width when the time left joins the line, so it does not jump about', () => assert.equal(
    theBarIn(progressLineText(withTheTimeLeft, 120)),
    theBarIn(progressLineText(partWayThroughACopy, 120)),
  ));

  const wrapped = [];
  for (let columns = 1; columns <= 200; columns++) {
    const line = progressLineText(withTheTimeLeft, columns);
    if (line.length > columns - 1) wrapped.push(`${columns} columns: ${line.length} characters`);
  }
  await context.test('at every width the line stops short of the last column, where a terminal would wrap it',
    () => assert.deepEqual(wrapped, []));

  const fillingAllButTheLastColumn = progressLineText(withTheTimeLeft, 109);
  await context.test('a line filling every column but the last is kept whole', () => assert.ok(
    fillingAllButTheLastColumn.length === 108 && fillingAllButTheLastColumn.endsWith('P1000002.JPG'),
    String(fillingAllButTheLastColumn),
  ));
  await context.test('on a narrower terminal the file name gives way before the time left', () => assert.ok(
    progressLineText(withTheTimeLeft, 100).endsWith('about 10 min left'),
    String(progressLineText(withTheTimeLeft, 100)),
  ));
  await context.test('and once one part does not fit, a shorter one after it is not slipped into the gap', () => assert.ok(
    progressLineText(withTheTimeLeft, 88).endsWith('3.0 MB of 8.0 MB'),
    String(progressLineText(withTheTimeLeft, 88)),
  ));
  await context.test('narrower still, only the bar and the share are left',
    () => assert.equal(progressLineText(partWayThroughACopy, 40), 'copying  37%  [###.......]'));
  await context.test('and with no room for a bar at all, just the share',
    () => assert.equal(progressLineText(partWayThroughACopy, 39), 'copying  37%'));
});

const copying = { moveInsteadOfCopying: false, quiet: false, json: false };

const aPlacementOf = (fileName, sizeInBytes, placement = PLACEMENT.intoItsDayFolder) =>
  ({ sourcePath: asThisPlatformSpellsIt(`/card/DCIM/${fileName}`), sizeInBytes, placement });

function aTerminalWatching({ isTTY = true, columns = 120 } = {}) {
  const written = [];
  return { isTTY, columns, written, write: (text) => written.push(text) };
}

test('the progress line is only drawn where someone is watching', async (context) => {
  await context.test('a progress line belongs on a terminal',
    () => assert.equal(aProgressLineBelongsOn({ isTTY: true }, copying), true));
  await context.test('but not on a pipe or a file, which do not call themselves terminals',
    () => assert.equal(aProgressLineBelongsOn({ isTTY: undefined }, copying), false));
  await context.test('nor under --quiet, which promises nothing but errors',
    () => assert.equal(aProgressLineBelongsOn({ isTTY: true }, { ...copying, quiet: true }), false));
  await context.test('nor under --json, which promises a machine everything it prints',
    () => assert.equal(aProgressLineBelongsOn({ isTTY: true }, { ...copying, json: true }), false));

  const photo = aPlacementOf('P1.JPG', BYTES_IN_A_MEGABYTE);
  const printedAnyway = [];
  for (const [whereItWouldGo, terminal, options] of [
    ['a pipe', aTerminalWatching({ isTTY: false }), copying],
    ['a terminal under --quiet', aTerminalWatching(), { ...copying, quiet: true }],
  ]) {
    const progress = progressLineFor([photo], options, terminal, () => 0);
    progress.startedOn(photo);
    progress.bytesWrittenTo(photo, BYTES_IN_A_MEGABYTE);
    progress.printAbove(() => printedAnyway.push(whereItWouldGo));
    progress.finishedWith(photo);
    progress.finish();
    await context.test(`nothing at all is written to ${whereItWouldGo}`, () => assert.deepEqual(terminal.written, []));
  }
  await context.test('while a --verbose line printed around it still gets printed',
    () => assert.equal(printedAnyway.length, 2));

  const nothingToWrite = aTerminalWatching();
  const duplicate = aPlacementOf('P2.JPG', BYTES_IN_A_MEGABYTE, PLACEMENT.duplicateOfAFileAlreadySorted);
  const progressOverDuplicates = progressLineFor([duplicate], copying, nothingToWrite, () => 0);
  const printedForTheDuplicate = [];
  progressOverDuplicates.startedOn(duplicate);
  progressOverDuplicates.printAbove(() => printedForTheDuplicate.push('skipped'));
  progressOverDuplicates.finishedWith(duplicate);
  progressOverDuplicates.finish();
  await context.test('and nothing is drawn for a plan that writes no file, even as --verbose names each duplicate it skips', () => assert.ok(
    nothingToWrite.written.length === 0 && printedForTheDuplicate.length === 1,
    nothingToWrite.written.join(),
  ));
});

const RETURN_TO_THE_START_OF_THE_LINE = '\r';

const ERASE_TO_THE_END_OF_THE_LINE = '\x1b[K';

const THE_LINE_TAKEN_DOWN = `${RETURN_TO_THE_START_OF_THE_LINE}${ERASE_TO_THE_END_OF_THE_LINE}`;

const linesDrawnOn = (terminal) => terminal.written
  .filter((text) => text !== THE_LINE_TAKEN_DOWN)
  .map((text) => text.slice(RETURN_TO_THE_START_OF_THE_LINE.length, -ERASE_TO_THE_END_OF_THE_LINE.length));

const lastLineDrawnOn = (terminal) => linesDrawnOn(terminal).at(-1);

const A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME = Date.UTC(2026, 7, 27, 9, 0, 0);

const MILLISECONDS_IN_A_SECOND = 1000;

function aClockStoppedAtTheStart() {
  const clock = { now: A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME };
  return {
    now: () => clock.now,
    moveTo: (millisecondsIn) => {
      clock.now = A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME + millisecondsIn;
    },
  };
}

test('the progress line as the files go by', async (context) => {
  const clock = aClockStoppedAtTheStart();
  const terminal = aTerminalWatching();
  const photos = ['P1.JPG', 'P2.JPG', 'P3.JPG', 'P4.JPG'].map((fileName) => aPlacementOf(fileName, 4 * BYTES_IN_A_MEGABYTE));
  const alreadyThere = aPlacementOf('P0.JPG', 4 * BYTES_IN_A_MEGABYTE, PLACEMENT.alreadyInItsDayFolder);
  const progress = progressLineFor([alreadyThere, ...photos], copying, terminal, clock.now);

  progress.startedOn(alreadyThere);
  progress.finishedWith(alreadyThere);
  await context.test('a file already in place draws nothing, taking no time to place',
    () => assert.deepEqual(terminal.written, []));

  progress.startedOn(photos[0]);
  await context.test('the first file to be written is drawn the moment it starts, bytes counted only for what is written', () => assert.equal(
    lastLineDrawnOn(terminal),
    'copying   0%  [..............................]  0 of 4 files  0 B of 16.0 MB  P1.JPG',
  ));
  await context.test('drawn over whatever the line held, from its start to its end', () => assert.ok(
    terminal.written[0].startsWith(RETURN_TO_THE_START_OF_THE_LINE) && terminal.written[0].endsWith(ERASE_TO_THE_END_OF_THE_LINE),
  ));

  clock.moveTo(99);
  progress.finishedWith(photos[0]);
  progress.startedOn(photos[1]);
  await context.test('a file starting less than a tenth of a second after the last redraw is not drawn again',
    () => assert.equal(terminal.written.length, 1));

  clock.moveTo(100);
  progress.finishedWith(photos[1]);
  progress.startedOn(photos[2]);
  await context.test('a tenth of a second on, the next file redraws it, counting the files finished', () => assert.equal(
    lastLineDrawnOn(terminal),
    'copying  50%  [###############...............]  2 of 4 files  8.0 MB of 16.0 MB  P3.JPG',
  ));

  progress.finishedWith(photos[2]);
  clock.moveTo(2999);
  progress.printAbove(() => {});
  await context.test('with less than three seconds watched it makes no guess at the time left',
    () => assert.ok(!lastLineDrawnOn(terminal).includes('left'), String(lastLineDrawnOn(terminal))));
  clock.moveTo(3000);
  progress.printAbove(() => {});
  await context.test('at three seconds it guesses from the rate so far: 12 MB in three seconds leaves one for the last 4 MB', () => assert.ok(
    lastLineDrawnOn(terminal).endsWith('12.0 MB of 16.0 MB  under a minute left  P3.JPG'),
    String(lastLineDrawnOn(terminal)),
  ));

  progress.startedOn(photos[3]);
  progress.finishedWith(photos[3]);
  progress.finish();
  await context.test('when the files are done the line is taken down, leaving the terminal as it found it',
    () => assert.equal(terminal.written.at(-1), THE_LINE_TAKEN_DOWN));
  const writesSoFar = terminal.written.length;
  progress.finish();
  await context.test('and taking it down twice writes nothing more',
    () => assert.equal(terminal.written.length, writesSoFar));

  const firstClipClock = aClockStoppedAtTheStart();
  const firstClipTerminal = aTerminalWatching();
  const firstClip = aPlacementOf('P1000001.MOV', 4000 * BYTES_IN_A_MEGABYTE);
  const firstClipProgress = progressLineFor([firstClip], copying, firstClipTerminal, firstClipClock.now);
  firstClipProgress.startedOn(firstClip);
  firstClipClock.moveTo(5 * MILLISECONDS_IN_A_SECOND);
  firstClipProgress.printAbove(() => {});
  await context.test('nor does it guess while nothing has been written yet, however long that has taken',
    () => assert.ok(!lastLineDrawnOn(firstClipTerminal).includes('left'), String(lastLineDrawnOn(firstClipTerminal))));

  const slowClock = aClockStoppedAtTheStart();
  const slowTerminal = aTerminalWatching();
  const photo = aPlacementOf('P1.JPG', 500 * BYTES_IN_A_MEGABYTE);
  const longClip = aPlacementOf('P1000001.MOV', 3500 * BYTES_IN_A_MEGABYTE);
  const slowProgress = progressLineFor([photo, longClip], copying, slowTerminal, slowClock.now);
  slowProgress.startedOn(photo);
  slowClock.moveTo(10 * MILLISECONDS_IN_A_SECOND);
  slowProgress.finishedWith(photo);
  slowProgress.startedOn(longClip);
  await context.test('the time left is the bytes still to come at the rate so far: 3500 MB at 50 MB a second is about a minute',
    () => assert.ok(lastLineDrawnOn(slowTerminal).includes('about 1 min left'), String(lastLineDrawnOn(slowTerminal))));

  const clipClock = aClockStoppedAtTheStart();
  const clipTerminal = aTerminalWatching();
  const bigClip = aPlacementOf('P1000001.MOV', 4000 * BYTES_IN_A_MEGABYTE);
  const nextPhoto = aPlacementOf('P1000002.JPG', 8 * BYTES_IN_A_MEGABYTE);
  const clipProgress = progressLineFor([bigClip, nextPhoto], copying, clipTerminal, clipClock.now);
  clipProgress.startedOn(bigClip);
  clipClock.moveTo(99);
  clipProgress.bytesWrittenTo(bigClip, 100 * BYTES_IN_A_MEGABYTE);
  await context.test('bytes of a big file written less than a tenth of a second after the last redraw do not draw again',
    () => assert.equal(linesDrawnOn(clipTerminal).length, 1));
  clipClock.moveTo(100);
  clipProgress.bytesWrittenTo(bigClip, 1000 * BYTES_IN_A_MEGABYTE);
  await context.test('a tenth of a second on, the bytes written so far move the line on while the file is still being written', () => assert.equal(
    lastLineDrawnOn(clipTerminal),
    'copying  24%  [#######.......................]  0 of 2 files  1000.0 MB of 3.9 GB  P1000001.MOV',
  ));
  clipClock.moveTo(3000);
  clipProgress.bytesWrittenTo(bigClip, 2000 * BYTES_IN_A_MEGABYTE);
  await context.test('and the time left is guessed from them: 2000 MB in three seconds leaves about three seconds for the rest', () => assert.ok(
    lastLineDrawnOn(clipTerminal).includes('under a minute left'),
    String(lastLineDrawnOn(clipTerminal)),
  ));
  clipProgress.finishedWith(bigClip);
  clipClock.moveTo(3100);
  clipProgress.startedOn(nextPhoto);
  await context.test('once the file is finished its bytes are counted once, not again on top of what was reported', () => assert.ok(
    lastLineDrawnOn(clipTerminal).includes('1 of 2 files  3.9 GB of 3.9 GB'),
    String(lastLineDrawnOn(clipTerminal)),
  ));

  for (const [howItFailsToSay, columns] of [['gives no width', undefined], ['says it is no columns wide', 0]]) {
    const unmeasuredTerminal = { ...aTerminalWatching(), columns };
    const moving = progressLineFor([photo], { ...copying, moveInsteadOfCopying: true }, unmeasuredTerminal, clock.now);
    moving.startedOn(photo);
    const drawn = lastLineDrawnOn(unmeasuredTerminal);
    await context.test(`a terminal that ${howItFailsToSay} is taken to be 80 columns, and a move says it is moving`, () => assert.ok(
      drawn.startsWith('moving ') && drawn.length < 80 && theBarIn(drawn)?.length === 80 / 4 + '[]'.length,
      String(drawn),
    ));
  }

  const whatHappened = [];
  const orderedTerminal = {
    isTTY: true, columns: 100,
    write: (text) => whatHappened.push(text === THE_LINE_TAKEN_DOWN ? 'taken down' : 'drawn'),
  };
  const verbose = progressLineFor([photo], copying, orderedTerminal, clock.now);
  verbose.printAbove(() => whatHappened.push('printed'));
  verbose.startedOn(photo);
  verbose.printAbove(() => whatHappened.push('printed'));
  verbose.finish();
  await context.test('a --verbose line is printed as it is while no progress line is up, and the line steps aside for it once one is',
    () => assert.equal(whatHappened.join(', '), 'printed, drawn, taken down, printed, drawn, taken down'));
});
