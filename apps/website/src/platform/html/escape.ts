/** Host call-shape adapter to the shared leaf escapers; no renderer import cycle. */
import { escapeHtml as html, escapeXml as xml } from "@jini-ai/core/text";
export const escapeHtml = (text: string): string => html({ text });
export const escapeXml = (text: string): string => xml({ text });
