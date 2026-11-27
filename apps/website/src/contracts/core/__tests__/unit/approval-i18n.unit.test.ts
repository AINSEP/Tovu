import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_LOCALES } from "@tovu/contracts/admin-locales";
import { approvalText } from "../../approval-i18n.js";

const ROUTINE_NOTICE = "This routine runs only while Tovu is open and your computer is awake";

test("the routine availability notice is translated in every supported locale without losing the product name", () => {
  assert.equal(approvalText({ locale: "en", key: ROUTINE_NOTICE }), ROUTINE_NOTICE);
  assert.equal(approvalText({ locale: "es", key: ROUTINE_NOTICE }), "Esta rutina solo se ejecuta mientras Tovu está abierto y tu ordenador está activo");
  for (const { code } of ADMIN_LOCALES.filter(locale => locale.code !== "en")) {
    const notice = approvalText({ locale: code, key: ROUTINE_NOTICE });
    assert.notEqual(notice, ROUTINE_NOTICE, code);
    assert.match(notice, /Tovu/, code);
  }
  for (const locale of ["unavailable", "toString"]) assert.equal(approvalText({ locale, key: ROUTINE_NOTICE }), ROUTINE_NOTICE);
});

test("other approval copy still uses the shared locale dictionary", () => {
  assert.equal(approvalText({ locale: "es", key: "Cancel" }), "Cancelar");
  assert.equal(approvalText({ locale: "es", key: "A new untranslated action" }), "A new untranslated action");
});
