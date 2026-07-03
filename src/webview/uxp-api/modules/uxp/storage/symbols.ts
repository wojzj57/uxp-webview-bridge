type UxpStorageSymbol<TBrand extends string> = symbol & {
  readonly __uxpStorageSymbolBrand: TBrand;
};

export interface UxpStorageDomains {
  readonly appLocalCache: UxpStorageSymbol<"domain">;
  readonly appLocalData: UxpStorageSymbol<"domain">;
  readonly appLocalLibrary: UxpStorageSymbol<"domain">;
  readonly appLocalShared: UxpStorageSymbol<"domain">;
  readonly appLocalTemporary: UxpStorageSymbol<"domain">;
  readonly appRoamingData: UxpStorageSymbol<"domain">;
  readonly appRoamingLibrary: UxpStorageSymbol<"domain">;
  readonly userDesktop: UxpStorageSymbol<"domain">;
  readonly userDocuments: UxpStorageSymbol<"domain">;
  readonly userMusic: UxpStorageSymbol<"domain">;
  readonly userPictures: UxpStorageSymbol<"domain">;
  readonly userVideos: UxpStorageSymbol<"domain">;
}

export interface UxpStorageFormats {
  readonly binary: UxpStorageSymbol<"format">;
  readonly utf8: UxpStorageSymbol<"format">;
}

export interface UxpStorageModes {
  readonly readOnly: UxpStorageSymbol<"mode">;
  readonly readWrite: UxpStorageSymbol<"mode">;
}

export interface UxpStorageTypes {
  readonly file: UxpStorageSymbol<"type">;
  readonly folder: UxpStorageSymbol<"type">;
}

export interface UxpStorageFileTypes {
  readonly all: readonly string[];
  readonly images: readonly string[];
  readonly text: readonly string[];
}

export interface UxpStorageErrors {
  readonly AbstractMethodInvocationError: Error;
  readonly DataFileFormatMismatchError: Error;
  readonly DomainNotSupportedError: Error;
  readonly EntryExistsError: Error;
  readonly EntryIsNotAFileError: Error;
  readonly EntryIsNotAFolderError: Error;
  readonly EntryIsNotAnEntryError: Error;
  readonly FileIsReadOnlyError: Error;
  readonly InvalidFileFormatError: Error;
  readonly InvalidFileNameError: Error;
  readonly NotAFileSystemError: Error;
  readonly OutOfSpaceError: Error;
  readonly PermissionDeniedError: Error;
  readonly ProviderMismatchError: Error;
}

export function createStorageDomains(): UxpStorageDomains {
  return createStorageSymbols([
    "appLocalCache",
    "appLocalData",
    "appLocalLibrary",
    "appLocalShared",
    "appLocalTemporary",
    "appRoamingData",
    "appRoamingLibrary",
    "userDesktop",
    "userDocuments",
    "userMusic",
    "userPictures",
    "userVideos"
  ]);
}

export function createStorageFormats(): UxpStorageFormats {
  return createStorageSymbols(["binary", "utf8"]);
}

export function createStorageModes(): UxpStorageModes {
  return createStorageSymbols(["readOnly", "readWrite"]);
}

export function createStorageTypes(): UxpStorageTypes {
  return createStorageSymbols(["file", "folder"]);
}

export function createStorageFileTypes(): UxpStorageFileTypes {
  return {
    all: Object.freeze([".*"]),
    images: Object.freeze(["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "tif", "tiff"]),
    text: Object.freeze(["txt", "text", "json", "js", "jsx", "ts", "tsx", "css", "html", "xml", "md"])
  };
}

export function createStorageErrors(): UxpStorageErrors {
  const errors = {
    AbstractMethodInvocationError: createNamedStorageError("AbstractMethodInvocationError"),
    DataFileFormatMismatchError: createNamedStorageError("DataFileFormatMismatchError"),
    DomainNotSupportedError: createNamedStorageError("DomainNotSupportedError"),
    EntryExistsError: createNamedStorageError("EntryExistsError"),
    EntryIsNotAFileError: createNamedStorageError("EntryIsNotAFileError"),
    EntryIsNotAFolderError: createNamedStorageError("EntryIsNotAFolderError"),
    EntryIsNotAnEntryError: createNamedStorageError("EntryIsNotAnEntryError"),
    FileIsReadOnlyError: createNamedStorageError("FileIsReadOnlyError"),
    InvalidFileFormatError: createNamedStorageError("InvalidFileFormatError"),
    InvalidFileNameError: createNamedStorageError("InvalidFileNameError"),
    NotAFileSystemError: createNamedStorageError("NotAFileSystemError"),
    OutOfSpaceError: createNamedStorageError("OutOfSpaceError"),
    PermissionDeniedError: createNamedStorageError("PermissionDeniedError"),
    ProviderMismatchError: createNamedStorageError("ProviderMismatchError")
  };
  return Object.freeze(errors);
}

function createStorageSymbols<const TName extends string, TBrand extends string = string>(
  names: readonly TName[]
): { readonly [TKey in TName]: UxpStorageSymbol<TBrand> } {
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, Symbol(`uxp.storage.${name}`)]))
  ) as { readonly [TKey in TName]: UxpStorageSymbol<TBrand> };
}

function createNamedStorageError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}
