# K4-i18n-common — split `COMMON_I18N` at the seam (K4, J then T)

47 Jini-bound admin files import `COMMON_I18N` (`apps/admin/src/lib/i18n-common.ts:710`), always as the `commonDictionary` optional argument of core's `createDictionaryTranslator` (e.g. `apps/admin/src/features/deployment/deployment-i18n.tsx`). The file is 716 lines; 23 lines name the product.

- **J (Jini, 80 min):** tests first — `packages/admin/src/core/__tests__/i18n-common.test.ts` pins three generic keys per locale. Copy every entry whose key and translations carry no product word into `packages/admin/src/core/i18n-common.ts` (`export const ADMIN_COMMON_I18N`), same keys, same text; export `./core/i18n-common`. Moved feature dictionaries pass it as `commonDictionary`.
- **T (Tovu, 60 min):** `i18n-common.ts` keeps only the product entries and builds `COMMON_I18N` as `{ ...ADMIN_COMMON_I18N per locale, ...product entries }` (composition, not a re-export shell). Tovu-kept screens are unchanged.
- **K3 follow-through:** a moved screen that reads one of the 23 product entries receives that string through its existing props/translate argument (sheet lists it under K3); none may import the Tovu file.
- Mutation: drop one generic key from `ADMIN_COMMON_I18N` → the new Jini test and the Tovu `app-i18n` parity test go red.
