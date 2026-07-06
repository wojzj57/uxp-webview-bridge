import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "fs.public-shape",
    run({ bridge, assert }) {
      assert.functions(
        bridge.fs,
        [
          "readFile",
          "writeFile",
          "open",
          "close",
          "read",
          "write",
          "lstat",
          "rename",
          "copyFile",
          "unlink",
          "mkdir",
          "rmdir",
          "readdir"
        ],
        "bridge.fs"
      );

      return { methodsChecked: 13 };
    }
  },
  {
    name: "fs.text-file-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const filePath = createPluginDataPath("text-roundtrip.txt");
      const expected = "uxp-webview-bridge cdp fs text roundtrip";

      try {
        await bridge.fs.writeFile(filePath, expected, { encoding: "utf-8" });

        const actual = await bridge.fs.readFile(filePath, { encoding: "utf-8" });
        assert.equal(actual, expected, "fs.readFile should return the text written by fs.writeFile.");

        const stats = await bridge.fs.lstat(filePath);
        assert.ok(stats.isFile(), "fs.lstat should report the roundtrip path as a file.");
        assert.equal(stats.size, expected.length, "fs.lstat should report the written text size.");

        return {
          filePath,
          bytes: expected.length
        };
      } finally {
        await cleanupPath(bridge, filePath);
      }
    }
  },
  {
    name: "fs.directory-operations",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const directory = createPluginDataPath("directory-operations");
      const sourcePath = `${directory}/source.txt`;
      const renamedPath = `${directory}/renamed.txt`;
      const copyPath = `${directory}/copy.txt`;

      try {
        await bridge.fs.mkdir(directory, { recursive: true });
        await bridge.fs.writeFile(sourcePath, "source", { encoding: "utf-8" });

        const initialEntries = await bridge.fs.readdir(directory);
        assert.ok(initialEntries.includes("source.txt"), "fs.readdir should include the source file.");

        await bridge.fs.rename(sourcePath, renamedPath);
        await bridge.fs.copyFile(renamedPath, copyPath);

        const finalEntries = await bridge.fs.readdir(directory);
        assert.ok(finalEntries.includes("renamed.txt"), "fs.rename should move the source file.");
        assert.ok(finalEntries.includes("copy.txt"), "fs.copyFile should create the copied file.");

        const directoryStats = await bridge.fs.lstat(directory);
        const copyStats = await bridge.fs.lstat(copyPath);
        assert.ok(directoryStats.isDirectory(), "fs.lstat should report the test directory as a directory.");
        assert.ok(copyStats.isFile(), "fs.lstat should report the copied path as a file.");

        const copied = await bridge.fs.readFile(copyPath, { encoding: "utf-8" });
        assert.equal(copied, "source", "fs.copyFile should preserve file content.");

        return {
          directory,
          entries: finalEntries.length
        };
      } finally {
        await cleanupPath(bridge, sourcePath);
        await cleanupPath(bridge, renamedPath);
        await cleanupPath(bridge, copyPath);
        await cleanupDirectory(bridge, directory);
      }
    }
  },
  {
    name: "fs.file-descriptor-binary-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const filePath = createPluginDataPath("fd-binary.bin");
      let fd: number | undefined;

      try {
        await bridge.fs.writeFile(filePath, Uint8Array.from([1, 2, 3, 4]));
        fd = await bridge.fs.open(filePath, "r+");

        const readBuffer = new ArrayBuffer(4);
        const readResult = await bridge.fs.read(fd, readBuffer, 0, 4, 0);
        assert.equal(readResult.bytesRead, 4, "fs.read should report the bytes read.");
        assertByteArray(readResult.buffer, [1, 2, 3, 4], assert, "fs.read returned buffer");
        assertByteArray(readBuffer, [1, 2, 3, 4], assert, "fs.read caller buffer");

        const writeBuffer = Uint8Array.from([9, 8]).buffer;
        const writeResult = await bridge.fs.write(fd, writeBuffer, 0, 2, 1);
        assert.equal(writeResult.bytesWritten, 2, "fs.write should report the bytes written.");
        assertByteArray(writeResult.buffer, [9, 8], assert, "fs.write returned buffer");

        await bridge.fs.close(fd);
        fd = undefined;

        const finalValue = await bridge.fs.readFile(filePath);
        assertByteArray(finalValue, [1, 9, 8, 4], assert, "fs.readFile binary result");

        return {
          filePath,
          bytesRead: readResult.bytesRead,
          bytesWritten: writeResult.bytesWritten
        };
      } finally {
        if (fd !== undefined) {
          await cleanupFileDescriptor(bridge, fd);
        }
        await cleanupPath(bridge, filePath);
      }
    }
  }
]);

function createPluginDataPath(label: string): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `plugin-data:/uxp-webview-bridge-cdp-${unique}-${label}`;
}

async function cleanupPath(bridge: { fs: { unlink(path: string): Promise<number> } }, path: string): Promise<void> {
  try {
    await bridge.fs.unlink(path);
  } catch {
    // Best-effort cleanup; the assertions own pass/fail.
  }
}

async function cleanupDirectory(bridge: { fs: { rmdir(path: string): Promise<number> } }, path: string): Promise<void> {
  try {
    await bridge.fs.rmdir(path);
  } catch {
    // Best-effort cleanup; the assertions own pass/fail.
  }
}

async function cleanupFileDescriptor(
  bridge: { fs: { close(fd: number): Promise<number> } },
  fd: number
): Promise<void> {
  try {
    await bridge.fs.close(fd);
  } catch {
    // Best-effort cleanup; the assertions own pass/fail.
  }
}

function assertByteArray(
  value: unknown,
  expected: readonly number[],
  assert: {
    ok(value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
  },
  label: string
): void {
  assert.ok(value instanceof ArrayBuffer, `${label} should be an ArrayBuffer.`);

  const actual = Array.from(new Uint8Array(value as ArrayBuffer));
  assert.equal(actual.join(","), expected.join(","), `${label} should contain expected bytes.`);
}
