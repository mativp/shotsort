// Which files are worth opening at all. The lists are grouped by what reads them, so that
// teaching the tool a format and teaching it the names that format goes by are the same
// edit, and so that a name nobody can read is visibly a name nobody can read.
//
// The measure used is exiftool's: every extension it knows as a still or a movie written
// by a camera, a drone, an action camera, a camcorder or a phone. Formats it knows that
// belong to scanners, microscopes, hospitals and design tools are left out on purpose --
// sorting them by shooting day would be sorting something that was never shot.
import path from 'node:path';

const STILL_IMAGE_EXTENSIONS = [
  '.JPG', '.JPEG', '.JPE', '.JPS', '.MPO', '.INSP', '.THM', '.HSP',
  '.HEIC', '.HEIF', '.HIF', '.AVIF', '.JXL',
  '.PNG', '.APNG', '.WEBP',
];

const RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY = [
  '.RW2', '.RAW', '.RWL', '.DNG', '.TIF', '.TIFF',
  '.CR2', '.NEF', '.NRW', '.ARW', '.ARQ', '.SR2', '.SRF', '.ORF', '.ORI', '.PEF',
  '.SRW', '.ERF', '.3FR', '.FFF', '.IIQ', '.MOS', '.MEF', '.DCR', '.KDC', '.K25',
  '.GPR', '.JXR', '.HDP', '.WDP', '.BTF',
];

const RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN = [
  '.CR3', '.CRM', '.RAF', '.CRW', '.MRW', '.X3F',
];

const VIDEO_EXTENSIONS = [
  '.MP4', '.MOV', '.QT', '.M4V', '.MQV', '.3GP', '.3GPP', '.3G2', '.3GP2',
  '.MTS', '.M2TS', '.M2T', '.AVI', '.MKV', '.WEBM', '.WMV', '.ASF', '.DIVX',
  '.MPG', '.MPEG', '.M2V', '.VOB', '.DV', '.F4V',
  '.LRV', '.LRF', '.GLV', '.INSV', '.360', '.R3D',
];

export const MEDIA_FILE_EXTENSIONS = new Set([
  ...STILL_IMAGE_EXTENSIONS,
  ...RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY,
  ...RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN,
  ...VIDEO_EXTENSIONS,
]);

export const hasMediaExtension = (filePath) => MEDIA_FILE_EXTENSIONS.has(path.extname(filePath).toUpperCase());
