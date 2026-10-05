# Testimonials + FAQ

A zero-code (tier-1) Tovu plugin. It contains no code: turning it on adds two content types to the
site, and nothing else.

- **Testimonial**: the entry title is the person's name; fields `quote` (required), `role`,
  `rating` (1-5) and `order`.
- **FAQ**: the entry title is the question; fields `answer` (required), `category` and `order`.

## Show them on a page

Add Collection list blocks (or `collection` markers) with these settings:

- FAQ accordion with Google FAQ rich results:
  `{"type":"collection","typeKey":"faq","layout":"accordion","structuredData":"faq-page","fields":["answer"],"sort":"order"}`
- Testimonials carousel:
  `{"type":"collection","typeKey":"testimonial","layout":"carousel","fields":["quote","role"],"sort":"order"}`

Turning the plugin off or removing it keeps both content types and every entry: they are your
content.
