/**
 * Generic, schema-driven settings panel for a language server (classic DOM, no editor dependency).
 *
 * Shared by both SparqlEditor editors: a server describes its tunable settings with a
 * {@link LanguageServerSettingsSchema} (via `LanguageServerDef.configSchema`), the editor renders
 * this modal from that schema and, on Apply, hands the collected values back to the server's
 * `configCallback`. The renderer self-injects its CSS once (same pattern as the LSP error
 * notification), so neither editor needs to ship the styles.
 * @module LanguageServers
 */
import type { LanguageServerSettingsSchema, SettingFieldSchema } from "./types";

export interface SettingsPanelOptions {
  /** Element to overlay the modal in (the yasqe root). */
  root: HTMLElement;
  schema: LanguageServerSettingsSchema;
  /** Server label, used for the default panel title. */
  serverLabel: string;
  /** Currently applied values as a flat `{ [dottedKey]: value }` map. */
  current: Record<string, unknown>;
  /** Called with the collected flat values when the user clicks Apply. */
  onApply: (values: Record<string, unknown>) => void;
}

/** Collect a schema's default values as a flat `{ [dottedKey]: value }` map. */
export function defaultsFromSchema(schema: LanguageServerSettingsSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.properties)) {
    if (field.default !== undefined) out[key] = field.default;
  }
  return out;
}

