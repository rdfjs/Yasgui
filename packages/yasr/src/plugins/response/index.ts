/**
 * Make sure not to include any deps from our main index file. That way, we can easily publish the publin as standalone build
 */
import type { Plugin } from "../";
import Yasr from "../../";
import "./index.scss";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { foldGutter, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { drawSvgStringAsElement, addClass, removeClass, drawFontAwesomeIconAsSvg } from "@zazuko/yasgui-utils";
import * as faAlignIcon from "@fortawesome/free-solid-svg-icons/faAlignLeft";
import { DeepReadonly } from "ts-essentials";
import * as imgs from "../../imgs";

const responseTheme = EditorView.theme({
  "&": {
    color: "var(--yr-cm-text, #000)",
    backgroundColor: "var(--yr-cm-bg, #fff)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--yr-cm-gutter-bg, #f5f5f5)",
    color: "var(--yr-cm-gutter-text, #999)",
    border: "none",
  },
});

export interface PluginConfig {
  maxLines: number;
}
export default class Response implements Plugin<PluginConfig> {
  private yasr: Yasr;
  label = "Response";
  priority = 2;
  helpReference = "https://vemonet.github.io/Yasgui/docs/plugins#response";
  private config: DeepReadonly<PluginConfig>;
  private overLay: HTMLDivElement | undefined;
  private cm: EditorView | undefined;
  constructor(yasr: Yasr) {
    this.yasr = yasr;
    this.config = Response.defaults;
    if (yasr.config.plugins["response"] && yasr.config.plugins["response"].dynamicConfig) {
      this.config = {
        ...this.config,
        ...yasr.config.plugins["response"].dynamicConfig,
      };
    }
  }
  // getDownloadInfo: getDownloadInfo
  canHandleResults() {
    if (!this.yasr.results) return false;
    if (!this.yasr.results.getOriginalResponseAsString) return false;
    var response = this.yasr.results.getOriginalResponseAsString();
    if ((!response || response.length == 0) && this.yasr.results.getError()) return false; //in this case, show exception instead, as we have nothing to show anyway
    return true;
  }
  public getIcon() {
    return drawSvgStringAsElement(drawFontAwesomeIconAsSvg(faAlignIcon));
  }
  download(filename?: string) {
    if (!this.yasr.results) return;
    const contentType = this.yasr.results.getContentType();
    const type = this.yasr.results.getType();
    const extension = type === "xml" ? "rdf" : type;
    return {
      getData: () => {
        return this.yasr.results?.getOriginalResponseAsString() || "";
      },
      filename: `${filename || "queryResults"}${extension ? "." + extension : ""}`,
      contentType: contentType ? contentType : "text/plain",
      title: "Download result",
    };
  }
  draw(persistentConfig: PluginConfig) {
    const config: DeepReadonly<PluginConfig> = {
      ...this.config,
      ...persistentConfig,
    };
    // When the original response is empty, use an empty string
    let value = this.getResponseString();
    const lines = value.split("\n");
    if (lines.length > config.maxLines) {
      value = lines.slice(0, config.maxLines).join("\n");
    }

    const extensions = [
      lineNumbers(),
      foldGutter(),
      // syntaxHighlighting(responseHighlight),
      syntaxHighlighting(defaultHighlightStyle),
      responseTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    const mode = this.yasr.results?.getType();
    if (mode === "json") {
      extensions.push(json());
    }

    this.cm = new EditorView({
      parent: this.yasr.resultsEl,
      state: EditorState.create({
        doc: value,
        extensions,
      }),
    });
    // Don't show less originally we've already set the value in the doc
    if (lines.length > config.maxLines) this.showLess(false);
  }
  private limitData(value: string) {
    const lines = value.split("\n");
    if (lines.length > this.config.maxLines) {
      value = lines.slice(0, this.config.maxLines).join("\n");
    }
    return value;
  }
  /**
   *
   * @param setValue Optional, if set to false the string will not update
   */
  showLess(setValue = true) {
    if (!this.cm) return;
    // Add overflow
    addClass(this.cm.dom, "overflow");

    // Remove old instance
    if (this.overLay) {
      this.overLay.remove();
      this.overLay = undefined;
    }

    // Wrapper
    this.overLay = document.createElement("div");
    addClass(this.overLay, "overlay");

    // overlay content
    const overlayContent = document.createElement("div");
    addClass(overlayContent, "overlay_content");

    const showMoreButton = document.createElement("button");
    showMoreButton.title = "Show all";
    addClass(showMoreButton, "yasr_btn", "overlay_btn");
    showMoreButton.textContent = "Show all";
    showMoreButton.addEventListener("click", () => this.showMore());
    overlayContent.append(showMoreButton);

    const downloadButton = document.createElement("button");
    downloadButton.title = "Download result";
    addClass(downloadButton, "yasr_btn", "overlay_btn");

    const text = document.createElement("span");
    text.innerText = "Download result";
    downloadButton.appendChild(text);
    downloadButton.appendChild(drawSvgStringAsElement(imgs.download));
    downloadButton.addEventListener("click", () => this.yasr.download());
    downloadButton.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "Enter") this.yasr.download();
    });

    overlayContent.appendChild(downloadButton);
    this.overLay.appendChild(overlayContent);
    this.cm.dom.appendChild(this.overLay);
    if (setValue) {
      this.setValue(this.limitData(this.getResponseString()));
    }
  }
  /**
   * Render the raw response full length
   */
  showMore() {
    if (!this.cm) return;
    removeClass(this.cm.dom, "overflow");
    this.overLay?.remove();
    this.overLay = undefined;
    this.setValue(this.getResponseString());
  }
  private setValue(value: string) {
    if (!this.cm) return;
    this.cm.dispatch({ changes: { from: 0, to: this.cm.state.doc.length, insert: value } });
  }
  /**
   * The string shown in the editor. JSON responses are pretty-printed with a 2-space indent;
   * anything else (and unparseable JSON) is shown verbatim.
   */
  private getResponseString(): string {
    const value = this.yasr.results?.getOriginalResponseAsString() || "";
    if (this.yasr.results?.getType() === "json") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  public static defaults: PluginConfig = {
    maxLines: 30,
  };
}

// NOTE: to customize JSON token colors:
// import { tags as t } from "@lezer/highlight";
// const responseHighlight = HighlightStyle.define([
//   { tag: t.propertyName, color: "var(--yr-cm-property, #0451a5)" },
//   { tag: t.string, color: "var(--yr-cm-string, #a31515)" },
//   { tag: t.number, color: "var(--yr-cm-number, #098658)" },
//   { tag: [t.bool, t.null], color: "var(--yr-cm-atom, #0000ff)" },
// ]);
