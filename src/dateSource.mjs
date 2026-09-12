// Where a file's date came from. Worth keeping because the three sources are trusted
// differently: what the camera wrote inside the file is the truth, a sibling file of the
// same shot is nearly as good, and the filesystem's own date may be no more than the
// moment somebody copied the card.
export const DATE_SOURCE = {
  exifMetadata: 'exif',
  videoHeader: 'video',
  siblingFile: 'sibling',
  fileTimestamp: 'file-timestamp',
};

export const DATES_READ_FROM_INSIDE_THE_FILE = new Set([DATE_SOURCE.exifMetadata, DATE_SOURCE.videoHeader]);
