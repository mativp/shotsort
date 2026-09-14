export const bigEndianUInt16 = (value) => { const bytes = Buffer.alloc(2); bytes.writeUInt16BE(value, 0); return bytes; };
export const bigEndianUInt32 = (value) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value, 0); return bytes; };
