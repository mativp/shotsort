const ISO_BOX_HEADER_BYTES = 8;
const ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES = 16;
const ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS = 1;
const ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END = 0;

export const BYTES_IN_AN_ISO_BOX_SIZE_FIELD = 4;

export function isoBox(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_BYTES);
  header.writeUInt32BE(body.length + ISO_BOX_HEADER_BYTES, 0);
  header.write(boxType, 4, 'latin1');
  return Buffer.concat([header, body]);
}

export function isoBoxWith64BitSize(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES);
  header.writeUInt32BE(ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS, 0);
  header.write(boxType, 4, 'latin1');
  header.writeBigUInt64BE(BigInt(body.length + ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES), 8);
  return Buffer.concat([header, body]);
}

export function isoBoxRunningToTheEndOfTheFile(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_BYTES);
  header.writeUInt32BE(ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END, 0);
  header.write(boxType, 4, 'latin1');
  return Buffer.concat([header, body]);
}

export function isoFullBox(boxType, version, body) {
  return isoBox(boxType, Buffer.concat([Buffer.from([version, 0, 0, 0]), body]));
}
