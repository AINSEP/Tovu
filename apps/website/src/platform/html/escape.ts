/** Host call-shape adapter to the shared leaf escapers; no renderer import cycle. */
import { escapeHtml as html, escapeXml as xml } from "@jini-ai/core/text";
export const escapeHtml = ({ text }: { text: string }, _optional = {}): string => html({ text });
export const escapeXml = ({ text }: { text: string }, _optional = {}): string => xml({ text });
