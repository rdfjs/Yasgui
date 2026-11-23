/**
 * Language-server controls shared by both editors: a dropdown button showing the active server
 * (click opens a menu listing every configured server) and a "configure" button opening that
 * server's settings panel. Self-injects its CSS once (same pattern as the settings panel), so
 * neither editor package has to ship the styles.
 * @module LanguageServers
 */
import type { LanguageServerInfo } from "../yasqe";

const STYLE_ID = "sparql-editor-ls-controls-styles";

/** Sliders ("tune") icon for the configure button, distinct from the tab settings gear. */
const TUNE_ICON =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>';

const STYLES = `
.sparql-editor_lsControls { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.sparql-editor_lsControls[hidden], .sparql-editor_lsControls [hidden] { display: none; }
.sparql-editor_lsSelect {
  font-size: 12px; line-height: 1.5; padding: 3px 20px 3px 8px;
  position: relative; max-width: 180px; border-radius: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sparql-editor_lsSelect::after {
  content: ""; position: absolute; right: 8px; top: 50%; margin-top: -2px;
  border-left: 4px solid transparent; border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
}
.sparql-editor_lsConfigure {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px;
}
.sparql-editor_lsConfigure svg { width: 15px; height: 15px; fill: currentColor; display: block; }
.sparql-editor_lsMenu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 10;
  min-width: 210px; max-width: 290px; padding: 4px;
  background-color: var(--sparql-editor-popup-bg, #fff); color: var(--sparql-editor-text, #000);
  border: 1px solid var(--sparql-editor-popup-border, #ccc); border-radius: 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
}
.sparql-editor_lsMenu .sparql-editor_lsMenuItem {
  position: relative; display: block; width: 100%; box-sizing: border-box;
  margin: 0; padding: 5px 8px 5px 22px;
  border: none; border-radius: 3px; background: none; color: inherit;
  font: inherit; font-size: 12px; line-height: 1.35;
  text-align: left; cursor: pointer; white-space: normal;
}
.sparql-editor_lsMenu .sparql-editor_lsMenuItem:hover { background-color: var(--sparql-editor-btn-hover-bg, #ebebeb); }
/* The active server is marked with a check, not a filled row */
.sparql-editor_lsMenu .sparql-editor_lsMenuItem.active::before {
  content: "\\2713"; position: absolute; left: 7px; top: 5px;
  font-size: 11px; line-height: 1.35; color: var(--sparql-editor-accent, #337ab7);
}
.sparql-editor_lsMenu .sparql-editor_lsMenuItem.active .sparql-editor_lsMenuLabel { color: var(--sparql-editor-accent, #337ab7); }
.sparql-editor_lsMenuLabel { display: block; font-weight: 600; }
.sparql-editor_lsMenuDesc { display: block; margin-top: 1px; font-size: 11px; opacity: 0.65; }
`;

function injectStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

export interface LanguageServerControlsOptions {
  /** Row the controls are appended to (the editor's buttons bar). */
  container: HTMLElement;
  getServers: () => LanguageServerInfo[];
  /** Index of the active server, -1 when none is active. */
  getActiveIndex: () => number;
  /** Whether that server exposes a settings panel (drives the configure button). */
  isConfigurable: (index: number) => boolean;
  onSelect: (index: number) => void;
  onConfigure: () => void;
}

export interface LanguageServerControls {
  /** Wrapper holding the dropdown, the configure button and the (transient) menu. */
  el: HTMLElement;
  /** Refresh the dropdown label and which buttons are shown. Call after the active server changes. */
  update: () => void;
  destroy: () => void;
}

/** Draw the language-server dropdown + configure button into `container`. */
export function createLanguageServerControls(opts: LanguageServerControlsOptions): LanguageServerControls {
  injectStyles();
  const wrapper = document.createElement("div");
  wrapper.className = "sparql-editor_lsControls";
  opts.container.appendChild(wrapper);

  let menu: HTMLDivElement | undefined;
  const closeMenu = () => {
    menu?.remove();
    menu = undefined;
  };

  // Dropdown: label of the active server, opens the list of servers on click
  const select = document.createElement("button");
  select.className = "sparql-editor_btn sparql-editor_lsSelect";
  select.title = "Select language server";
  select.setAttribute("aria-label", "Select language server");
  wrapper.appendChild(select);

  const openMenu = () => {
    menu = document.createElement("div");
    menu.className = "sparql-editor_lsMenu";
    const activeIndex = opts.getActiveIndex();
    opts.getServers().forEach((server, i) => {
      const item = document.createElement("button");
      item.className = "sparql-editor_lsMenuItem" + (i === activeIndex ? " active" : "");
      const label = document.createElement("span");
      label.className = "sparql-editor_lsMenuLabel";
      label.textContent = server.label;
      item.appendChild(label);
      if (server.description) {
        const desc = document.createElement("span");
        desc.className = "sparql-editor_lsMenuDesc";
        desc.textContent = server.description;
        item.appendChild(desc);
      }
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        opts.onSelect(i);
      });
      menu!.appendChild(item);
    });
    wrapper.appendChild(menu);
  };
  select.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu) closeMenu();
    else openMenu();
  });

  // Configure: opens the active server's settings panel
  const configure = document.createElement("button");
  configure.className = "sparql-editor_btn btn_icon sparql-editor_lsConfigure";
  configure.innerHTML = TUNE_ICON;
  configure.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMenu();
    opts.onConfigure();
  });
  wrapper.appendChild(configure);

  const onDocumentClick = (e: MouseEvent) => {
    if (menu && !wrapper.contains(e.target as Node)) closeMenu();
  };
  document.body.addEventListener("click", onDocumentClick, true);

  const update = () => {
    const servers = opts.getServers();
    const active = opts.getActiveIndex();
    // The dropdown only makes sense with something to switch between
    select.hidden = servers.length < 2;
    select.textContent = servers[active]?.label ?? "Language server";
    configure.hidden = !(active >= 0 && opts.isConfigurable(active));
    const configureLabel = `Configure ${servers[active]?.label ?? "language server"}`;
    configure.title = configureLabel;
    configure.setAttribute("aria-label", configureLabel);
    wrapper.hidden = select.hidden && configure.hidden;
  };
  update();

  return {
    el: wrapper,
    update,
    destroy: () => {
      closeMenu();
      document.body.removeEventListener("click", onDocumentClick, true);
      wrapper.remove();
    },
  };
}
