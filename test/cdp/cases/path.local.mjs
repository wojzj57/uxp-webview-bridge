export default async function pathLocal({ bridge, assert }) {
  const joined = bridge.path.posix.join("plugin:", "webview", "..", "index.html");
  const parsed = bridge.path.posix.parse("/tmp/example.txt");

  assert.equal(joined, "plugin:/index.html", "path.posix.join should normalize path segments.");
  assert.objectHasKeys(parsed, ["root", "dir", "base", "ext", "name"], "path.posix.parse result");
  assert.equal(parsed.base, "example.txt", "path.posix.parse base");

  return {
    joined,
    parsed
  };
}
