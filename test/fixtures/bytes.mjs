export const MILLISECONDS_PER_SECOND = 1000;

export const BYTES_OF_PRETEND_VIDEO_DATA = 4096;
export const PRETEND_VIDEO_DATA_FILL_BYTE = 7;

export const bigEndianUInt16 = (value) => { const bytes = Buffer.alloc(2); bytes.writeUInt16BE(value, 0); return bytes; };
export const bigEndianUInt32 = (value) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value, 0); return bytes; };

export const secondsSince1970For = (cameraClock) => {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second) / MILLISECONDS_PER_SECOND;
};

export const PADDING_CHUNK_BODY_BYTES = 1;
