import { secondsSince1970For } from './moments.mjs';

const SIGMA_PROPERTY_SECTION_HEADER_BYTES = 24;
// Sigma's later versions put a second, longer header after the first one; version two
// does not, which keeps the fixture to the part this actually reads.
const SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS = 0x00020000;
const BYTES_PER_SIGMA_PROPERTY_ENTRY = 8;
const BYTES_PER_SIGMA_DIRECTORY_ENTRY = 12;

export function sigmaRawFile(cameraClock) {
  const twoByteWide = (text) => Buffer.from(`${text}\0`, 'utf16le');
  const names = ['CAMMANUF', 'TIME', 'SHUTTER'];
  const values = ['SIGMA', String(secondsSince1970For(cameraClock)), '1/250'];

  const text = [];
  const table = Buffer.alloc(names.length * BYTES_PER_SIGMA_PROPERTY_ENTRY);
  let charactersSoFar = 0;
  names.forEach((name, propertyIndex) => {
    const nameText = twoByteWide(name);
    const valueText = twoByteWide(values[propertyIndex]);
    table.writeUInt32LE(charactersSoFar, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY);
    charactersSoFar += nameText.length / 2;
    table.writeUInt32LE(charactersSoFar, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY + 4);
    charactersSoFar += valueText.length / 2;
    text.push(nameText, valueText);
  });

  const propertyHeader = Buffer.alloc(SIGMA_PROPERTY_SECTION_HEADER_BYTES);
  propertyHeader.write('SECp', 0, 'latin1');
  propertyHeader.writeUInt32LE(1, 4);
  propertyHeader.writeUInt32LE(names.length, 8);
  propertyHeader.writeUInt32LE(0, 12);
  propertyHeader.writeUInt32LE(0, 16);
  propertyHeader.writeUInt32LE(charactersSoFar, 20);
  const propertySection = Buffer.concat([propertyHeader, table, ...text]);

  const fileHeader = Buffer.alloc(64);
  fileHeader.write('FOVb', 0, 'latin1');
  fileHeader.writeUInt32LE(SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS, 4);
  const propertySectionStart = fileHeader.length;

  const directoryEntry = Buffer.alloc(BYTES_PER_SIGMA_DIRECTORY_ENTRY);
  directoryEntry.writeUInt32LE(propertySectionStart, 0);
  directoryEntry.writeUInt32LE(propertySection.length, 4);
  directoryEntry.write('PROP', 8, 'latin1');

  const directoryHeader = Buffer.alloc(12);
  directoryHeader.write('SECd', 0, 'latin1');
  directoryHeader.writeUInt32LE(1, 4);
  directoryHeader.writeUInt32LE(1, 8);
  const directory = Buffer.concat([directoryHeader, directoryEntry]);

  const directoryStart = propertySectionStart + propertySection.length;
  const pointer = Buffer.alloc(4);
  pointer.writeUInt32LE(directoryStart, 0);
  return Buffer.concat([fileHeader, propertySection, directory, pointer]);
}
