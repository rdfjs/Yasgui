/// <reference types="vite/client" />

/** Default SPARQL endpoint used across the demo pages. */
export const DEMO_ENDPOINT = "https://sparql.dblp.org/sparql";

export type DevTheme = "light" | "dark";

/**
 * Wire the demo page's light/dark switcher: start from the OS preference, and on toggle set the
 * `[data-theme]` attribute (which drives the CSS) and call `onThemeChange` (e.g. editor.setTheme).
 */
export function setupThemeToggle(onThemeChange?: (theme: DevTheme) => void): DevTheme {
  let currentTheme: DevTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;
  const button = document.getElementById("darkModeToggle");
  const render = () => {
    if (!button) return;
    button.textContent = currentTheme === "dark" ? "☀️" : "🌙";
    const title = currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("title", title);
    button.setAttribute("aria-label", title);
  };
  render();
  button?.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = currentTheme;
    render();
    onThemeChange?.(currentTheme);
  });
  return currentTheme;
}
