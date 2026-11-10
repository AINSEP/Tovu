# Tovu host guidance for calendly

These rules specialize the portable plugin guidance for Tovu.

## Host details for skills/calendly/SKILL.md

Read the page with `pages_read_html`, then place this where the calendar belongs, using `pages_write_region` or `pages_write_html`:

```html
<div data-embed-config='{"type":"plugin","plugin":"tovu/calendly","component":"booking-calendar","version":1,"props":{"url":"https://calendly.com/their-name/30min"}}'><a href="https://calendly.com/their-name/30min">Book a time</a></div>
```

The calendar never needs a sign-in. Only offer `agent_plugin_connect` if they want you to look up their event types or scheduled events through Calendly.
