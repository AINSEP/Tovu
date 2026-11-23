import { describe, expect, it } from "vitest";

import { ADMIN_UPLOAD_MAX_BYTES, isUploadTooLarge, UPLOAD_TOO_LARGE_MESSAGE, uploadTooLargeMessage } from "../upload-limit";
import { UPLOAD_LIMIT_STRINGS } from "../upload-limit-i18n";
import { t as libraryT } from "@/features/library/library-i18n";
import { t as mediaT } from "@/features/media/media-i18n";

const MIB = 1024 * 1024;

describe("the one admin upload limit (P10-M2)", () => {
  it("is 50 MiB, the server's TOVU_MAX_UPLOAD_BYTES", () => {
    expect(ADMIN_UPLOAD_MAX_BYTES).toBe(50 * MIB);
  });

  it("refuses one byte over the limit and accepts a file exactly at it", () => {
    expect(isUploadTooLarge({ size: 50 * MIB + 1 })).toBe(true);
    expect(isUploadTooLarge({ size: 50 * MIB })).toBe(false);
  });

  it("names the limit in the refusal and offers a way forward", () => {
    expect(UPLOAD_TOO_LARGE_MESSAGE).toBe("This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.");
    // The words must keep naming the real number if the limit ever moves.
    expect(UPLOAD_TOO_LARGE_MESSAGE).toContain(`${ADMIN_UPLOAD_MAX_BYTES / MIB} MB`);
    expect(uploadTooLargeMessage({ locale: "en" })).toBe(UPLOAD_TOO_LARGE_MESSAGE);
  });

  it("translates the refusal, keeping the number, in every admin locale", () => {
    expect(uploadTooLargeMessage({ locale: "de" })).toBe(UPLOAD_LIMIT_STRINGS.de[UPLOAD_TOO_LARGE_MESSAGE]);
    for (const [locale, entries] of Object.entries(UPLOAD_LIMIT_STRINGS)) {
      expect(entries[UPLOAD_TOO_LARGE_MESSAGE], locale).toMatch(/50|٥٠|۵۰|৫০/);
    }
  });

  it("is said the same way by the Library's and Media's own translators", () => {
    const spanish = UPLOAD_LIMIT_STRINGS.es[UPLOAD_TOO_LARGE_MESSAGE];
    expect(libraryT({ locale: "es", key: UPLOAD_TOO_LARGE_MESSAGE })).toBe(spanish);
    expect(mediaT({ locale: "es", key: UPLOAD_TOO_LARGE_MESSAGE })).toBe(spanish);
  });
});
