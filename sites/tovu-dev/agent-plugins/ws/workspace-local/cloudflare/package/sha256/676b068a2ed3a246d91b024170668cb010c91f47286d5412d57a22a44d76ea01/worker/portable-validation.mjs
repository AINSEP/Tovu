// ../cms/dist/forms/portable-validation.js
var EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
function isValidFormEmail({ value }, _optional = {}) {
  return EMAIL_PATTERN.exec(value)?.[0] === value;
}
var accepted = (value) => ({ kind: "accepted", value });
var rejected = (reason) => ({ kind: "rejected", reason });
var NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
var fullMatch = (pattern, value) => pattern.exec(value)?.[0] === value;
var absent = { kind: "absent" };
var blank = (field) => field.required ? rejected("required") : absent;
var outcome = (reason, value) => reason === void 0 ? accepted(value) : rejected(reason);
function textLengthViolation(field, value) {
  if (value.length > (field.maxLength ?? 5e3))
    return "too_long";
  return value !== "" && value.length < (field.minLength ?? Number(field.attributes?.minlength ?? 0)) ? "too_short" : void 0;
}
function textPatternViolation(field, value) {
  const pattern = field.pattern ?? field.attributes?.pattern;
  if (value === "" || pattern === void 0)
    return void 0;
  return isSafeFieldPattern({ pattern }) && fullMatch(new RegExp(`^(?:${pattern})$`, "u"), value) ? void 0 : "pattern_mismatch";
}
function textValue({ field, value }, _optional = {}) {
  if (typeof value !== "string")
    return rejected("must be a string");
  if (field.required && value.trim() === "")
    return rejected("required");
  return outcome(textLengthViolation(field, value) ?? textPatternViolation(field, value), value);
}
var formattedText = (isFormatted, reason) => ({ field, value }) => {
  const result = textValue({ field, value });
  if (result.kind !== "accepted" || value === "")
    return result;
  return isFormatted(value) ? result : rejected(reason);
};
var emailValue = formattedText((value) => isValidFormEmail({ value }), "invalid_email");
var phoneValue = formattedText((value) => fullMatch(/^\+?[0-9() .-]{3,50}$/, value) && /\d/.test(value), "invalid_phone");
function hasDottedHost(address, absolute) {
  const authority = (absolute ? address.slice(address.indexOf("://") + 3) : address).split(/[/?#]/, 1)[0];
  return authority.slice(authority.lastIndexOf("@") + 1).split(":", 1)[0].includes(".");
}
function parsesAsDomainUrl(href) {
  try {
    const labels = new URL(href).hostname.split(".");
    return labels.length > 1 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
  } catch {
    return false;
  }
}
function isFormUrl(address) {
  if (/[\s\\\x00-\x08\x0e-\x1f\x7f]/u.test(address))
    return false;
  if (fullMatch(/@[A-Za-z0-9._]{1,30}/, address))
    return true;
  const absolute = /^https?:\/\/[^/]/i.test(address);
  if (!absolute && !fullMatch(/[^:/?#@]+(?::\d+)?(?:[/?#].*)?/, address))
    return false;
  return hasDottedHost(address, absolute) && parsesAsDomainUrl(absolute ? address : `https://${address}`);
}
var urlValue = formattedText(isFormUrl, "invalid_url");
function parseNativeNumber(value) {
  const numericText = typeof value === "string" && value.length <= 100 && fullMatch(NUMBER, value);
  if (typeof value !== "number" && !numericText)
    return void 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : void 0;
}
var nativeRangeBound = (field, bound) => field.type === "range" ? bound : void 0;
function isOnStep(field, { number, min }) {
  const step = field.step ?? Number(field.attributes?.step ?? 1);
  const units = (number - Number(min ?? 0)) / step;
  return Number.isFinite(units) && Math.abs(units - Math.round(units)) <= 1e-8;
}
var numberBounds = (field) => ({
  min: field.min ?? field.attributes?.min ?? nativeRangeBound(field, 0),
  max: field.max ?? field.attributes?.max ?? nativeRangeBound(field, 100)
});
function numberBoundViolation(field, number) {
  const { min, max } = numberBounds(field);
  if (min !== void 0 && number < Number(min))
    return "below_min";
  if (max !== void 0 && number > Number(max))
    return "above_max";
  return isOnStep(field, { number, min }) ? void 0 : "step_mismatch";
}
function numberValue({ field, value }, _optional = {}) {
  if (value === "")
    return blank(field);
  const number = parseNativeNumber(value);
  if (number === void 0)
    return rejected("invalid_number");
  return outcome(numberBoundViolation(field, number), number);
}
function validDate(value) {
  if (!fullMatch(/^\d{4}-\d{2}-\d{2}$/, value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day)
    return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
var validTime = (value) => fullMatch(/(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?/, value);
function temporalTimestamp(type, value) {
  if (type === "date")
    return Date.parse(`${value}T00:00:00Z`);
  return Date.parse(type === "time" ? `1970-01-01T${value}Z` : `${value}Z`);
}
function isNativeTemporal(type, value) {
  if (type === "date")
    return validDate(value);
  if (type === "time")
    return validTime(value);
  const [date, time, extra] = value.split("T");
  return extra === void 0 && validDate(date) && time !== void 0 && validTime(time);
}
function temporalBoundViolation(field, value) {
  const min = field.min ?? field.attributes?.min;
  const max = field.max ?? field.attributes?.max;
  const timestamp = temporalTimestamp(field.type, value);
  if (min !== void 0 && timestamp < temporalTimestamp(field.type, String(min)))
    return "below_min";
  if (max !== void 0 && timestamp > temporalTimestamp(field.type, String(max)))
    return "above_max";
  return void 0;
}
function temporalValue({ field, value }, _optional = {}) {
  if (typeof value !== "string" || value.length > 30)
    return rejected("invalid_datetime");
  if (value === "")
    return blank(field);
  if (!isNativeTemporal(field.type, value))
    return rejected(`invalid_${field.type}`);
  return outcome(temporalBoundViolation(field, value), value);
}
function singleChoice({ field, value }, _optional = {}) {
  if (value === "")
    return blank(field);
  if (typeof value !== "string")
    return rejected("must be a string");
  return field.options?.some((option) => option.value === value) ? accepted(value) : rejected("invalid_option");
}
var isBoundedStringList = (values) => Array.isArray(values) && values.length <= 100 && values.every((item) => typeof item === "string");
function isUniqueOptionSubset(values, options) {
  const allowed = new Set(options?.map((option) => option.value));
  return new Set(values).size === values.length && values.every((item) => allowed.has(item));
}
function multipleChoice({ field, value }, _optional = {}) {
  const values = typeof value === "string" ? [value] : value;
  if (!isBoundedStringList(values))
    return rejected("must be a string array");
  if (field.required && values.length === 0)
    return rejected("required");
  return isUniqueOptionSubset(values, field.options) ? accepted([...values]) : rejected("invalid_option");
}
function booleanValue({ field, value }, _optional = {}) {
  if (field.checkboxValue !== void 0) {
    if (typeof value !== "string")
      return rejected("must be a boolean");
    return value === field.checkboxValue ? accepted(value) : rejected("invalid_option");
  }
  if (typeof value === "boolean")
    return field.required && !value ? rejected("required") : accepted(value);
  return value === "on" ? accepted(true) : rejected("must be a boolean");
}
function isSafeFieldPattern({ pattern }, _optional = {}) {
  if (pattern.length > 300 || /[()|]|\\[1-9]|\\[pPkK]/.test(pattern))
    return false;
  const outsideClasses = pattern.replace(/\\./g, "x").replace(/\[[^\]]*\]/g, "x");
  if ((outsideClasses.match(/[+*?]|\{/g) ?? []).length > 1 || /\.\*/.test(outsideClasses))
    return false;
  try {
    new RegExp(`^(?:${pattern})$`, "u");
    return true;
  } catch {
    return false;
  }
}
var portableFieldValidators = {
  text: textValue,
  textarea: textValue,
  hidden: textValue,
  password: textValue,
  color: textValue,
  email: emailValue,
  phone: phoneValue,
  tel: phoneValue,
  url: urlValue,
  number: numberValue,
  range: numberValue,
  date: temporalValue,
  time: temporalValue,
  datetime: temporalValue,
  "datetime-local": temporalValue,
  select: singleChoice,
  radio: singleChoice,
  "multi-select": multipleChoice,
  "checkbox-group": multipleChoice,
  checkbox: booleanValue,
  toggle: booleanValue
};
function resolvePortableFormField({ field, value }, _optional = {}) {
  if (value === void 0 || value === null)
    return blank(field);
  const validator = Object.hasOwn(portableFieldValidators, field.type) ? portableFieldValidators[field.type] : void 0;
  return validator ? validator({ field, value }) : rejected("invalid_type");
}
var FORM_SCHEMA_HASH_FIELD = "_schemaHash";
function matchesFormSchemaHash({ present, submittedHash, schemaHash }, _optional = {}) {
  return !present || typeof submittedHash === "string" && /^[a-f0-9]{64}$/.test(submittedHash) && submittedHash === schemaHash;
}
export {
  FORM_SCHEMA_HASH_FIELD,
  isSafeFieldPattern,
  isValidFormEmail,
  matchesFormSchemaHash,
  portableFieldValidators,
  resolvePortableFormField
};
