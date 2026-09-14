// A ByteSource is the only way the format readers touch bytes. Two of them exist:
// one over an open file descriptor, for real work, and one over a Buffer, so a parser
// can be tested against bytes a camera would write without those bytes reaching a disk.
import fs from 'node:fs';

const isAPlaceInAFile = (position) => Number.isInteger(position) && position >= 0;

export function byteSourceForFileDescriptor(fileDescriptor, sizeInBytes) {
  return {
    sizeInBytes,
    readInto: (buffer, position, byteCount) =>
      (isAPlaceInAFile(position) ? fs.readSync(fileDescriptor, buffer, 0, byteCount, position) : 0),
  };
}

export function byteSourceForBuffer(buffer) {
  return {
    sizeInBytes: buffer.length,
    readInto: (into, position, byteCount) =>
      (isAPlaceInAFile(position) ? buffer.subarray(position, position + byteCount).copy(into) : 0),
  };
}

export function openFileAsByteSource(filePath, sizeInBytes) {
  const fileDescriptor = fs.openSync(filePath, 'r');
  return {
    ...byteSourceForFileDescriptor(fileDescriptor, sizeInBytes),
    close: () => fs.closeSync(fileDescriptor),
  };
}

export const readBytesAt = (byteSource, position, byteCount) => {
  const buffer = Buffer.alloc(byteCount);
  const bytesRead = byteSource.readInto(buffer, position, byteCount);
  return bytesRead === byteCount ? buffer : null;
};

export const readAtMostBytesAt = (byteSource, position, byteCount) => {
  const buffer = Buffer.alloc(byteCount);
  const bytesRead = byteSource.readInto(buffer, position, byteCount);
  return bytesRead === 0 ? null : buffer.subarray(0, bytesRead);
};

export const readTextAt = (byteSource, position, byteCount) =>
  readBytesAt(byteSource, position, byteCount)?.toString('latin1') ?? null;

export const readTwoByteWideTextAt = (byteSource, position, byteCount) =>
  readAtMostBytesAt(byteSource, position, byteCount)?.toString('utf16le').split('\0')[0] ?? null;

export const readUInt8At = (byteSource, position) => readBytesAt(byteSource, position, 1)?.[0] ?? null;

export const readUInt16At = (byteSource, position, isLittleEndian) => {
  const bytes = readBytesAt(byteSource, position, 2);
  if (bytes === null) return null;
  return isLittleEndian ? bytes.readUInt16LE() : bytes.readUInt16BE();
};

export const readUInt32At = (byteSource, position, isLittleEndian) => {
  const bytes = readBytesAt(byteSource, position, 4);
  if (bytes === null) return null;
  return isLittleEndian ? bytes.readUInt32LE() : bytes.readUInt32BE();
};

export const readUInt64At = (byteSource, position) => {
  const bytes = readBytesAt(byteSource, position, 8);
  return bytes === null ? null : Number(bytes.readBigUInt64BE());
};

export const readUInt64EitherWayRoundAt = (byteSource, position, isLittleEndian) => {
  const bytes = readBytesAt(byteSource, position, 8);
  if (bytes === null) return null;
  return Number(isLittleEndian ? bytes.readBigUInt64LE() : bytes.readBigUInt64BE());
};

export const BYTES_IN_A_SHORT_FIELD = 4;
export const BYTES_IN_A_LONG_FIELD = 8;

export function readUnsignedOfWidthAt(byteSource, position, byteCount) {
  if (byteCount === 0) return 0;
  if (byteCount === BYTES_IN_A_SHORT_FIELD) return readUInt32At(byteSource, position, false);
  if (byteCount === BYTES_IN_A_LONG_FIELD) return readUInt64At(byteSource, position);
  return null;
}
