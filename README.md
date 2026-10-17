# Tovu

Your website in one folder you own, with a built-in AI assistant that edits it for you.

<p align="center">
  <a href="https://tovu.dev"><img src=".github/readme/tovu-hero.webp" width="960" alt="Tovu in 30 seconds: write, edit and publish pages, ask the assistant to make changes, make images with AI, publish anywhere"></a>
  <br>
  <a href=".github/readme/tovu-promo.mp4">Watch the full video with sound</a>
</p>

## See what it can do

<p align="center">
  <a href=".github/readme/tovu-capabilities.mp4"><img src=".github/readme/tovu-capabilities.webp" width="960" alt="Four tasks typed into the admin chat: write and publish a post, build a contact page, make images and write an article, chart sales by month"></a>
</p>

## Download the app

No terminal needed. Download, open, and you land in your site's admin.

| Your computer | Download |
| --- | --- |
| Mac with Apple chip (M1 or newer) | [Tovu-mac-arm64.dmg](https://github.com/AINSEP/Tovu/releases/latest/download/Tovu-mac-arm64.dmg) |
| Mac with Intel chip | [Tovu-mac-x64.dmg](https://github.com/AINSEP/Tovu/releases/latest/download/Tovu-mac-x64.dmg) |
| Windows (64-bit) | [Tovu-windows-x64-setup.exe](https://github.com/AINSEP/Tovu/releases/latest/download/Tovu-windows-x64-setup.exe) |

All versions: [GitHub Releases](https://github.com/AINSEP/Tovu/releases/latest).

## What it does

- Pages, posts, media, menus and forms, with themes you can switch any time.
- Ask the assistant to write a page, restyle the site or make images, in plain words.
- Everything lives in one folder on your computer: copy it, back it up, move it.
- Publish to a live site or export a static site.

Guides: **[tovu.dev/docs](https://tovu.dev/docs)**

## Run from source

Needs [Node.js](https://nodejs.org) 24 or newer.

```
npm install
npm start
```

It prints the address your site is running on.

## For developers

- `apps/website` — the site and admin server
- `apps/admin` — the admin screens
- `apps/desktop` — the desktop app
- `packages/sdk` — the plugin SDK
- `sites/` — your sites' data (not source code)

Built on [Jini](https://github.com/AINSEP/Jini). `npm run dev` runs in watch mode; `npm run desktop` runs the desktop app from source.

## License

Apache-2.0 (see [LICENSE](LICENSE)).
