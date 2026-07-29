# `RGBColor`

WebView-local value class: `new photoshop.RGBColor({ red?, green?, blue?, hexValue? })`.

RGB channels are synchronous writable numbers from 0 through 255. `hexValue` accepts six hex digits with optional `#` and returns uppercase digits. Defaults are white. Invalid channels/hex throw `RangeError`. `typename` is `RGBColor`. No RPC or disposal.
