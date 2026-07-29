[简体中文](./zh/index.md)

# UXP WebView Bridge overview

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

## What the bridge does

`uxp-webview-bridge` gives a WebView controlled access to functionality that exists only in its owning Adobe UXP plugin. The WebView receives familiar namespaces and remote objects, while the host owns validation, dispatch, native APIs, and resource handles.

```text
WebView namespace -> WebView RPC client -> window.uxpHost message bridge
-> UXP host validation/capability dispatch -> native UXP or Photoshop implementation
-> serialized result/error -> WebView value, Response, or RemoteObject
```

The package has two public runtime entry points:

| Runtime | Import | Responsibility |
| --- | --- | --- |
| UXP host | `uxp-webview-bridge/uxp` | Configure the target WebView, accepted origins, capabilities, dispatch, and cleanup. |
| WebView | `uxp-webview-bridge/webview` | Configure the RPC client and call the exported remote namespaces. |

This is a library for plugin authors who control both sides of the WebView boundary. It is not an application shell, a browser-only package, a Node service, or a complete replacement for Adobe's API references.

## Public WebView surface

| Namespace | Purpose |
| --- | --- |
| `clipboard` | Forward selected clipboard operations to UXP. |
| `crypto` | Use the exposed UXP cryptographic globals. |
| `fetch` | Perform a fully buffered forwarded fetch in the UXP host. |
| `fs` | Use the direct filesystem adapter when its capability and manifest permission allow it. |
| `localStorage`, `sessionStorage` | Access the corresponding UXP storage globals. |
| `os`, `path` | Read operating-system information and use path helpers. |
| `photoshop` | Work with implemented Photoshop DOM, Action, Core, Imaging, constants, and helpers. |
| `uxp` | Work with host, plugin manager, shell, storage, user information, versions, and XMP. |

Support means the implemented subset described by the public exports, TypeScript types, and contract tests. It does not imply full compatibility with every UXP, Photoshop, Node, or browser member.

## Choose a guide

1. [Getting started](./getting-started.md) wires a local WebView and establishes deterministic lifecycle ownership.
2. [Security and permissions](./security-and-permissions.md) separates manifest permission, message validation, and bridge capabilities.
3. [UXP](./uxp.md) covers Promise-valued properties, storage, shell operations, and resource cleanup.
4. [Photoshop](./photoshop.md) explains remote objects, queued writes, modal execution, and imaging handles.
5. [Forwarded fetch](./fetch.md) covers direct and global use, aborts, security, buffering, and limitations.

`package.json` marks the package private, and the repository supplies no supported registry installation path. See getting started for the repository build workflow and the verified local `plugin:/` fixture shape.
