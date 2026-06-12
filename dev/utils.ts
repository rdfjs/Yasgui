/// <reference types="vite/client" />
import QlueLsWorker from "./qluels.worker?worker";
import SwlsWorker from "./swls.worker?worker";

/**
 * Create a qlue-ls language-server worker and resolve once its WASM is initialized.
 * Pass the result to Yasqe/Yasgui via the `languageServerWorker` config option.
 */
export function createQlueLsWorker(): Promise<Worker> {
  return new Promise((resolve) => {
    const worker = new QlueLsWorker({ name: "qlue-ls" });
    worker.onmessage = (event) => {
      if (event.data?.type === "ready") resolve(worker);
    };
  });
}

export function createSwlsWorker(): Promise<Worker> {
  return new Promise((resolve) => {
    const worker = new SwlsWorker({ name: "qlue-ls" });
    // worker.onmessage = (event) => {
    //   if (event.data?.type === "ready") resolve(worker);
    // };
    resolve(worker);
  });
}

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
  const sunSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:1em;height:1em;fill:currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm10-7a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm13.07-6.07a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM7.05 16.95a1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0Zm11.31 1.41a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41ZM7.05 7.05a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41Z"/></svg>`;
  const moonSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:1em;height:1em;fill:currentColor"><path d="M21.64 13a1 1 0 0 0-1.05-.14 8 8 0 0 1-9.45-9.45 1 1 0 0 0-1.19-1.19A10 10 0 1 0 22 14.05a1 1 0 0 0-.36-1.05Z"/></svg>`;
  const render = () => {
    if (!button) return;
    button.innerHTML = currentTheme === "dark" ? sunSvg : moonSvg;
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
