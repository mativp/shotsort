import { PADDING_CHUNK_BODY_BYTES } from './filler.mjs';
import { EXIF_HEADER, TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';

const BYTES_IN_A_RIFF_CHUNK_HEADER = 8;
const RIFF_RECORDING_DATE_CHUNK = 'IDIT';
const RIFF_DATE_CREATED_CHUNK = 'ICRD';

export function riffChunk(chunkType, body) {
  const header = Buffer.alloc(BYTES_IN_A_RIFF_CHUNK_HEADER);
  header.write(chunkType, 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  const padToAnEvenLength = body.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, body, padToAnEvenLength]);
}

export function riffList(listType, chunks) {
  return riffChunk('LIST', Buffer.concat([Buffer.from(listType, 'latin1'), ...chunks]));
}

export function riffFile(formType, chunks, { mark = 'RIFF' } = {}) {
  return riffChunk(mark, Buffer.concat([Buffer.from(formType, 'latin1'), ...chunks]));
}

export const riffRecordingDateChunk = (dateWrittenOut) =>
  riffChunk(RIFF_RECORDING_DATE_CHUNK, Buffer.from(`${dateWrittenOut}\n\0`, 'latin1'));

export const riffDateCreatedChunk = (dateWrittenOut) =>
  riffChunk(RIFF_DATE_CREATED_CHUNK, Buffer.from(`${dateWrittenOut}\0`, 'latin1'));

export const riffExifChunk = (dateTimeOriginal, { chunkType = 'EXIF', startsWithTheExifHeader = true } = {}) =>
  riffChunk(chunkType, Buffer.concat([
    Buffer.from(startsWithTheExifHeader ? EXIF_HEADER : '', 'latin1'),
    tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
  ]));

export function riffListsNested(howDeep, chunks) {
  let nested = chunks;
  for (let level = 0; level < howDeep; level++) nested = [riffList('hdrl', nested)];
  return nested;
}

export const riffJunkChunks = (howMany) =>
  Array.from({ length: howMany }, () => riffChunk('JUNK', Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));

export function aviFileRecordingWhenItWasShot(dateWrittenOut) {
  return riffFile('AVI ', [
    riffList('hdrl', [
      riffChunk('avih', Buffer.alloc(56)),
      riffRecordingDateChunk(dateWrittenOut),
    ]),
    riffChunk('movi', Buffer.alloc(64)),
  ]);
}

export function aviFileSayingOnlyWhenItWasCreated(dateWrittenOut) {
  return riffFile('AVI ', [
    riffList('hdrl', [riffChunk('avih', Buffer.alloc(56))]),
    riffList('INFO', [riffDateCreatedChunk(dateWrittenOut)]),
    riffChunk('movi', Buffer.alloc(64)),
  ]);
}

export function webPStill(dateTimeOriginal) {
  return riffFile('WEBP', [
    riffChunk('VP8 ', Buffer.alloc(32)),
    riffExifChunk(dateTimeOriginal),
  ]);
}

const LISTS_NESTED_DEEPER_THAN_A_CAMERA_NESTS_THEM = 6;

export const aviFileNestingItsListsDeeperThanACameraDoes = (dateWrittenOut) => riffFile('AVI ', [
  ...riffListsNested(LISTS_NESTED_DEEPER_THAN_A_CAMERA_NESTS_THEM, [riffRecordingDateChunk(dateWrittenOut)]),
  riffChunk('movi', Buffer.alloc(64)),
]);

const CHUNKS_MORE_THAN_A_RIFF_WALK_LOOKS_THROUGH = 1100;

export const aviFileBuriedUnderMoreChunksThanAreWalked = (dateWrittenOut) => riffFile('AVI ', [
  ...riffJunkChunks(CHUNKS_MORE_THAN_A_RIFF_WALK_LOOKS_THROUGH), riffRecordingDateChunk(dateWrittenOut),
]);
