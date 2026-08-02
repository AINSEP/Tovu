<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Image -->

# Image Object Schema - Storefront API

## Overview
An image resource utilized for product imagery, collection visuals, media previews, and other storefront content. The `url` field supports `ImageTransformInput` arguments for resizing, cropping, and format conversion. The `thumbhash` field enables lightweight placeholder rendering.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| **altText** | String | "A word or phrase to share the nature or contents of an image." |
| **height** | Int | The original image height in pixels; returns null for non-Shopify hosted images. |
| **id** | ID | A unique identifier for the image. |
| **thumbhash** | String | ThumbHash value for displaying placeholder images during loading. Reference: https://evanw.github.io/thumbhash/ |
| **url** | URL! (non-null) | The image location as a URL with optional `transform` argument accepting `ImageTransformInput` for image modifications. |
| **width** | Int | The original image width in pixels; returns null for non-Shopify hosted images. |

## Deprecated Fields

- **originalSrc** (URL!, non-null)
- **src** (URL!, non-null)
- **transformedSrc** (URL!, non-null) — accepts maxWidth, maxHeight, crop, scale, preferredContentType arguments

## Transform Arguments (via deprecated transformedSrc)
- maxWidth/maxHeight: 1-5760 pixels
- crop: CropRegion enum value
- scale: 1-3 multiplier for retina displays
- preferredContentType: ImageContentType enum for format conversion
