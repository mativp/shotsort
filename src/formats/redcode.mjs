// Redcode, off a RED cinema camera. The file is a chain of length-prefixed blocks; the
// first names the version, and one of the early ones holds a directory of numbered
// records. The record numbered 0x1005 is the moment the take was shot, written as one run
// of digits.
//
// Where the directory begins is worked out from the counts in the header, and checked
// before it is trusted: the same record this is looking for begins the directory, so when
// the arithmetic gives something that is not a directory, the directory is found by
// looking for it. exiftool does the same, for the same reason -- the layout is not
// published and the arithmetic does not hold for every camera.
import { readBytesAt, readTextAt, readUInt8At, readUInt16At, readUInt32At } from '../bytes.mjs';
import { cameraClockFrom, onlyIfPlausible } from '../clock.mjs';

const REDCODE_MARK = 'RED';
const BYTES_FROM_FILE_START_TO_THE_MARK = 4;
const REDCODE_VERSIONS = ['1', '2'];
const SHORTEST_REDCODE_BLOCK = 8;

const RECORD_HOLDING_THE_FIRST_TIMECODE = 0x1000;
const RECORD_HOLDING_WHEN_IT_WAS_SHOT = 0x1005;
const BYTES_IN_A_RECORD_HEADER = 4;
const SHORTEST_DIRECTORY_WORTH_TRUSTING = 300;
const LONGEST_DIRECTORY_WORTH_TRUSTING = 2048;
const MOST_RECORDS_A_REAL_DIRECTORY_HAS = 256;
const BYTES_WORTH_SEARCHING_FOR_THE_DIRECTORY = 0x10000;
const LONGEST_DATE_RECORD_IN_BYTES = 32;

const WHERE_A_SECOND_VERSION_DIRECTORY_WOULD_START = 0x44;
const HOW_MANY_IMAGE_RECORDS_ARE_AT = 0x40;
const HOW_MANY_AUDIO_RECORDS_ARE_AT = 0x41;
const HOW_MANY_EXTRA_RECORDS_ARE_AT = 0x42;
const BYTES_PER_IMAGE_RECORD = 0x18;
const BYTES_PER_AUDIO_RECORD = 0x14;
const BYTES_PER_EXTRA_RECORD = 0x10;
const WHERE_A_FIRST_VERSION_DIRECTORY_STARTS = 0x22;

const WHEN_IT_WAS_SHOT_PATTERN = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/;

const redcodeVersionIn = (byteSource) => {
  const markAndVersion = readTextAt(byteSource, BYTES_FROM_FILE_START_TO_THE_MARK, REDCODE_MARK.length + 1);
  if (markAndVersion === null || !markAndVersion.startsWith(REDCODE_MARK)) return null;
  const version = markAndVersion.slice(REDCODE_MARK.length);
  return REDCODE_VERSIONS.includes(version) ? version : null;
};

export const startsWithARedcodeMark = (byteSource) => redcodeVersionIn(byteSource) !== null;

// The first record of a directory is the timecode one, and its header is the same four
// bytes every time: a length of fifteen and a number of 0x1000.
function lookForTheDirectory(byteSource, searchStart) {
  const window = readBytesAt(byteSource, searchStart, BYTES_WORTH_SEARCHING_FOR_THE_DIRECTORY)
    ?? readBytesAt(byteSource, searchStart, Math.max(byteSource.sizeInBytes - searchStart, 0));

  const firstRecordHeader = Buffer.alloc(BYTES_IN_A_RECORD_HEADER);
  firstRecordHeader.writeUInt16BE(0x000f, 0);
  firstRecordHeader.writeUInt16BE(RECORD_HOLDING_THE_FIRST_TIMECODE, 2);
  const foundAt = window.indexOf(firstRecordHeader);
  return foundAt < 0 ? null : searchStart + foundAt;
}

function whereTheDirectoryBegins(byteSource, blockStart, blockSize, version) {
  if (version === '1') {
    const secondBlockStart = blockStart + blockSize;
    return { start: secondBlockStart + WHERE_A_FIRST_VERSION_DIRECTORY_STARTS, secondBlockStart };
  }

  const countAt = (position) => readUInt8At(byteSource, blockStart + position) ?? 0;
  const start = blockStart + WHERE_A_SECOND_VERSION_DIRECTORY_WOULD_START
    + countAt(HOW_MANY_IMAGE_RECORDS_ARE_AT) * BYTES_PER_IMAGE_RECORD
    + countAt(HOW_MANY_AUDIO_RECORDS_ARE_AT) * BYTES_PER_AUDIO_RECORD
    + countAt(HOW_MANY_EXTRA_RECORDS_ARE_AT) * BYTES_PER_EXTRA_RECORD;
  return { start, secondBlockStart: blockStart };
}

function whenItWasShotInDirectory(byteSource, directoryStart, directoryEnd) {
  let recordStart = directoryStart;
  for (let recordIndex = 0; recordIndex < MOST_RECORDS_A_REAL_DIRECTORY_HAS; recordIndex++) {
    if (recordStart + BYTES_IN_A_RECORD_HEADER > directoryEnd) return null;
    const recordLength = readUInt16At(byteSource, recordStart, false);
    const recordNumber = readUInt16At(byteSource, recordStart + 2, false);
    const aRecordWasThereHoldingItsHeader = recordLength >= BYTES_IN_A_RECORD_HEADER;
    if (!aRecordWasThereHoldingItsHeader) return null;

    if (recordNumber === RECORD_HOLDING_WHEN_IT_WAS_SHOT) {
      const digits = readTextAt(byteSource, recordStart + BYTES_IN_A_RECORD_HEADER,
        Math.min(recordLength - BYTES_IN_A_RECORD_HEADER, LONGEST_DATE_RECORD_IN_BYTES));
      const parts = WHEN_IT_WAS_SHOT_PATTERN.exec(digits);
      if (parts !== null) {
        return onlyIfPlausible(cameraClockFrom(
          Number(parts[1]), Number(parts[2]), Number(parts[3]),
          Number(parts[4]), Number(parts[5]), Number(parts[6]),
        ));
      }
    }
    recordStart += recordLength;
  }
  return null;
}

export function readCameraClockFromRedcode(byteSource) {
  const version = redcodeVersionIn(byteSource);
  if (version === null) return null;

  const blockSize = readUInt32At(byteSource, 0, false);
  if (blockSize < SHORTEST_REDCODE_BLOCK) return null;

  const { start, secondBlockStart } = whereTheDirectoryBegins(byteSource, 0, blockSize, version);
  const declaredLength = readUInt16At(byteSource, start, false);
  const theArithmeticHeld = declaredLength >= SHORTEST_DIRECTORY_WORTH_TRUSTING
    && declaredLength < LONGEST_DIRECTORY_WORTH_TRUSTING
    && start + 2 + declaredLength <= byteSource.sizeInBytes;

  if (theArithmeticHeld) {
    const found = whenItWasShotInDirectory(byteSource, start + 2, start + 2 + declaredLength);
    if (found !== null) return found;
  }

  return whenItWasShotInDirectory(byteSource, lookForTheDirectory(byteSource, secondBlockStart), byteSource.sizeInBytes);
}
