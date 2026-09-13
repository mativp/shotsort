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
const BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY = 0x22;

function redcodeRecord(recordNumber, value) {
  const header = Buffer.alloc(BYTES_IN_A_REDCODE_RECORD_HEADER);
  header.writeUInt16BE(BYTES_IN_A_REDCODE_RECORD_HEADER + value.length, 0);
  header.writeUInt16BE(recordNumber, 2);
  return Buffer.concat([header, value]);
}

export function redcodeClip(cameraClock, { headerSaysWhereTheDirectoryIs = true, version = '2' } = {}) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const twoDigits = (number) => String(number).padStart(2, '0');
  const runOfDigits = `${year}${twoDigits(month)}${twoDigits(day)}${twoDigits(hour)}${twoDigits(minute)}${twoDigits(second)}`;

  const records = [
    redcodeRecord(REDCODE_FIRST_TIMECODE_RECORD, Buffer.alloc(BYTES_IN_A_REDCODE_TIMECODE)),
    redcodeRecord(REDCODE_WHEN_IT_WAS_SHOT_RECORD, Buffer.from(`${runOfDigits}\0`, 'latin1')),
  ];
  // A directory shorter than the length worth trusting is what a camera whose header
  // arithmetic does not hold looks like: the reader has to find the directory by looking
  // for the record that begins it rather than by counting to it.
  if (headerSaysWhereTheDirectoryIs) {
    const soFar = records.reduce((total, record) => total + record.length, 0);
    const padding = SHORTEST_REDCODE_DIRECTORY_WORTH_TRUSTING - soFar;
    records.push(redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(padding - BYTES_IN_A_REDCODE_RECORD_HEADER)));
  }

  const directory = Buffer.concat(records);
  const howLongTheDirectoryIs = Buffer.alloc(2);
  howLongTheDirectoryIs.writeUInt16BE(directory.length);

  const header = Buffer.alloc(BYTES_IN_A_PRETEND_REDCODE_HEADER);
  header.write(`${REDCODE_MARK}${version}`, BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK, 'latin1');

  // The first version of the format keeps its directory in a block of its own, a fixed
  // distance into the one after the header; the second keeps it in the header block.
  if (version === '1') {
    header.writeUInt32BE(header.length, 0);
    return Buffer.concat([
      header,
      Buffer.alloc(BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY),
      howLongTheDirectoryIs,
      directory,
    ]);
  }

  const block = Buffer.concat([header, howLongTheDirectoryIs, directory]);
  block.writeUInt32BE(block.length, 0);
  return block;
}

const RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH = 300;

export function redcodeClipBuriedUnderMoreRecordsThanAreWalked(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const twoDigits = (number) => String(number).padStart(2, '0');
  const runOfDigits = `${year}${twoDigits(month)}${twoDigits(day)}${twoDigits(hour)}${twoDigits(minute)}${twoDigits(second)}`;

  const records = [
    redcodeRecord(REDCODE_FIRST_TIMECODE_RECORD, Buffer.alloc(BYTES_IN_A_REDCODE_TIMECODE)),
    ...Array.from({ length: RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH },
      () => redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(PADDING_CHUNK_BODY_BYTES))),
    redcodeRecord(REDCODE_WHEN_IT_WAS_SHOT_RECORD, Buffer.from(`${runOfDigits}\0`, 'latin1')),
  ];

  const directory = Buffer.concat(records);
  const howLongTheDirectoryIs = Buffer.alloc(2);
  howLongTheDirectoryIs.writeUInt16BE(directory.length);

  const header = Buffer.alloc(BYTES_IN_A_PRETEND_REDCODE_HEADER);
  header.write(`${REDCODE_MARK}2`, BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK, 'latin1');
  const block = Buffer.concat([header, howLongTheDirectoryIs, directory]);
  block.writeUInt32BE(block.length, 0);
  return block;
}
