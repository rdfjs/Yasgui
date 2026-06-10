import { defineConfig } from "vitepress";
import wasm from "vite-plugin-wasm";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Yasgui",
  description: "Yet Another SPARQL GUI · a Monaco-based SPARQL query editor and result viewer",
  base: "/Yasgui/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/Yasgui/yasgui.png" }],
    ["link", { rel: "alternate icon", href: "/Yasgui/yasgui.png" }],
  ],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/yasgui.png",
    // nav: [
    //   { text: "Demo", link: "/" },
    //   { text: "API", link: "/docs/api" },
    // ],
    sidebar: {
      "/docs/": [
        {
          text: "Introduction",
          items: [
            { text: "What is Yasgui?", link: "/docs/introduction" },
            { text: "Getting started", link: "/docs/getting-started" },
          ],
        },
        {
          text: "Packages",
          items: [
            { text: "Yasgui (full app)", link: "/docs/yasgui" },
            { text: "Yasqe (editor)", link: "/docs/yasqe" },
            { text: "Yasr (results)", link: "/docs/yasr" },
          ],
        },
        {
          text: "Configuration",
          items: [
            { text: "Language server", link: "/docs/language-server" },
            { text: "Result plugins", link: "/docs/plugins" },
            { text: "Request configuration", link: "/docs/request-config" },
            { text: "Theming", link: "/docs/theming" },
            { text: "Monaco editor options", link: "/docs/editor-options" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Yasqe API", link: "/docs/api" },
            { text: "Build from source", link: "/docs/build" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/rdfjs/Yasgui" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/rdfjs/Yasgui/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: '<a href="/Yasgui/docs/introduction">Documentation</a> · <a href="https://github.com/rdfjs/Yasgui">Source code</a>',
      copyright: "MIT License",
    },
  },
  vite: {
    // The demo imports the @zazuko/* packages' pre-built
    // Run `npm run build:lib` before building/serving the docs so those bundles exist
    css: {
      preprocessorOptions: {
        scss: { api: "modern-compiler" },
      },
    },
    // The qlue-ls language-server worker is compiled here and loads WebAssembly, so it needs
    // the wasm plugin, ES-format workers and the import.meta.url esbuild rewrite (dev pre-bundling).
    plugins: [wasm()],
    worker: {
      format: "es",
      plugins: () => [wasm()],
    },
    optimizeDeps: {
      esbuildOptions: { plugins: [importMetaUrlPlugin as any] },
      // The pre-built editor bundles ship their own internal chunks/assets
      exclude: ["@zazuko/yasgui", "@zazuko/yasqe", "@zazuko/yasr"],
    },
    ssr: {
      // The demo is client-only, so the editor deps must not enter the server bundle
      external: [
        "@zazuko/yasgui",
        "@zazuko/yasqe",
        "@zazuko/yasr",
        "@zazuko/yasgui-utils",
        "@matdata/yasgui-graph-plugin",
        "yasgui-geo-tg",
      ],
    },
  },
});
