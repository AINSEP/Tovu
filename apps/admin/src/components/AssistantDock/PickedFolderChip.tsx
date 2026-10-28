import { Icon, RemixIcon } from "@jini-ai/ui";

/**
 * @file The composer's picked-folder chip, after the folder button: the folder the agent may read
 * (and write into through the carded `fs_write_files`), with × to stop using it. Reuses Jini's
 * attachment-chip classes so it matches the plugin and skill chips. The dock renders it only while a folder is set.
 */
export interface PickedFolderChipProps {
  readonly path: string;
  readonly onClear: () => void;
}

export function PickedFolderChip({ path, onClear }: PickedFolderChipProps) {
  // Both separators: Windows paths too. A trailing separator still yields the folder's own name.
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return (
    <div className="jini-attachment-chip tovu-picked-folder-chip">
      <span className="jini-attachment-chip-body">
        <span className="jini-attachment-chip-icon"><RemixIcon name="folder-line" size={15} /></span>
        <span className="jini-attachment-chip-copy"><span className="jini-attachment-chip-name" title={path}>{name}</span></span>
      </span>
      <button type="button" className="jini-attachment-remove" onClick={onClear} title={`Stop using ${name}`} aria-label={`Stop using ${name}`}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
