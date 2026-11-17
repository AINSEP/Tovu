# K-10b forms agent tools -> `@jini-ai/cms/forms` (one run, est 130k). Pattern steps S3-S4.
precondition: K-10a pushed: `ls apps/website/src/features/forms/tool-handlers.definitions.ts` exists and `rg -n "#src/features/forms/index|\.\./content-duplication|\./index\.js" apps/website/src/features/forms/tool-handlers.*.ts apps/website/src/features/forms/duplicate-form.ts` prints nothing. Regenerate `K-10.*` sidecars on that commit (file set changed). K-10a's intermediate state is complete on its own: nothing in it depends on this sheet.
pkg: cms. THIRD_PARTY_ALLOWED: none. target: `packages/cms/src/forms/{agent-tools,tool-registrations,tool-handlers.definitions,tool-handlers.submissions,duplicate-form}.ts`.
S4: Tovu `forms/tool-registrations.ts` keeps `contributeFormsTools` (wrapping with `withToolMetadata`, passing `formWrites`, `slugPolicy`, `deriveDuplicateName`) and `contributeFormsDuplicateHandlers`. The K-10a S0 test stays unedited and green.
changeset: cms minor.
