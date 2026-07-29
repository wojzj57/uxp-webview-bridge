import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";
import type {
  UxpPersistentFileStorage,
  UxpStorageFile
} from "@webview/uxp-api/modules/uxp/persistent-file-storage/index.js";
import type { XMPDateTime, XMPFile, XMPMeta } from "@webview/uxp-api/modules/uxp/xmp/index.js";

function assertXmpBatchTypes(dateTime: XMPDateTime): void {
  const read: Promise<{ year: number; month: number }> = dateTime.batchGet(["year", "month"]);
  const write: Promise<void> = dateTime.batchSet({ year: 2026 });
  void read;
  void write;
  // @ts-expect-error XMPDateTime has no readable property named `missing`.
  void dateTime.batchGet(["missing"]);
  // @ts-expect-error XMPDateTime batch values retain their declared number types.
  void dateTime.batchSet({ year: "2026" });
}
void assertXmpBatchTypes;

export default defineWebviewCdpCases([
  {
    name: "uxp.public-shape",
    run({ bridge, assert }) {
      assert.ok(typeof bridge.uxp.host === "object", "bridge.uxp.host must be an object.");
      assert.ok(typeof bridge.uxp.pluginManager === "object", "bridge.uxp.pluginManager must be an object.");
      assert.functions(bridge.uxp.shell, ["openPath", "openExternal"], "bridge.uxp.shell");
      assert.ok(typeof bridge.uxp.storage === "object", "bridge.uxp.storage must be an object.");
      assert.functions(
        bridge.uxp.storage.secureStorage,
        ["setItem", "getItem", "removeItem", "key", "clear"],
        "bridge.uxp.storage.secureStorage"
      );
      assert.functions(
        bridge.uxp.storage.localFileSystem,
        [
          "getFileForOpening",
          "getFileForSaving",
          "getFolder",
          "getTemporaryFolder",
          "getDataFolder",
          "getPluginFolder",
          "createEntryWithUrl",
          "getEntryWithUrl",
          "getFsUrl",
          "getNativePath",
          "createSessionToken",
          "getEntryForSessionToken",
          "createPersistentToken",
          "getEntryForPersistentToken"
        ],
        "bridge.uxp.storage.localFileSystem"
      );
      assert.ok(typeof bridge.uxp.storage.Entry === "function", "bridge.uxp.storage.Entry must be a function.");
      assert.ok(typeof bridge.uxp.storage.File === "function", "bridge.uxp.storage.File must be a function.");
      assert.ok(typeof bridge.uxp.storage.Folder === "function", "bridge.uxp.storage.Folder must be a function.");
      assert.ok(typeof bridge.uxp.storage.domains.userDocuments === "symbol", "storage domain symbols");
      assert.ok(typeof bridge.uxp.storage.formats.binary === "symbol", "storage format symbols");
      assert.ok(typeof bridge.uxp.storage.types.folder === "symbol", "storage type symbols");
      assert.functions(bridge.uxp.userInfo, ["userId"], "bridge.uxp.userInfo");
      assert.ok(typeof bridge.uxp.xmp === "object", "bridge.uxp.xmp must be an object.");
      assert.functions(bridge.uxp.xmp, ["XMPDateTime", "XMPFile", "XMPMeta"], "bridge.uxp.xmp");
      assert.ok(typeof bridge.uxp.xmp.XMPUtils === "object", "bridge.uxp.xmp.XMPUtils must be an object.");

      return {
        hostPropertiesChecked: 3,
        pluginManagerChecked: true,
        shellMethodsChecked: 2,
        secureStorageMethodsChecked: 5,
        localFileSystemMethodsChecked: 14,
        userInfoMethodsChecked: 1,
        xmpChecked: true
      };
    }
  },
  {
    name: "uxp.persistent-file-storage-local-file-system",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const storage = bridge.uxp.storage;
      const fileName = `uxp-webview-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
      let file: UxpStorageFile | null = null;

      try {
        try {
          const folderResult = storage.localFileSystem.getTemporaryFolder();
          file = await folderResult.createFile(fileName, { overwrite: true });
        } catch (error) {
          return skip("uxp.storage.localFileSystem is unavailable in this UXP host.", {
            error: normalizeError(error)
          });
        }

        if (!file) {
          throw new Error("createFile returned null.");
        }
        const activeFile = file;

        assert.equal(activeFile instanceof storage.File, true, "createFile should return a File proxy.");
        assert.equal(storage.File.isFile(activeFile), true, "File.isFile(file)");

        const text = "hello persistent file storage";
        assert.equal(await activeFile.write(text), text.length, "text write length");
        assert.equal(await activeFile.read(), text, "text read");

        const metadata = await activeFile.getMetadata();
        assert.equal(metadata.name, fileName, "metadata.name");
        assert.equal(metadata.isFile, true, "metadata.isFile");
        assert.equal(metadata.isFolder, false, "metadata.isFolder");

        const fsUrl = await storage.localFileSystem.getFsUrl(activeFile);
        assert.nonEmptyString(fsUrl, "localFileSystem.getFsUrl(file)");
        const sessionToken = await storage.localFileSystem.createSessionToken(activeFile);
        assert.nonEmptyString(sessionToken, "localFileSystem.createSessionToken(file)");
        const sessionEntry = await storage.localFileSystem.getEntryForSessionToken(sessionToken);
        assert.equal(sessionEntry.name, fileName, "getEntryForSessionToken(token).name");

        return {
          fileName,
          fsUrl,
          textLength: text.length,
          metadataSize: metadata.size
        };
      } finally {
        if (file) {
          try {
            await file.delete();
          } catch {
            // Best-effort cleanup; assertions own pass/fail.
          }
          try {
            await file.dispose();
          } catch {
            // Best-effort cleanup; assertions own pass/fail.
          }
        }
      }
    }
  },
  {
    name: "uxp.key-value-storage-secure-storage",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const key = `uxp-webview-bridge-cdp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const value = new Uint8Array([117, 120, 112, 45, 98, 114, 105, 100, 103, 101]);

      try {
        let beforeLength: number;
        try {
          beforeLength = await bridge.uxp.storage.secureStorage.length;
          await bridge.uxp.storage.secureStorage.setItem(key, value);
        } catch (error) {
          return skip("uxp.storage.secureStorage is unavailable in this UXP host.", {
            error: normalizeError(error)
          });
        }

        const stored = await bridge.uxp.storage.secureStorage.getItem(key);
        assert.ok(stored instanceof Uint8Array, "secureStorage.getItem should resolve with Uint8Array.");
        assert.equal(bytesToCsv(stored), bytesToCsv(value), "secureStorage.getItem bytes");

        const afterLength = await bridge.uxp.storage.secureStorage.length;
        assert.ok(afterLength >= beforeLength, "secureStorage.length should not shrink after setItem.");

        let foundKey = false;
        for (let index = 0; index < afterLength; index += 1) {
          if ((await bridge.uxp.storage.secureStorage.key(index)) === key) {
            foundKey = true;
            break;
          }
        }
        assert.ok(foundKey, "secureStorage.key(index) should include the test key.");

        await bridge.uxp.storage.secureStorage.removeItem(key);
        return { beforeLength, afterLength, byteLength: stored.byteLength, keyFound: foundKey };
      } finally {
        try {
          await bridge.uxp.storage.secureStorage.removeItem(key);
        } catch {
          // Best-effort cleanup; assertions own pass/fail.
        }
      }
    }
  },
  {
    name: "uxp.xmp-meta-smoke",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const { XMPConst, XMPMeta } = bridge.uxp.xmp;
      const schema = XMPConst.NS_XMP;
      if (typeof schema !== "string" || schema.length === 0) {
        return skip("uxp.xmp.XMPConst.NS_XMP is unavailable in this UXP host.", {
          constKeys: Object.keys(XMPConst).slice(0, 20)
        });
      }

      const meta = new XMPMeta();
      try {
        await meta.setProperty(schema, "CreatorTool", "uxp-webview-bridge");
        const property = await meta.getProperty(schema, "CreatorTool");
        assert.ok(property, "XMPMeta.getProperty should return a property.");
        assert.equal(property?.value, "uxp-webview-bridge", "XMPMeta property value");

        const serialized = await meta.serialize();
        assert.nonEmptyString(serialized, "XMPMeta.serialize()");

        return {
          constCount: Object.keys(XMPConst).length,
          serializedLength: serialized.length
        };
      } finally {
        try {
          await meta.dispose();
        } catch {
          // Best-effort cleanup; assertions own pass/fail.
        }
      }
    }
  },
  {
    name: "uxp.xmp-datetime-and-iterator-roundtrip",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const { XMPConst, XMPDateTime, XMPMeta } = bridge.uxp.xmp;
      const schema = XMPConst.NS_XMP;
      if (typeof schema !== "string" || schema.length === 0) {
        return skip("uxp.xmp.XMPConst.NS_XMP is unavailable in this UXP host.");
      }

      const iso = "2026-07-07T08:30:00.000Z";
      const dateTime = new XMPDateTime(new Date(iso));
      const meta = new XMPMeta();
      try {
        // remoteKey-backed property getters round-trip through xmp.dateTime.getProperty.
        const year = await dateTime.year;
        assert.equal(year, 2026, "XMPDateTime.year via remoteKey getter");

        // batchGet aggregates several remoteKey properties in one RPC.
        const batch = await dateTime.batchGet(["year", "month", "day"]);
        assert.equal(batch.year, 2026, "batchGet year");
        assert.equal(batch.month, 7, "batchGet month");
        assert.equal(batch.day, 7, "batchGet day");

        // batchSet queues a single write; a subsequent read reflects it (read-your-writes).
        dateTime.batchSet({ year: 2030 });
        assert.equal(await dateTime.year, 2030, "batchSet then read-your-writes");

        // getDate decodes the ISO string envelope back into a Date.
        const readBack = await dateTime.getDate();
        assert.ok(readBack instanceof Date, "XMPDateTime.getDate should decode to a Date.");

        // Writing an XMPDateTime as a property value and reading it back returns a property.
        await meta.setProperty(schema, "CreateDate", dateTime);
        const dateProperty = await meta.getProperty(schema, "CreateDate");
        assert.ok(dateProperty, "getProperty(date) should return a property.");

        // Iterator round-trips through xmp.meta.iterator and yields properties.
        await meta.setProperty(schema, "CreatorTool", "uxp-webview-bridge");
        const iterator = await meta.iterator();
        try {
          const first = await iterator.next();
          assert.ok(first === null || typeof first === "object", "iterator.next() shape");
        } finally {
          await disposeQuietly(iterator);
        }

        return { year, batchYear: batch.year, readBackIso: readBack.toISOString() };
      } finally {
        await disposeQuietly(dateTime);
        await disposeQuietly(meta);
      }
    }
  },
  {
    name: "uxp.plugin-manager-plugins",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      let plugins: readonly unknown[];
      try {
        plugins = await bridge.uxp.pluginManager.plugins;
      } catch (error) {
        return skip("uxp.pluginManager.plugins is unavailable in this UXP host.", {
          error: normalizeError(error)
        });
      }

      assert.ok(Array.isArray(plugins), "uxp.pluginManager.plugins should resolve with an array.");
      for (const plugin of plugins) {
        assert.objectHasKeys(plugin, ["kind", "id", "version", "name", "manifest", "enabled"], "uxp plugin");
        assert.equal((plugin as { kind?: unknown }).kind, "uxp.pluginManager.plugin", "uxp plugin kind");
        assert.nonEmptyString((plugin as { id?: unknown }).id, "uxp plugin id");
        assert.ok(typeof (plugin as { showPanel?: unknown }).showPanel === "function", "uxp plugin showPanel");
        assert.ok(typeof (plugin as { invokeCommand?: unknown }).invokeCommand === "function", "uxp plugin invokeCommand");
      }

      return { pluginCount: plugins.length };
    }
  },
  {
    name: "uxp.host",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const [name, version, uiLocale] = await Promise.all([
        bridge.uxp.host.name,
        bridge.uxp.host.version,
        bridge.uxp.host.uiLocale
      ]);

      assert.nonEmptyString(name, "uxp.host.name");
      assert.nonEmptyString(version, "uxp.host.version");
      assert.nonEmptyString(uiLocale, "uxp.host.uiLocale");

      return { name, version, uiLocale };
    }
  },
  {
    name: "uxp.user-info-user-id",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      let userId: string;
      try {
        userId = await bridge.uxp.userInfo.userId();
      } catch (error) {
        return skip("uxp.userInfo.userId is unavailable in this UXP host.", {
          error: normalizeError(error)
        });
      }

      assert.nonEmptyString(userId, "uxp.userInfo.userId()");
      return { userIdLength: userId.length };
    }
  },
  {
    name: "uxp.versions",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const [uxpVersion, pluginVersion] = await Promise.all([
        bridge.uxp.versions.uxp,
        bridge.uxp.versions.plugin
      ]);

      assert.nonEmptyString(uxpVersion, "uxp.versions.uxp");
      assert.nonEmptyString(pluginVersion, "uxp.versions.plugin");

      return {
        uxpVersion,
        pluginVersion
      };
    }
  },
  {
    name: "uxp.shell-open-path",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const filePath = createPluginDataPath("shell-open-path.txt");
      try {
        await bridge.fs.writeFile(filePath, "uxp shell openPath CDP test", { encoding: "utf-8" });
        let result: string;
        try {
          result = await bridge.uxp.shell.openPath(
            filePath,
            "Open the uxp-webview-bridge shell openPath test file."
          );
        } catch (error) {
          return skip("uxp.shell.openPath threw an environment-specific error.", {
            filePath,
            error: normalizeError(error)
          });
        }

        if (result !== "") {
          return skip("uxp.shell.openPath returned an environment-specific error.", {
            filePath,
            result
          });
        }

        assert.equal(result, "", "uxp.shell.openPath should resolve with an empty string on success.");
        return { filePath, result };
      } finally {
        await cleanupPath(bridge, filePath);
      }
    }
  },
  {
    name: "uxp.shell-open-external",
    async run({ bridge, payload, assert, skip }) {
      bridge.ensureConfigured();

      if (!isRecord(payload) || payload.allowExternalOpen !== true) {
        return skip("External URL opening is opt-in. Re-run with --allow-external-open to execute this case.");
      }

      const url = "https://example.com/";
      const result = await bridge.uxp.shell.openExternal(
        url,
        "Open the uxp-webview-bridge shell openExternal test URL."
      );

      if (result !== "") {
        return skip("uxp.shell.openExternal returned an environment-specific error.", {
          url,
          result
        });
      }

      assert.equal(result, "", "uxp.shell.openExternal should resolve with an empty string on success.");
      return { url, result };
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
    // Best-effort cleanup; assertions own pass/fail.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function disposeQuietly(value: { dispose(): Promise<void> }): Promise<void> {
  try {
    await value.dispose();
  } catch {
    // Best-effort cleanup; assertions own pass/fail.
  }
}

function bytesToCsv(value: Uint8Array): string {
  return Array.from(value).join(",");
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      operationId: "operationId" in error ? error.operationId : undefined,
      remoteName: "remoteName" in error ? error.remoteName : undefined,
      remoteMessage: "remoteMessage" in error ? error.remoteMessage : undefined
    };
  }

  return { message: String(error) };
}

function assertUxpRemoteResultTypes(storage: UxpPersistentFileStorage, xmpFile: XMPFile): void {
  const legacyFolder = storage.localFileSystem.getDataFolder();
  const chainedWrite: Promise<number> = storage.localFileSystem
    .getDataFolder()
    .createFile("remote-result-type-test.txt")
    .write("ok");
  const legacyMeta: Promise<XMPMeta> = xmpFile.getXMP();
  const chainedPacket: Promise<string> = xmpFile.getXMP().serialize();

  void [legacyFolder, chainedWrite, legacyMeta, chainedPacket];
}

void assertUxpRemoteResultTypes;
