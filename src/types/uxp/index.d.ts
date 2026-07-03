import('./internal/entrypoints');
import('./internal/host');
import('./internal/os');
import('./internal/plugin-manager');
import('./internal/script');
import('./internal/shell');
import('./internal/storage');
import('./internal/user-info');
import('./internal/versions');
import('./internal/all-types');

declare module 'uxp' {
  import { entrypoints } from './internal/entrypoints';
  import { host } from './internal/host';
  import { os } from './internal/os';
  import { pluginManager } from './internal/plugin-manager';
  import { script } from './internal/script';
  import { shell } from './internal/shell';
  import { storage } from './internal/storage';
  import { userInfo } from './internal/user-info';
  import { versions } from './internal/versions';

  export type * from './internal/all-types';
  export { entrypoints, host, os, pluginManager, script, shell, storage, userInfo, versions };

  const _default: {
    entrypoints: typeof entrypoints;
    host: typeof host;
    os: typeof os;
    pluginManager: typeof pluginManager;
    script: typeof script;
    shell: typeof shell;
    storage: typeof storage;
    userInfo: typeof userInfo;
    versions: typeof versions;
  };
  export default _default;
}
