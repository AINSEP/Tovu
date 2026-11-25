import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES } from "@tovu/contracts/upload-limits";
import { ApiError } from "../../../lib/admin-http/request";
import { COMMON_I18N } from "../../../lib/i18n-common";
import { MEDIA_DICT, t as mediaT } from "../media-i18n";
import { FILE_TOO_LARGE_COPY, fileSizeRefusal, sizeRefusalFromError } from "../upload-size-copy";

const sizeError = (limitBytes: number, message = "That file is too big.") =>
  new ApiError({ message, status: 400 }, { code: "MEDIA_UPLOAD_TOO_LARGE", body: { error: message, code: "MEDIA_UPLOAD_TOO_LARGE", fileBytes: limitBytes + 1, limitBytes } });

describe("file size refusal copy", () => {
  it("ordinary oversize copy is translated and never used for the video ceiling", () => {
    const en = (key: string) => key;
    expect(FILE_TOO_LARGE_COPY).toBe("This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.");
    expect(sizeRefusalFromError({ t: en, error: sizeError(MAX_UPLOAD_BYTES) })).toBe(FILE_TOO_LARGE_COPY);
    // The larger ceilings keep their own message: converting cannot bring a file under them.
    expect(sizeRefusalFromError({ t: en, error: sizeError(VIDEO_UPLOAD_LIMIT_BYTES, "That video is over 500 MB.") })).toBe("That video is over 500 MB.");
    expect(fileSizeRefusal({ t: en, limitBytes: MAX_UPLOAD_BATCH_BYTES, fallback: "Too much at once." })).toBe("Too much at once.");
    // Unrelated validation failures and an untyped message that merely mentions size are not size refusals.
    expect(sizeRefusalFromError({ t: en, error: new ApiError({ message: "That file is 51 MB; the limit is 50 MB.", status: 400 }, { code: "VALIDATION_ERROR" }) })).toBeUndefined();
    expect(sizeRefusalFromError({ t: en, error: new Error("too large") })).toBeUndefined();
    for (const locale of Object.keys(COMMON_I18N)) {
      for (const key of [FILE_TOO_LARGE_COPY, "This video may not play in Chrome."]) {
        const translated = MEDIA_DICT[locale]?.[key];
        expect(translated, `${locale}: ${key}`).toBeTruthy();
        expect(translated, `${locale}: ${key}`).not.toBe(key);
      }
    }
    expect(typeof mediaT).toBe("function");
  });
});
