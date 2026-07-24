import('./internal/dialog');
import('./internal/entrypoints');
import('./internal/fs');
import('./internal/host');
import('./internal/os');
import('./internal/plugin-manager');
import('./internal/shell');
import('./internal/storage');
import('./internal/user-info');
import('./internal/versions');
import('./internal/xmp');
import('./internal/all-types');

declare module 'uxp' {
  import { dialog } from './internal/dialog';
  import { entrypoints } from './internal/entrypoints';
  import { fs } from './internal/fs';
  import { host } from './internal/host';
  import { os } from './internal/os';
  import { pluginManager } from './internal/plugin-manager';
  import { shell } from './internal/shell';
  import { storage } from './internal/storage';
  import { userInfo } from './internal/user-info';
  import { versions } from './internal/versions';
  import { xmp } from './internal/xmp';

  export type * from './internal/all-types';
  export { dialog, entrypoints, fs, host, os, pluginManager, shell, storage, userInfo, versions, xmp };

  const _default: {
    dialog: typeof dialog;
    entrypoints: typeof entrypoints;
    fs: typeof fs;
    host: typeof host;
    os: typeof os;
    pluginManager: typeof pluginManager;
    shell: typeof shell;
    storage: typeof storage;
    userInfo: typeof userInfo;
    versions: typeof versions;
    xmp: typeof xmp;
  };
  export default _default;
}
