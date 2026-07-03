import type { BridgeCapabilities } from "../../../../shared/types.js";
import {
  assertUxpMethodName,
  bytesToSecureStorageTransportValue,
  isUxpSecureStorageTransportValue,
  secureStorageTransportToHostValue,
  UXP_MODULE_ID,
  type UxpMethodName
} from "../../../../shared/contracts/uxp.js";
import type { UxpModuleAdapter } from "../../../module-registry.js";

declare const require: (moduleName: "uxp") => UxpHostModule;

interface UxpHostModule {
  readonly host: {
    readonly name: string;
    readonly version: string;
    readonly uiLocale: string;
  };
  readonly versions: {
    readonly uxp: string;
    readonly plugin: string;
  };
  readonly shell?: {
    openPath(path: string, developerText?: string): Promise<string>;
    openExternal(url: string, developerText?: string): Promise<string> | string | void;
  };
  readonly userInfo?: {
    userId(): string;
  };
  readonly storage?: {
    readonly secureStorage?: {
      readonly length: number;
      setItem(key: string, value: string | ArrayBuffer): Promise<void>;
      getItem(key: string): Promise<Uint8Array | ArrayBuffer>;
      removeItem(key: string): Promise<void>;
      key(index: number): string;
      clear(): Promise<void>;
    };
  };
}

export const uxpModuleAdapter: UxpModuleAdapter = {
  moduleId: UXP_MODULE_ID,
  dispatch: (method, args, context) =>
    dispatchUxpCall(method, args, context.capabilities)
};

export async function dispatchUxpCall(
  method: string,
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpMethodName(method);

  switch (method) {
    case "host.name":
    case "host.version":
    case "host.uiLocale":
    case "versions.uxp":
    case "versions.plugin":
      expectUxpArgs(args, 0, 0, `uxp.${method}`);
      return readUxpProperty(method);

    case "shell.openPath": {
      assertUxpCapability(capabilities, "shell");
      const [path, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openPath"
      );
      assertUxpString(path, "uxp.shell.openPath path");
      assertOptionalUxpString(developerText, "uxp.shell.openPath developerText");
      const shell = requireUxpSubmodule("shell");
      return shell.openPath(path, developerText);
    }

    case "shell.openExternal": {
      assertUxpCapability(capabilities, "shell");
      const [url, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openExternal"
      );
      assertUxpString(url, "uxp.shell.openExternal url");
      assertOptionalUxpString(developerText, "uxp.shell.openExternal developerText");
      if (url.startsWith("file:")) {
        throw new Error("uxp.shell.openExternal does not allow file: URLs; use openPath instead.");
      }
      const result = await requireUxpSubmodule("shell").openExternal(url, developerText);
      return typeof result === "string" ? result : "";
    }

    case "userInfo.userId": {
      assertUxpCapability(capabilities, "userInfo");
      expectUxpArgs(args, 0, 0, "uxp.userInfo.userId");
      const userInfo = requireUxpSubmodule("userInfo");
      return userInfo.userId();
    }

    case "storage.secureStorage.length": {
      assertUxpCapability(capabilities, "secureStorage");
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.length");
      return requireSecureStorage().length;
    }

    case "storage.secureStorage.setItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key, value] = expectUxpArgs<[string, unknown]>(
        args,
        2,
        2,
        "uxp.storage.secureStorage.setItem"
      );
      assertStorageKey(key, "uxp.storage.secureStorage.setItem key");
      if (!isUxpSecureStorageTransportValue(value)) {
        throw new Error("uxp.storage.secureStorage.setItem value must be string or binary transport data.");
      }
      await requireSecureStorage().setItem(key, secureStorageTransportToHostValue(value));
      return undefined;
    }

    case "storage.secureStorage.getItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.getItem");
      assertStorageKey(key, "uxp.storage.secureStorage.getItem key");
      const value = await requireSecureStorage().getItem(key);
      return bytesToSecureStorageTransportValue(
        value instanceof Uint8Array ? value : new Uint8Array(value)
      );
    }

    case "storage.secureStorage.removeItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.removeItem");
      assertStorageKey(key, "uxp.storage.secureStorage.removeItem key");
      await requireSecureStorage().removeItem(key);
      return undefined;
    }

    case "storage.secureStorage.key": {
      assertUxpCapability(capabilities, "secureStorage");
      const [index] = expectUxpArgs<[number]>(args, 1, 1, "uxp.storage.secureStorage.key");
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("uxp.storage.secureStorage.key index must be a non-negative integer.");
      }
      return requireSecureStorage().key(index);
    }

    case "storage.secureStorage.clear": {
      assertUxpCapability(capabilities, "secureStorage");
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.clear");
      await requireSecureStorage().clear();
      return undefined;
    }
  }
}

function readUxpProperty(method: UxpMethodName): string {
  const uxp = require("uxp");
  switch (method) {
    case "host.name":
      return uxp.host.name;
    case "host.version":
      return uxp.host.version;
    case "host.uiLocale":
      return uxp.host.uiLocale;
    case "versions.uxp":
      return uxp.versions.uxp;
    case "versions.plugin":
      return uxp.versions.plugin;
    default:
      throw new Error(`Unsupported uxp property: ${method}`);
  }
}

function requireSecureStorage(): NonNullable<
  NonNullable<UxpHostModule["storage"]>["secureStorage"]
> {
  const secureStorage = require("uxp").storage?.secureStorage;
  if (!secureStorage) {
    throw new Error("uxp.storage.secureStorage is not available in this UXP host.");
  }
  return secureStorage;
}

function requireUxpSubmodule<TName extends "shell" | "userInfo">(
  name: TName
): NonNullable<UxpHostModule[TName]> {
  const submodule = require("uxp")[name];
  if (!submodule) {
    throw new Error(`uxp.${name} is not available in this UXP host.`);
  }
  return submodule;
}

function expectUxpArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

function assertUxpCapability(
  capabilities: BridgeCapabilities,
  capability: keyof BridgeCapabilities["uxp"]
): void {
  if (!capabilities.uxp[capability]) {
    throw new Error(`uxp ${capability} capability is disabled.`);
  }
}

function assertStorageKey(value: string, label: string): void {
  assertUxpString(value, label);
  if (value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

function assertUxpString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function assertOptionalUxpString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}
