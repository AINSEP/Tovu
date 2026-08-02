# WordPress Root Entry-Point Appendix

This directory preserves the earlier per-file notes for individual WordPress root entry points.

The main corpus no longer uses this directory as its primary navigation surface. The current canonical docs are:

- `../wp-root/bootstrap.md` for the bootstrap chain, `index.php`, `wp-blog-header.php`, `wp-load.php`, `wp-config.php`, and `wp-settings.php`
- `../wp-root/auth-and-signup.md` for `wp-login.php`, `wp-signup.php`, and `wp-activate.php`
- `../wp-root/integrations.md` for `wp-comments-post.php`, `wp-cron.php`, `wp-mail.php`, `wp-links-opml.php`, and `wp-trackback.php`
- `../xmlrpc.md` for `xmlrpc.php`

Use this appendix when exact per-file historical notes are useful. Treat it as archival reference, not as an open coverage backlog.

## Archived Files

- `wp-activate.md`
- `wp-blog-header.md`
- `wp-comments-post.md`
- `wp-config.md`
- `wp-cron.md`
- `wp-links-opml.md`
- `wp-load.md`
- `wp-login.md`
- `wp-mail.md`
- `wp-settings.md`
- `wp-signup.md`
- `wp-trackback.md`

---

## Tovu Reconstruction Notes

### Why this exists

This appendix exists to preserve per-file provenance from the earlier root-entry pass without letting those notes compete with the consolidated canonical docs.

### What Tovu should preserve

- A clear link from archival per-file notes back to the newer consolidated subsystem docs
- The understanding that these pages are reference material, not active backlog

### What Tovu can simplify

- Once the consolidated docs fully replace the appendix for day-to-day use, this directory can be reduced further or removed
- Tovu planning should prefer the consolidated docs unless file-level provenance is specifically needed

### Possible Tovu seams

- treat this directory as archival research only
- route implementation planning through `wp-root/`, `wp-admin/`, and `wp-includes/` instead

### Suggested priority

- `Reference only`
