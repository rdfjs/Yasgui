/**
 * Shared language server error notification (editor-agnostic).
 *
 * Both the Monaco (`@rdfjs/sparql-editor-monaco`) and CodeMirror (`@rdfjs/sparql-editor-codemirror`) editors surface
 * language server (qlue-ls) JSON-RPC error responses through this single component.
 * Each editor only owns the transport-level tap that detects an error and calls {@link LspErrorNotification.show}.
 *
 * @module errorNotification
 */

const STYLE_ID = "sparql-editor-lsp-error-styles";

// Warning-triangle icon (dark amber, matches the pill text), inlined to avoid an extra asset.
const ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234a3206'%3E%3Cpath d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'/%3E%3C/svg%3E\")";

const STYLES = `
.sparql-editor-lsp-error {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 6;
  box-sizing: border-box;
  max-width: min(440px, 85%);
  display: flex;
  gap: 8px;
  padding: 8px 24px 8px 10px;
  background-color: #f3c06b;
  color: #4a3206;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  font-size: 90%;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}
.sparql-editor-lsp-error.is-visible { opacity: 1; transform: none; pointer-events: auto; }
.sparql-editor-lsp-error__icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  background: center / contain no-repeat ${ICON};
}
.sparql-editor-lsp-error__body { min-width: 0; }
.sparql-editor-lsp-error__label { font-weight: 600; }
.sparql-editor-lsp-error__desc {
  margin-top: 2px;
  opacity: 0.7;
  /* Collapsed preview: up to 2 lines, then ellipsis. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.sparql-editor-lsp-error.is-expanded .sparql-editor-lsp-error__desc {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
  white-space: pre-wrap;
  overflow-y: auto;
  max-height: 9rem;
  opacity: 0.85;
}
.sparql-editor-lsp-error__close {
  position: absolute;
  top: 3px;
  right: 4px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 15px;
  line-height: 14px;
  cursor: pointer;
  opacity: 0.6;
}
.sparql-editor-lsp-error__close:hover { opacity: 1; background: rgba(0, 0, 0, 0.08); }
`;

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/** A language server error split into a short label and an optional longer description. */
export interface ParsedLspError {
  label: string;
  description?: string;
}

/** Label length (chars) above which a single-line message is truncated on a word boundary. */
const MAX_LABEL_CHARS = 80;

function cleanLabel(s: string): string {
  return s
    .trim()
    .replace(/[\s:]+$/, "")
    .trim();
}

function truncateOnWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // Cut on the last word boundary, unless that throws away too much of the limit.
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/\s+$/, "") + "...";
}

/**
 * Split a language server error message into a label + description.
 *
 * qlue-ls typically formats errors as a short label followed by a quoted (JSON-encoded) detail, e.g.
 * `Completion query request failed` + `"Query failed! ... \nJsValue(...)"`. When that shape is found
 * the label is the text before the first quote and the description is the unescaped quoted detail.
 * Otherwise the first line becomes the label and the rest the description; a long single line is kept
 * as the label, truncated on a word boundary, with the full text as the (expandable) description.
 */
export function parseLanguageServerError(message: string): ParsedLspError {
  const text = (message ?? "").toString().trim();
  if (!text) return { label: "Language server error" };

  const quote = text.indexOf('"');
  if (quote > 0) {
    const label = cleanLabel(text.slice(0, quote));
    let description = text
      .slice(quote)
      .trim()
      .replace(/^"|"$/g, "")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .trim();
    if (label) return { label, description: description || undefined };
  }

  const nl = text.search(/\r?\n/);
  if (nl > 0) {
    return { label: cleanLabel(text.slice(0, nl)), description: text.slice(nl).trim() || undefined };
  }

  if (text.length > MAX_LABEL_CHARS) {
    return { label: truncateOnWord(text, MAX_LABEL_CHARS), description: text };
  }
  return { label: text };
}

export interface LspErrorNotificationOptions {
  /** Auto-dismiss delay in ms (default 5000). The timer is cleared while the user has it expanded. */
  autoDismissMs?: number;
}

/** A reusable bottom-right error notification bound to one editor (host) element. */
export interface LspErrorNotification {
  /** Parse `message`, render it, make the notification visible and (re)start the auto-dismiss timer. */
  show(message: string): void;
  /** Hide the notification immediately. */
  dismiss(): void;
  /** Remove the notification element and cancel any pending timer. */
  destroy(): void;
}

/**
 * Create a single error notification inside `host` (which must be `position: relative`). The same
 * element is reused for every {@link LspErrorNotification.show} call.
 */
export function createLspErrorNotification(
  host: HTMLElement,
  options: LspErrorNotificationOptions = {},
): LspErrorNotification {
  ensureStyles();
  const autoDismissMs = options.autoDismissMs ?? 5000;

  const root = document.createElement("div");
  root.className = "sparql-editor-lsp-error";
  root.setAttribute("role", "alert");

  const icon = document.createElement("div");
  icon.className = "sparql-editor-lsp-error__icon";

  const body = document.createElement("div");
  body.className = "sparql-editor-lsp-error__body";
  const labelEl = document.createElement("div");
  labelEl.className = "sparql-editor-lsp-error__label";
  const descEl = document.createElement("div");
  descEl.className = "sparql-editor-lsp-error__desc";
  body.appendChild(labelEl);
  body.appendChild(descEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "sparql-editor-lsp-error__close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = "&times;"; // keep source ASCII; renders as a × glyph

  root.appendChild(icon);
  root.appendChild(body);
  root.appendChild(closeBtn);
  host.appendChild(root);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const startTimer = () => {
    clearTimer();
    if (autoDismissMs > 0) timer = setTimeout(dismiss, autoDismissMs);
  };

  function dismiss() {
    clearTimer();
    root.classList.remove("is-visible", "is-expanded");
  }

  function show(message: string) {
    const { label, description } = parseLanguageServerError(message);
    labelEl.innerText = label;
    descEl.innerText = description ?? "";
    descEl.style.display = description ? "" : "none";
    root.classList.remove("is-expanded");
    root.classList.add("is-visible");
    startTimer();
  }

  // Clicking the pill toggles the full description and (while expanded) pauses the auto-dismiss so
  // the user can read it. The close button dismisses immediately.
  root.addEventListener("click", (event) => {
    if (event.target === closeBtn || !descEl.innerText) return;
    if (root.classList.toggle("is-expanded")) clearTimer();
    else startTimer();
  });
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    dismiss();
  });

  function destroy() {
    clearTimer();
    root.remove();
  }

  return { show, dismiss, destroy };
}
