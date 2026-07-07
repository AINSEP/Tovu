<!-- Source: https://shopify.engineering/remote-rendering-ui-extensibility -->
# Shopify's Remote Rendering Architecture for UI Extensibility

## Core Concept

Shopify employs a technique called "remote rendering" that separates UI definition from UI rendering through message passing. As the article explains, this approach allows "extensions" (third-party code) to define interfaces while the "host" (Shopify's main application) renders them, with all communication happening via asynchronous messages.

## Why This Approach

The architecture addresses four key requirements:

1. **Consistency**: Third-party extensions must match Shopify's native experience in appearance, performance, and accessibility
2. **Developer familiarity**: Builders should use standard technologies they already know
3. **Security and reliability**: Extensions run safely without harming the platform
4. **Cross-platform parity**: The same experience across web, iOS, and Android

## Technical Implementation

**The `remote-ui` Library**: Shopify built an open-source library handling the complexity of message-passing protocols, remote procedure calls (RPC), and performant UI updates.

**Key Components**:
- **RPC Layer**: Enables function calls across message channels, including callbacks. Uses Promise and Proxy objects to abstract protocol details
- **RemoteRoot**: Provides a DOM-like API for developers to define UI component trees, serializing updates as JSON messages
- **RemoteReceiver**: Reconstructs remote trees locally on the host side
- **DOM/React Integration**: Translates remote components into native implementations

## Sandboxing Architecture

Extensions run in isolated environments (web workers, webviews, or JsCore depending on platform). The sandbox layer restricts JavaScript globals, limiting extensions to specific approved domains. This keeps boilerplate hidden while letting third-party developers focus on business logic.

Shopify implemented this across three platforms using different technologies for consistent security.
