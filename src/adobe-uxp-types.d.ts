declare function require(moduleName: "uxp"): typeof import("uxp");
declare function require(moduleName: "photoshop"): typeof import("photoshop");

declare namespace NodeJS {
  interface Require {
    (moduleName: "uxp"): typeof import("uxp");
    (moduleName: "photoshop"): typeof import("photoshop");
  }
}
