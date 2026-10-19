import { fireEvent, render, screen } from '@testing-library/react';
import { UploadTab } from '../Library';
import type { LibraryController } from '../hooks/use-library.hooks';
/** Unexecuted. Source RED reason: the prior extension allowlist excludes all seven formats. */
import { describe, expect, it, vi } from 'vitest';
import { LIBRARY_ACCEPT, LIBRARY_MAX_BYTES, documentPreviewKind, libraryFileProblem } from '../rules';
import { t } from '../library-i18n';

const extensions = ['doc', 'xls', 'rtf', 'xlsx', 'pptx', 'pages', 'key'];
const locales = ['es', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it', 'hi', 'ur', 'bn'];
const typeLine = 'Documents: Markdown, text, PDF, Word, Excel, PowerPoint, Pages, Keynote, RTF, CSV, JSON · up to 10 MiB each';
const packageMessage = 'Folder package: in Pages/Keynote, save as a single file, then upload again.';

describe('download-only Library documents', () => {
  it.each(extensions)('accepts .%s at the 10 MiB cap and uses the download preview', ext => {
    expect(LIBRARY_ACCEPT.split(',')).toContain('.' + ext);
    expect(libraryFileProblem({ name: 'download.' + ext.toUpperCase(), size: LIBRARY_MAX_BYTES })).toBeNull();
    expect(libraryFileProblem({ name: 'download.' + ext, size: LIBRARY_MAX_BYTES + 1 })).toBe('size');
    expect(documentPreviewKind({ originalFilename: 'download.' + ext })).toBe('download');
  });
  it.each(['pages', 'key'])('explains zero-size .%s package entries', ext => {
    expect(libraryFileProblem({ name: 'Package.' + ext, size: 0 })).toBe('package');
  });
  it.each(locales)('translates the type line and package message in %s', locale => {
    expect(t({ locale, key: typeLine })).not.toBe(typeLine);
    for (const type of ['Excel', 'PowerPoint', 'Pages', 'Keynote', 'RTF']) expect(t({ locale, key: typeLine })).toContain(type);
    expect(t({ locale, key: packageMessage })).not.toBe(packageMessage);
  });
});

// The capture handler must stop the shared dropzone from enumerating a macOS package.
it.each(['pages', 'key'])('reports a dropped .%s folder before expansion', extension => {
  const addFiles = vi.fn();
  const controller = { t: (key: string) => key, permissions: { known: true, canUpload: true },
    uploads: [], uploadedCount: 0, addFiles, clearUploads: vi.fn() } as unknown as LibraryController;
  render(<UploadTab controller={controller} />);
  const readDirectory = vi.fn(() => { throw new Error('package must not be expanded'); });
  fireEvent.drop(screen.getByTestId('file-dropzone-zone'), { dataTransfer: {
    items: [{ webkitGetAsEntry: () => ({ isDirectory: true, name: 'Presentation.' + extension, createReader: readDirectory }), getAsFile: () => null }],
    files: [], types: ['Files'],
  } });
  expect(addFiles).toHaveBeenCalledTimes(1);
  const [file] = addFiles.mock.calls[0]![0] as File[];
  expect(file?.name).toBe('Presentation.' + extension);
  expect(libraryFileProblem(file!)).toBe('package');
  expect(readDirectory).not.toHaveBeenCalled();
});
