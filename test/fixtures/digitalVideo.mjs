const DV_BLOCK_MARK = Buffer.from([0x1f, 0x07, 0x00, 0x3f]);
const BYTES_IN_A_DV_BLOCK = 80;
const BLOCKS_IN_A_PRETEND_DV_CLIP = 150;
const DV_AUXILIARY_BLOCK_MARK = 0x50;
const DV_RECORDING_DATE_PACK = 0x62;
const DV_RECORDING_TIME_PACK = 0x63;
const BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS = 3;
const BYTES_PER_DV_PACK = 5;

const asBinaryCodedDecimal = (number) => ((Math.floor(number / 10) << 4) | (number % 10));

export function digitalVideoClip(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const clip = Buffer.alloc(BLOCKS_IN_A_PRETEND_DV_CLIP * BYTES_IN_A_DV_BLOCK);
  DV_BLOCK_MARK.copy(clip, 0);

  const auxiliaryBlockStart = BYTES_IN_A_DV_BLOCK;
  clip[auxiliaryBlockStart] = DV_AUXILIARY_BLOCK_MARK;
  const packAt = (packIndex) =>
    auxiliaryBlockStart + BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS + packIndex * BYTES_PER_DV_PACK;

  // Both packs are written the way a camcorder writes them: the field order runs backwards
  // and the two digits of each number share a byte.
  const datePack = packAt(0);
  clip[datePack] = DV_RECORDING_DATE_PACK;
  clip[datePack + 2] = asBinaryCodedDecimal(day);
  clip[datePack + 3] = asBinaryCodedDecimal(month);
  clip[datePack + 4] = asBinaryCodedDecimal(year % 100);

  const timePack = packAt(1);
  clip[timePack] = DV_RECORDING_TIME_PACK;
  clip[timePack + 2] = asBinaryCodedDecimal(second);
  clip[timePack + 3] = asBinaryCodedDecimal(minute);
  clip[timePack + 4] = asBinaryCodedDecimal(hour);
  return clip;
}
