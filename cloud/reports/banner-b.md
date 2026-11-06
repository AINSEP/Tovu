# banner-b — in progress

Branches: Tovu cloud/banner-b from 74fedc132; Jini cloud/banner-b from f07ae3d6f (build only so far).

Implementing the assigned conditional server loader at static document construction points, removing authored loader requirements, and handling loader read failures. Tests and final production/test line counts pending.

## Bugs found
- Static consent depends on an authored loader tag; existing theme copies without it do not receive the banner.
- The loader route reads the active theme outside error handling and can reject instead of returning plain words.
