import { secondsSince1970For } from './moments.mjs';

const SIGMA_PROPERTY_SECTION_HEADER_BYTES = 24;
// Sigma's later versions put a second, longer header after the first one; version two
// does not, which keeps the fixture to the part this actually reads.
const SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS = 0x00020000;
const BYTES_PER_SIGMA_PROPERTY_ENTRY = 8;
const BYTES_PER_SIGMA_DIRECTORY_ENTRY = 12;
const BYTES_IN_THE_FILE_HEADER = 64;

const twoByteWide = (text) => Buffer.from(`${text}\0`, 'utf16le');

export const sigmaCaptureTimeProperty = (cameraClock) => ['TIME', String(secondsSince1970For(cameraClock))];

// Offsets into the text are counted in characters. With an entry hidden at the start of the
// text, the text's first four characters are themselves read as an entry just past the
// table, and point at the first property the table leaves out.
export function sigmaPropertySection(properties, {
  mark = 'SECp', propertiesInTheTable = properties.length, anEntryHiddenAtTheStartOfTheText = false,
} = {}) {
  const hiddenEntryCharacters = anEntryHiddenAtTheStartOfTheText ? 4 : 0;
  const text = [];
  const offsets = [];
  let charactersSoFar = hiddenEntryCharacters;
  for (const [name, value] of properties) {
    const nameText = twoByteWide(name);
    const valueText = twoByteWide(value);
    offsets.push([charactersSoFar, charactersSoFar + nameText.length / 2]);
    charactersSoFar += (nameText.length + valueText.length) / 2;
    text.push(nameText, valueText);
  }
  if (anEntryHiddenAtTheStartOfTheText) {
    const [nameOffset, valueOffset] = offsets[propertiesInTheTable];
    const hiddenEntry = Buffer.alloc(8);
    hiddenEntry.writeUInt32LE(nameOffset, 0);
    hiddenEntry.writeUInt32LE(valueOffset, 4);
    text.unshift(hiddenEntry);
  }

  const table = Buffer.alloc(propertiesInTheTable * BYTES_PER_SIGMA_PROPERTY_ENTRY);
  offsets.slice(0, propertiesInTheTable).forEach(([nameOffset, valueOffset], propertyIndex) => {
    table.writeUInt32LE(nameOffset, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY);
    table.writeUInt32LE(valueOffset, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY + 4);
  });

  const header = Buffer.alloc(SIGMA_PROPERTY_SECTION_HEADER_BYTES);
  header.write(mark, 0, 'latin1');
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(propertiesInTheTable, 8);
  header.writeUInt32LE(charactersSoFar, 20);
  return Buffer.concat([header, table, ...text]);
}

// Each section is laid down in turn after the file header, and the directory after them
// lists each by where it starts, how long it is and its type.
export function sigmaRawFileHolding(sections, { directoryMark = 'SECd', sectionsInTheDirectory = sections.length } = {}) {
  const fileHeader = Buffer.alloc(BYTES_IN_THE_FILE_HEADER);
  fileHeader.write('FOVb', 0, 'latin1');
  fileHeader.writeUInt32LE(SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS, 4);

  let sectionStart = fileHeader.length;
  const entries = sections.map(({ type, bytes }) => {
    const entry = Buffer.alloc(BYTES_PER_SIGMA_DIRECTORY_ENTRY);
    entry.writeUInt32LE(sectionStart, 0);
    entry.writeUInt32LE(bytes.length, 4);
    entry.write(type, 8, 'latin1');
    sectionStart += bytes.length;
    return entry;
  });

  const directoryHeader = Buffer.alloc(12);
  directoryHeader.write(directoryMark, 0, 'latin1');
  directoryHeader.writeUInt32LE(1, 4);
  directoryHeader.writeUInt32LE(sectionsInTheDirectory, 8);

  const pointer = Buffer.alloc(4);
  pointer.writeUInt32LE(sectionStart, 0);
  return Buffer.concat([fileHeader, ...sections.map(({ bytes }) => bytes), directoryHeader, ...entries, pointer]);
}

export const sigmaRawFile = (cameraClock) => sigmaRawFileHolding([{
  type: 'PROP',
  bytes: sigmaPropertySection([['CAMMANUF', 'SIGMA'], sigmaCaptureTimeProperty(cameraClock), ['SHUTTER', '1/250']]),
}]);
