/** @file The one recovery sentence every folder-read refusal ends with. */
/** The human selects the grant; tools only consume it. There is no model-controlled picker tool. */
export const FS_FOLDER_READ_RECOVERY = 'Ask the owner to pick that folder with the chat composer folder button (or drop the folder onto the composer), then call fs_list_files with root:"custom" and media_import_local_file with root:"custom" and the file path relative to that folder. Alternatively, ask the owner to attach the file to this chat, then use media_promote_chat_attachment.';
