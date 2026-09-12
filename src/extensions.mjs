import path from 'node:path';

const STILL_IMAGE_EXTENSIONS = ['.JPG', '.JPEG', '.MPO', '.HSP', '.HIF', '.HEIC', '.AVIF', '.THM'];

const RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY = [
  '.RW2', '.RAW', '.RWL', '.DNG', '.TIF', '.TIFF',
  '.CR2', '.NEF', '.NRW', '.ARW', '.ARQ', '.SR2', '.SRF', '.ORF', '.PEF',
  '.SRW', '.ERF', '.3FR', '.IIQ', '.MOS', '.MEF', '.DCR', '.KDC',
];

const RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN = [
  '.CR3', '.CRM', '.RAF', '.CRW', '.MRW', '.X3F',
];

const VIDEO_EXTENSIONS = [
  '.MP4', '.MOV', '.MTS', '.M2TS', '.AVI',
  '.M4V', '.3GP', '.LRV', '.INSV', '.360',
];

export const MEDIA_FILE_EXTENSIONS = new Set([
  ...STILL_IMAGE_EXTENSIONS,
  ...RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY,
  ...RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN,
  ...VIDEO_EXTENSIONS,
]);

export const hasMediaExtension = (filePath) => MEDIA_FILE_EXTENSIONS.has(path.extname(filePath).toUpperCase());
