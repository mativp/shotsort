const DV_BLOCK_MARK = Buffer.from([0x1f, 0x07, 0x00, 0x3f]);
const BYTES_IN_A_DV_BLOCK = 80;
const BLOCKS_IN_A_PRETEND_DV_CLIP = 150;
export const DV_AUXILIARY_BLOCK_MARK = 0x50;
const DV_RECORDING_DATE_PACK = 0x62;
const DV_RECORDING_TIME_PACK = 0x63;
const BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS = 3;

export const asBinaryCodedDecimal = (number) => ((Math.floor(number / 10) << 4) | (number % 10));

// A pack is its kind and four bytes, and both date and time packs write their fields
// backwards, with the two digits of each number sharing a byte.
export const dvPack = (packKind, fields) => Buffer.from([packKind, ...fields]);

export function dvRecordingDatePack(cameraClock) {
  const [year, month, day] = cameraClock.split(/[-: ]/).map(Number);
  return dvPack(DV_RECORDING_DATE_PACK, [0, asBinaryCodedDecimal(day), asBinaryCodedDecimal(month), asBinaryCodedDecimal(year % 100)]);
}

export function dvRecordingTimePack(cameraClock) {
  const [, , , hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  return dvPack(DV_RECORDING_TIME_PACK, [0, asBinaryCodedDecimal(second), asBinaryCodedDecimal(minute), asBinaryCodedDecimal(hour)]);
}

export const dvRecordingDatePackOfBytes = (dayByte, monthByte, yearByte) => dvPack(DV_RECORDING_DATE_PACK, [0, dayByte, monthByte, yearByte]);
export const dvRecordingTimePackOfBytes = (secondByte, minuteByte, hourByte) => dvPack(DV_RECORDING_TIME_PACK, [0, secondByte, minuteByte, hourByte]);

// The blocks given follow the first, each a kind and the packs written into it one after
// another; the clip's own mark is always the first block.
export function digitalVideoClipHolding(blocksAfterTheFirst, { mark = DV_BLOCK_MARK } = {}) {
  const clip = Buffer.alloc(BLOCKS_IN_A_PRETEND_DV_CLIP * BYTES_IN_A_DV_BLOCK);
  mark.copy(clip, 0);
  blocksAfterTheFirst.forEach(({ kind = DV_AUXILIARY_BLOCK_MARK, packs = [] }, index) => {
    const blockStart = (index + 1) * BYTES_IN_A_DV_BLOCK;
    clip[blockStart] = kind;
    Buffer.concat(packs).copy(clip, blockStart + BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS);
  });
  return clip;
}

export const digitalVideoClip = (cameraClock) =>
  digitalVideoClipHolding([{ packs: [dvRecordingDatePack(cameraClock), dvRecordingTimePack(cameraClock)] }]);