/** Turn a flat `{ "format.tabSize": 2 }` map into a nested `{ format: { tabSize: 2 } }` object. */
export function unflatten(flat: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] ?? {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

function fieldDefault(field: SettingFieldSchema): boolean | number | string {
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  if (field.enum?.length) return field.enum[0];
  return "";
}

const STYLE_ID = "sparql-editor-settings-styles";
const STYLES = `
.sparql-editor-settings-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 12px; background: rgba(0, 0, 0, 0.35); overflow: auto;
}
.sparql-editor-settings-dialog {
  width: 420px; max-width: 100%; max-height: 100%;
  display: flex; flex-direction: column;
  background: var(--sparql-editor-popup-bg, #fff); color: var(--sparql-editor-text, #000);
  border: 1px solid var(--sparql-editor-popup-border, #e3e3e3); border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3); font-size: 13px;
}
.sparql-editor-settings-header { padding: 12px 16px; border-bottom: 1px solid var(--sparql-editor-popup-border, #e3e3e3); }
.sparql-editor-settings-title { margin: 0; font-size: 15px; font-weight: 600; }
.sparql-editor-settings-body { padding: 8px 16px; overflow: auto; }
.sparql-editor-settings-section { padding: 6px 0; }
.sparql-editor-settings-legend {
  margin: 8px 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--sparql-editor-notification-text, #999);
}
.sparql-editor-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.sparql-editor-settings-row-bool { justify-content: flex-start; cursor: pointer; }
.sparql-editor-settings-row-bool input { margin: 0; }
.sparql-editor-settings-label { flex: 1; }
.sparql-editor-settings-row input[type="number"], .sparql-editor-settings-row input[type="text"], .sparql-editor-settings-row select {
  width: 110px; padding: 3px 6px;
  background: var(--sparql-editor-btn-bg, #fff); color: var(--sparql-editor-text, #000);
  border: 1px solid var(--sparql-editor-btn-border, #ccc); border-radius: 3px;
}
.sparql-editor-settings-help { margin: 0 0 4px; font-size: 11px; color: var(--sparql-editor-notification-text, #999); }
.sparql-editor-settings-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--sparql-editor-popup-border, #e3e3e3);
}
.sparql-editor-settings-btn { padding: 5px 14px; border-radius: 3px; border: 1px solid var(--sparql-editor-btn-border, #ccc); cursor: pointer; font-size: 13px; }
.sparql-editor-settings-btn-secondary { background: var(--sparql-editor-btn-bg, #fff); color: var(--sparql-editor-btn-text, #333); }
.sparql-editor-settings-btn-secondary:hover { background: var(--sparql-editor-btn-hover-bg, #ebebeb); border-color: var(--sparql-editor-btn-hover-border, #adadad); }
.sparql-editor-settings-btn-primary { background: var(--sparql-editor-accent, #337ab7); color: var(--sparql-editor-accent-text, #fff); border-color: var(--sparql-editor-accent, #337ab7); margin-left: 4px; }
.sparql-editor-settings-btn-primary:hover { filter: brightness(1.08); }
`;

function injectStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * Open the settings modal. Returns a dispose function that removes it. A backdrop covers the
 * viewport, Esc and a backdrop click cancel, Apply commits via `onApply`.
 */
export function openSettingsPanel(opts: SettingsPanelOptions): () => void {
  injectStyles();
  const { root, schema, serverLabel, current, onApply } = opts;

  const backdrop = document.createElement("div");
  backdrop.className = "sparql-editor-settings-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "sparql-editor-settings-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "sparql-editor-settings-header";
  const title = document.createElement("h3");
  title.className = "sparql-editor-settings-title";
  title.textContent = schema.title ?? `${serverLabel} settings`;
  header.appendChild(title);
  dialog.appendChild(header);

  const body = document.createElement("div");
  body.className = "sparql-editor-settings-body";
  dialog.appendChild(body);

  // Per-field "read current widget value" closures, keyed by setting path, plus a "set" used by Reset.
  const readers = new Map<string, () => boolean | number | string>();
  const resetters: (() => void)[] = [];

  // Group the fields, preserving insertion order; ungrouped fields go in a leading anonymous section.
  const groups = new Map<string, [string, SettingFieldSchema][]>();
  for (const [key, field] of Object.entries(schema.properties)) {
    const g = field.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([key, field]);
  }

  for (const [groupName, fields] of groups) {
    const section = document.createElement("div");
    section.className = "sparql-editor-settings-section";
    if (groupName) {
      const legend = document.createElement("div");
      legend.className = "sparql-editor-settings-legend";
      legend.textContent = groupName;
      section.appendChild(legend);
    }
    for (const [key, field] of fields) {
      const def = fieldDefault(field);
      const value = current[key] ?? def;
      const row = document.createElement("label");
      row.className = "sparql-editor-settings-row";
      const labelText = field.title ?? key;

      if (field.type === "boolean") {
        row.classList.add("sparql-editor-settings-row-bool");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(value);
        const span = document.createElement("span");
        span.textContent = labelText;
        row.appendChild(input);
        row.appendChild(span);
        readers.set(key, () => input.checked);
        resetters.push(() => {
          input.checked = Boolean(def);
        });
      } else {
        const span = document.createElement("span");
        span.className = "sparql-editor-settings-label";
        span.textContent = labelText;
        row.appendChild(span);
        if (field.type === "string" && field.enum?.length) {
          const select = document.createElement("select");
          for (const opt of field.enum) {
            const o = document.createElement("option");
            o.value = String(opt);
            o.textContent = String(opt);
            select.appendChild(o);
          }
          select.value = String(value);
          row.appendChild(select);
          readers.set(key, () => select.value);
          resetters.push(() => {
            select.value = String(def);
          });
        } else {
          const input = document.createElement("input");
          input.type = field.type === "number" ? "number" : "text";
          if (field.type === "number") {
            if (field.minimum !== undefined) input.min = String(field.minimum);
            if (field.maximum !== undefined) input.max = String(field.maximum);
          }
          input.value = String(value);
          row.appendChild(input);
          readers.set(key, () =>
            field.type === "number" ? (input.value === "" ? Number(def) : Number(input.value)) : input.value,
          );
          resetters.push(() => {
            input.value = String(def);
          });
        }
      }
      section.appendChild(row);
      if (field.description) {
        const help = document.createElement("div");
        help.className = "sparql-editor-settings-help";
        help.textContent = field.description;
        section.appendChild(help);
      }
    }
    body.appendChild(section);
  }

  const footer = document.createElement("div");
  footer.className = "sparql-editor-settings-footer";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "sparql-editor-settings-btn sparql-editor-settings-btn-secondary";
  resetBtn.textContent = "Reset";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "sparql-editor-settings-btn sparql-editor-settings-btn-secondary";
  cancelBtn.textContent = "Cancel";
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "sparql-editor-settings-btn sparql-editor-settings-btn-primary";
  applyBtn.textContent = "Apply";
  footer.append(resetBtn, cancelBtn, applyBtn);
  dialog.appendChild(footer);

  backdrop.appendChild(dialog);
  root.appendChild(backdrop);

  const dispose = () => {
    document.removeEventListener("keydown", onKey, true);
    backdrop.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      dispose();
    }
  };
  document.addEventListener("keydown", onKey, true);

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) dispose();
  });
  resetBtn.addEventListener("click", () => resetters.forEach((r) => r()));
  cancelBtn.addEventListener("click", dispose);
  applyBtn.addEventListener("click", () => {
    const values: Record<string, unknown> = {};
    for (const [key, read] of readers) values[key] = read();
    onApply(values);
    dispose();
  });

  return dispose;
}
