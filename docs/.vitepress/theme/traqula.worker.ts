/**
 * Traqula SPARQL 1.2 language server running as a Web Worker.
 *
 * Consumer-side config: sparqlEditor is language server agnostic and just receives this worker.
 * This is a pure-JS parser (no WASM): it runs the @traqula SPARQL 1.2 parser on every document
 * change and reports syntax errors as LSP diagnostics. It provides no completions.
 */
import { defaultLexerErrorProvider, defaultParserErrorProvider } from "@traqula/chevrotain";
import { Parser } from "@traqula/parser-sparql-1-2";

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspDiagnostic {
  range: LspRange;
  severity: 1 | 2 | 3 | 4;
  message: string;
}

const lexerErrors: { length: number; line?: number; column?: number; message: string }[] = [];
const parserErrors: { token: any; message: string }[] = [];

const parser = new Parser({
  lexerConfig: {
    positionTracking: "full",
    errorMessageProvider: Object.assign({}, defaultLexerErrorProvider, {
      buildUnexpectedCharactersMessage(
        fullText: string,
        startOffset: number,
        length: number,
        line?: number,
        column?: number,
        mode?: string,
      ): string {
        const message = defaultLexerErrorProvider.buildUnexpectedCharactersMessage(
          fullText,
          startOffset,
          length,
          line,
          column,
          mode,
        );
        lexerErrors.push({ length, line, column, message });
        return message;
      },
    }),
  },
  parserConfig: {
    errorMessageProvider: Object.assign({}, defaultParserErrorProvider, {
      buildMismatchTokenMessage(options: any): string {
        const message = defaultParserErrorProvider.buildMismatchTokenMessage(options);
        parserErrors.push({ token: options.actual, message });
        return message;
      },
      buildNotAllInputParsedMessage(options: any): string {
        const message = defaultParserErrorProvider.buildNotAllInputParsedMessage(options);
        parserErrors.push({ token: options.firstRedundant, message });
        return message;
      },
      buildNoViableAltMessage(options: any): string {
        const message = defaultParserErrorProvider.buildNoViableAltMessage(options);
        const token = options.actual?.[0] ?? options.previous;
        parserErrors.push({ token, message });
        return message;
      },
      buildEarlyExitMessage(options: any): string {
        const message = defaultParserErrorProvider.buildEarlyExitMessage(options);
        const token = options.actual?.[0] ?? options.previous;
        parserErrors.push({ token, message });
        return message;
      },
    }),
  },
});

function tokenToRange(token: any): LspRange {
  const startLine = Math.max(0, (token?.startLine ?? 1) - 1);
  const startChar = Math.max(0, (token?.startColumn ?? 1) - 1);
  const endLine = Math.max(0, (token?.endLine ?? token?.startLine ?? 1) - 1);
  // chevrotain endColumn is 1-indexed inclusive; convert to 0-indexed exclusive
  const endChar = token?.endColumn ?? startChar + 1;
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  };
}

function runParser(text: string): LspDiagnostic[] {
  lexerErrors.length = 0;
  parserErrors.length = 0;
  try {
    parser.parse(text);
  } catch {
    // errors already captured by the providers above
  }
  const diagnostics: LspDiagnostic[] = [];
  for (const err of lexerErrors) {
    const line = Math.max(0, (err.line ?? 1) - 1);
    const character = Math.max(0, (err.column ?? 1) - 1);
    diagnostics.push({
      range: {
        start: { line, character },
        end: { line, character: character + err.length },
      },
      severity: 1,
      message: err.message,
    });
  }
  for (const err of parserErrors) {
    diagnostics.push({
      range: tokenToRange(err.token),
      severity: 1,
      message: err.message,
    });
  }
  return diagnostics;
}

onmessage = function handleIncomingMessage(event: MessageEvent) {
  const msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  const { id, method, params } = msg;
  if (method === "initialize") {
    postMessage({
      jsonrpc: "2.0",
      id,
      result: {
        capabilities: {
          textDocumentSync: 1, // Full: client always sends complete document text
        },
      },
    });
  } else if (method === "textDocument/didOpen") {
    const { textDocument } = params;
    const diagnostics = runParser(textDocument.text);
    postMessage({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: textDocument.uri,
        diagnostics,
      },
    });
  } else if (method === "textDocument/didChange") {
    const { textDocument, contentChanges } = params;
    const text: string = contentChanges[contentChanges.length - 1].text;
    const diagnostics = runParser(text);
    postMessage({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: textDocument.uri,
        diagnostics,
      },
    });
  }
};

postMessage("ready");
