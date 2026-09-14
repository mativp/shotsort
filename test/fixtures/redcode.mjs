import { PADDING_CHUNK_BODY_BYTES } from './filler.mjs';

const REDCODE_MARK = 'RED';
const BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK = 4;
const BYTES_IN_A_PRETEND_REDCODE_HEADER = 0x44;
const REDCODE_FIRST_TIMECODE_RECORD = 0x1000;
const REDCODE_WHEN_IT_WAS_SHOT_RECORD = 0x1005;
const REDCODE_FILLER_RECORD = 0x1019;
const BYTES_IN_A_REDCODE_RECORD_HEADER = 4;
const BYTES_IN_A_REDCODE_TIMECODE = 11;
const SHORTEST_REDCODE_DIRECTORY_WORTH_TRUSTING = 300;
export const BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY = 0x22;
const WHERE_THE_RECORD_COUNTS_ARE = 0x40;

export function redcodeRecord(recordNumber, value) {
  const header = Buffer.alloc(BYTES_IN_A_REDCODE_RECORD_HEADER);
  header.writeUInt16BE(BYTES_IN_A_REDCODE_RECORD_HEADER + value.length, 0);
  header.writeUInt16BE(recordNumber, 2);
  return Buffer.concat([header, value]);
}

export function redcodeRunOfDigits(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const twoDigits = (number) => String(number).padStart(2, '0');
  return `${year}${twoDigits(month)}${twoDigits(day)}${twoDigits(hour)}${twoDigits(minute)}${twoDigits(second)}`;
}

export const redcodeTimecodeRecord = () => redcodeRecord(REDCODE_FIRST_TIMECODE_RECORD, Buffer.alloc(BYTES_IN_A_REDCODE_TIMECODE));
export const redcodeWhenItWasShotRecord = (cameraClock) =>
  redcodeRecord(REDCODE_WHEN_IT_WAS_SHOT_RECORD, Buffer.from(`${redcodeRunOfDigits(cameraClock)}\0`, 'latin1'));
export const redcodeFillerRecords = (howMany, bodyBytes = PADDING_CHUNK_BODY_BYTES) =>
  Array.from({ length: howMany }, () => redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(bodyBytes)));

// A directory shorter than the length worth trusting is what a camera whose header
// arithmetic does not hold looks like: the reader has to find the directory by looking
// for the record that begins it rather than by counting to it. Padding it out makes the
// arithmetic hold.
function directoryOf(records, padToALengthWorthTrusting, declaredLength) {
  const soFar = records.reduce((total, record) => total + record.length, 0);
  const padding = padToALengthWorthTrusting
    ? [redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(SHORTEST_REDCODE_DIRECTORY_WORTH_TRUSTING - soFar - BYTES_IN_A_REDCODE_RECORD_HEADER))]
    : [];
  const directory = Buffer.concat([...records, ...padding]);
  const howLongTheDirectoryIs = Buffer.alloc(2);
  howLongTheDirectoryIs.writeUInt16BE(declaredLength ?? directory.length);
  return Buffer.concat([howLongTheDirectoryIs, directory]);
}

// The first version keeps its directory a fixed distance into the block after the header,
// so whatever is put before the directory has to fill that distance exactly; the second
// keeps it in the header block, after as many image, audio and extra records as the header
// counts, and whatever is put before the directory stands in for those.
export function redcodeClipHolding(records, {
  version = '2', padToALengthWorthTrusting = true, bytesBeforeTheDirectory = null,
  recordCountsInTheHeader = [0, 0, 0], recordsAfterTheDirectory = [], blockSize = null, declaredDirectoryLength = null,
} = {}) {
  const header = Buffer.alloc(BYTES_IN_A_PRETEND_REDCODE_HEADER);
  header.write(`${REDCODE_MARK}${version}`, BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK, 'latin1');
  recordCountsInTheHeader.forEach((count, index) => { header[WHERE_THE_RECORD_COUNTS_ARE + index] = count; });
  const directory = Buffer.concat([
    directoryOf(records, padToALengthWorthTrusting, declaredDirectoryLength), ...recordsAfterTheDirectory,
  ]);

  if (version === '1') {
    header.writeUInt32BE(blockSize ?? header.length, 0);
    return Buffer.concat([
      header, bytesBeforeTheDirectory ?? Buffer.alloc(BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY), directory,
    ]);
  }

  const block = Buffer.concat([header, bytesBeforeTheDirectory ?? Buffer.alloc(0), directory]);
  block.writeUInt32BE(blockSize ?? block.length, 0);
  return block;
}

export const redcodeClip = (cameraClock, { headerSaysWhereTheDirectoryIs = true, version = '2' } = {}) => redcodeClipHolding(
  [redcodeTimecodeRecord(), redcodeWhenItWasShotRecord(cameraClock)],
  { version, padToALengthWorthTrusting: headerSaysWhereTheDirectoryIs },
);

const RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH = 300;

export const redcodeClipBuriedUnderMoreRecordsThanAreWalked = (cameraClock) => redcodeClipHolding([
  redcodeTimecodeRecord(), ...redcodeFillerRecords(RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH), redcodeWhenItWasShotRecord(cameraClock),
], { padToALengthWorthTrusting: false });
