# Theming

Yasgui supports light and dark themes through two layers, both following standard mechanisms:

1. **The Monaco editor**, set via `theme: "light" | "dark"` in config, or at runtime with
   `yasqe.setTheme("dark")`. The default follows the OS `prefers-color-scheme`.
2. **The surrounding chrome CSS** (buttons, tabs, result table), driven by a `data-theme` attribute
   on `<html>` **and** the OS preference. `setTheme()` sets `document.documentElement.dataset.theme`.

The built-in CSS auto-adapts to dark mode:

- `@media (prefers-color-scheme: dark)`, follows the OS automatically.
- `html[data-theme="dark"]`, explicit opt-in; `html[data-theme="light"]` forces light.

## A minimal app-level toggle

```ts
function setTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme; // drives the chrome CSS
  yasgui.yasqe?.setTheme(theme);                   // drives the Monaco editor
}
```

Set the initial theme from the OS preference:

```ts
const initial = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
setTheme(initial);
```

::: tip Integrating with a framework's dark mode
If your app already has a dark-mode switch (Tailwind, VitePress, etc.), just call both lines from its
change handler. The [live demo](/) wires Yasgui's theme to VitePress' own dark-mode toggle this way.
:::
