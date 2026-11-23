/// <reference types="vite/client" />

declare module "*?worker" {
  const worker: {
    new (): Worker;
  };
  export default worker;
}

declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}

// Internal monaco-vscode-api modules used to render the language server right-click submenu
// (MenuRegistry/MenuId/CommandsRegistry/ContextKeyExpr). Reachable at runtime via the package's
// `./vscode/*` export (aliased to concrete files in vite.config.ts), but that export exposes no
// `types` condition, so TS can't resolve their declarations. We import them as `any`.
declare module "@codingame/monaco-vscode-api/vscode/src/vs/platform/actions/common/actions";
declare module "@codingame/monaco-vscode-api/vscode/src/vs/platform/commands/common/commands";
declare module "@codingame/monaco-vscode-api/vscode/src/vs/platform/contextkey/common/contextkey";
