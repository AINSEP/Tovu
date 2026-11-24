# site-export

Export pre-flight warnings (`export-preflight.ts`). They never block an export or a publish; they ride the
export report's `consentWarning` field, which already reaches the publish outcome.

- A421: a page that still shows the privacy template's `ADD YOUR CONTACT EMAIL` placeholder.
- A400: a page that loads an authored third-party `<script src>` (another origin, not a declared consent script)
  while cookie consent is configured. The banner does not hold such scripts back; the owner is told to declare
  them in the theme's scripts with a consent category or remove them.
