# Desktop third-party notices

## Electron and Chromium

The desktop packaging configuration copies the installed Electron runtime's license
to `licenses/LICENSE.electron.txt` and its Chromium third-party notices to
`licenses/LICENSES.chromium.html` inside the app's resources directory
(`Contents/Resources/` on macOS).
These files cover the runtime; a comprehensive inventory of the shell, renderer,
site payload and bundled npm dependencies remains to be generated.

## Bundled fonts (unmodified Google Fonts variable TrueType files)

All three fonts are licensed under SIL Open Font License 1.1. Complete copyright
and license notices accompany each font in `vendor/fonts/` and ship with the renderer.

- DM Sans — Copyright 2014 The DM Sans Project Authors.
  Source: https://github.com/google/fonts/tree/main/ofl/dmsans
  Blob: c672f98060af9b2c85fca704ebd5ad9a8717c1df
  License: `vendor/fonts/dm-sans-OFL.txt`
- Space Grotesk — Copyright 2020 The Space Grotesk Project Authors.
  Source: https://github.com/google/fonts/tree/main/ofl/spacegrotesk
  Blob: a1b2e6c26093066510a31147e7aec9abdc8d6c5e
  License: `vendor/fonts/space-grotesk-OFL.txt`
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors.
  Source: https://github.com/google/fonts/tree/main/ofl/jetbrainsmono
  Blob: aa310be8b717fe3774f9444dd89d5f4101cc6d10
  License: `vendor/fonts/jetbrains-mono-OFL.txt`

## kUInetic

Vendored 0.1.4; its license ships at `vendor/kuinetic/LICENSE`.
