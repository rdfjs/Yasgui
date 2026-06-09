import { default as Yasqe } from "./";

export type Prefixes = { [prefixLabel: string]: string };

const PREFIX_REGEX = /^\s*PREFIX\s+([\w-]*)\s*:\s*<([^>]*)>\s*$/gim;

export function addPrefixes(yasqe: Yasqe, prefixes: string | Prefixes) {
  const existing = getPrefixesFromQuery(yasqe);
  if (typeof prefixes === "string") {
    addPrefixAsString(yasqe, prefixes);
  } else {
    for (const pref in prefixes) {
      if (!(pref in existing)) addPrefixAsString(yasqe, pref + ": <" + prefixes[pref] + ">");
    }
  }
}

export function addPrefixAsString(yasqe: Yasqe, prefixString: string) {
  const line = "PREFIX " + prefixString + "\n";
  yasqe.dispatch({ changes: { from: 0, to: 0, insert: line } });
}

export function removePrefixes(yasqe: Yasqe, prefixes: Prefixes) {
  const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  let value = yasqe.getValue();
  for (const pref in prefixes) {
    value = value.replace(
      new RegExp("PREFIX\\s*" + pref + ":\\s*" + escapeRegex("<" + prefixes[pref] + ">") + "\\s*", "ig"),
      "",
    );
  }
  yasqe.setValue(value);
}

/**
 * Extract PREFIX declarations from the query value via regex.
 */
export function getPrefixesFromQuery(yasqe: Yasqe): Prefixes {
  const value = yasqe.getValue();
  const out: Prefixes = {};
  // Reset regex state since /g
  PREFIX_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PREFIX_REGEX.exec(value)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}
