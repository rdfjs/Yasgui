import { defineConfig } from "vitepress";
import wasm from "vite-plugin-wasm";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import typedocSidebar from "../api/typedoc-sidebar.json";

const siteUrl = "https://sparql.studio";
const ogImage = `${siteUrl}/sparql-studio.svg`;

const shortDescription= "SPARQL query editor and results viewer";
const description= "Modular SPARQL query editor and results viewer for the web, with multiple language servers available";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "SPARQL Studio",
  description,
  base: "/",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://sparql.studio/",
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/sparql-studio.svg" }],
    ["link", { rel: "alternate icon", href: "/sparql-studio.svg" }],
    ["meta", { name: "author", content: "SPARQL Studio contributors" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "SPARQL Studio, SPARQL, SPARQL editor, SPARQL query, SPARQL results, RDF, linked data, semantic web, Yasgui, Yasqe, Yasr, query editor, SPARQL GUI, Monaco editor",
      },
    ],
    ["meta", { name: "theme-color", content: "#7d3fbd" }],
    // Open Graph
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "SPARQL Studio" }],
    ["meta", { property: "og:title", content: shortDescription }],
    [
      "meta",
      {
        property: "og:description",
        content: description,
      },
    ],
    ["meta", { property: "og:image", content: ogImage }],
    ["meta", { property: "og:url", content: `${siteUrl}/` }],
    // Twitter
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "twitter:title", content: shortDescription }],
    [
      "meta",
      {
        name: "twitter:description",
        content: description,
      },
    ],
    ["meta", { name: "twitter:image", content: ogImage }],
  ],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/sparql-studio.svg",
    nav: [
      { text: "Monaco Editor", link: "/" },
      { text: "CodeMirror Editor", link: "/codemirror" },
      { text: "Documentation", link: "/docs/introduction" },
      { text: "API Reference", link: "/api/" },
    ],
    sidebar: {
      "/docs/": [
        {
          text: "Introduction",
          items: [
            { text: "What is SPARQL Studio?", link: "/docs/introduction" },
            { text: "Getting started", link: "/docs/getting-started" },
          ],
        },
        {
          text: "Packages",
          items: [
            { text: "SPARQL Studio", link: "/docs/sparql-studio" },
            { text: "SPARQL Editor", link: "/docs/sparql-editor" },
            { text: "SPARQL Results", link: "/docs/sparql-results" },
          ],
        },
        {
          text: "Configuration",
          items: [
            { text: "Language server", link: "/docs/language-server" },
            { text: "Results plugins", link: "/docs/plugins" },
            { text: "Request configuration", link: "/docs/request-config" },
            { text: "Theming", link: "/docs/theming" },
            { text: "Monaco editor options", link: "/docs/editor-options" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Build from source", link: "/docs/build" },
            { text: "API reference", link: "/api/" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [{ text: "Overview", link: "/api/" }],
        },
        ...typedocSidebar,
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/rdfjs/Yasgui" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/rdfjs/Yasgui/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: '<a href="/docs/introduction">Documentation</a> · <a href="https://github.com/rdfjs/Yasgui">Source code</a>',
      copyright: "MIT License",
    },
  },
  vite: {
    // The demo imports the @rdfjs/* packages' pre-built
    // Run `npm run build:lib` before building/serving the docs so those bundles exist
    // esnext is required because the qlue-ls / swls wasm glue emits top-level await; VitePress's
    // default es2020 target rejects it (and the worker bundle inherits this target).
    build: { target: "esnext" },
    css: {
      preprocessorOptions: {
        scss: { api: "modern-compiler" },
      },
    },
    resolve: {
      // Deduplicate cm packages so the docs site and qlue-ls client
      // share one CM6 instance and avoid extension-instance runtime errors.
      dedupe: [
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/commands",
        "@codemirror/search",
        "@codemirror/autocomplete",
        "@codemirror/lint",
        "@codemirror/lsp-client",
        "@lezer/common",
        "@lezer/highlight",
      ],
    },
    // The qlue-ls language server worker is compiled here and loads WebAssembly, so it needs
    // the wasm plugin, ES-format workers and the import.meta.url esbuild rewrite (dev pre-bundling).
    plugins: [wasm()],
    worker: {
      format: "es",
      plugins: () => [wasm()],
    },
    optimizeDeps: {
      esbuildOptions: { plugins: [importMetaUrlPlugin as any] },
      // The pre-built editor bundles ship their own internal chunks/assets; swls-wasm imports its
      // .wasm directly (handled by vite-plugin-wasm, not esbuild dep pre-bundling).
      exclude: ["@rdfjs/sparql-studio", "@rdfjs/sparql-editor-monaco", "@rdfjs/sparql-editor-codemirror", "@rdfjs/sparql-results", "qlue-ls", "swls-wasm"],
    },
    ssr: {
      // The demo is client-only, so the editor deps must not enter the server bundle
      external: [
        "@rdfjs/sparql-studio",
        "@rdfjs/sparql-editor-monaco",
        "@rdfjs/sparql-editor-codemirror",
        "@rdfjs/sparql-results",
        "@rdfjs/sparql-utils",
        "@matdata/yasgui-graph-plugin",
        "yasgui-geo-tg",
      ],
    },
  },
});
