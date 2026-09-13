import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const readProjectFile = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

export function projectFilesUnder(topLevelDirectory) {
  const walk = (directory) => fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true })
    .flatMap((directoryEntry) => {
      const relativePath = path.posix.join(directory, directoryEntry.name);
      if (directoryEntry.isDirectory()) return walk(relativePath);
      return directoryEntry.name.endsWith('.mjs') ? [relativePath] : [];
    });
  return walk(topLevelDirectory);
}

export const sourceFiles = () => ['bin', 'cli', 'src'].flatMap(projectFilesUnder);

export const withoutCommentLines = (sourceText) => sourceText.replace(/^\s*\/\/.*$/gm, '');

const IMPORTED_FROM = /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/gms;

export function importsOf(relativePath) {
  const specifiers = [...withoutCommentLines(readProjectFile(relativePath)).matchAll(IMPORTED_FROM)]
    .map((match) => match.slice(1).find((captured) => captured !== undefined));
  return {
    modules: specifiers.filter((specifier) => specifier.startsWith('.'))
      .map((specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier))),
    outsideTheProject: specifiers.filter((specifier) => !specifier.startsWith('.')),
  };
}
