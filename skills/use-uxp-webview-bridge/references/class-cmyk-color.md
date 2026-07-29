# `CMYKColor`

WebView-local value class: `new photoshop.CMYKColor({ cyan?, magenta?, yellow?, black? })`.

All channels are synchronous writable numbers from 0 through 100; invalid/non-finite values throw `RangeError`. Defaults are zero. `typename` is `CMYKColor`. No RPC or disposal.
