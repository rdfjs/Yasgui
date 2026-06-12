/**
 * SPARQL request handling shared by both editors (Monaco `@zazuko/yasqe` and CodeMirror
 * `@zazuko/yasqe-codemirror`). Builds the HTTP request from the editor's request config + query,
 * executes it, and emits the query lifecycle events.
 *
 * It operates on the editor-agnostic {@link IYasqe} contract and emits events payload-only: every
 * editor's `emit` prepends the instance, so handlers receive `(instance, ...payload)`.
 * @module sparql
 */
import { merge, isFunction } from "lodash-es";
import * as queryString from "query-string";
import type { IYasqe, RequestConfig, RequestArgs } from "./yasqe";

/** A request config, or a function returning one (resolved against the editor at request time). */
export type YasqeAjaxConfig = RequestConfig<IYasqe> | ((yasqe: IYasqe) => RequestConfig<IYasqe>);

/** A fully-resolved request, ready to be turned into a `fetch` call. */
export interface PopulatedAjaxConfig {
  url: string;
  reqMethod: "POST" | "GET";
  headers: { [key: string]: string };
  accept: string;
  args: RequestArgs;
  withCredentials: boolean;
}

function getRequestConfigSettings(yasqe: IYasqe, conf?: YasqeAjaxConfig): RequestConfig<IYasqe> {
  if (isFunction(conf)) {
    return conf(yasqe) as RequestConfig<IYasqe>;
  }
  return (conf ?? {}) as RequestConfig<IYasqe>;
}

export function getAjaxConfig(yasqe: IYasqe, _config?: YasqeAjaxConfig): PopulatedAjaxConfig | undefined {
  const config: RequestConfig<IYasqe> = merge(
    {},
    getRequestConfigSettings(yasqe, yasqe.config.requestConfig as YasqeAjaxConfig),
    getRequestConfigSettings(yasqe, _config),
  );
  if (!config.endpoint || config.endpoint.length == 0) return; // nothing to query!

  const queryMode = yasqe.getQueryMode();
  const endpoint = isFunction(config.endpoint) ? config.endpoint(yasqe) : config.endpoint;
  const reqMethod: "GET" | "POST" =
    queryMode == "update" ? "POST" : isFunction(config.method) ? config.method(yasqe) : config.method;
  const headers = isFunction(config.headers) ? config.headers(yasqe) : config.headers;
  const withCredentials = isFunction(config.withCredentials) ? config.withCredentials(yasqe) : config.withCredentials;
  return {
    reqMethod,
    url: endpoint,
    args: getUrlArguments(yasqe, config),
    headers: headers,
    accept: getAcceptHeader(yasqe, config),
    withCredentials,
  };
}

export async function executeQuery(yasqe: IYasqe, config?: YasqeAjaxConfig): Promise<any> {
  const queryStart = Date.now();
  try {
    yasqe.emit("queryBefore", config);
    const populatedConfig = getAjaxConfig(yasqe, config);
    if (!populatedConfig) {
      return; // Nothing to query
    }
    const abortController = new AbortController();

    const fetchOptions: RequestInit = {
      method: populatedConfig.reqMethod,
      headers: {
        Accept: populatedConfig.accept,
        ...(populatedConfig.headers || {}),
      },
      credentials: populatedConfig.withCredentials ? "include" : "same-origin",
      signal: abortController.signal,
    };
    if (fetchOptions?.headers && populatedConfig.reqMethod === "POST") {
      (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const searchParams = new URLSearchParams();
    for (const key in populatedConfig.args) {
      const value = populatedConfig.args[key];
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else {
        searchParams.append(key, value);
      }
    }
    if (populatedConfig.reqMethod === "POST") {
      fetchOptions.body = searchParams.toString();
    } else {
      const url = new URL(populatedConfig.url);
      searchParams.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
      populatedConfig.url = url.toString();
    }
    const request = new Request(populatedConfig.url, fetchOptions);
    yasqe.emit("query", request, abortController);
    const response = await fetch(request);
    if (!response.ok) {
      throw new Error((await response.text()) || response.statusText);
    }
    // Await the response content and merge with the `Response` object
    const queryResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      type: response.type,
      content: await response.text(),
    };
    yasqe.emit("queryResponse", queryResponse, Date.now() - queryStart);
    yasqe.emit("queryResults", queryResponse.content, Date.now() - queryStart);
    return queryResponse;
  } catch (e) {
    if (e instanceof Error && e.message === "Aborted") {
      // The query was aborted. We should not do or draw anything
    } else {
      yasqe.emit("queryResponse", e, Date.now() - queryStart);
    }
    yasqe.emit("error", e);
    throw e;
  }
}

export function getUrlArguments(yasqe: IYasqe, _config?: YasqeAjaxConfig): RequestArgs {
  const queryMode = yasqe.getQueryMode();

  const data: RequestArgs = {};
  const config: RequestConfig<IYasqe> = getRequestConfigSettings(yasqe, _config);
  let queryArg = isFunction(config.queryArgument) ? config.queryArgument(yasqe) : config.queryArgument;
  if (!queryArg) queryArg = yasqe.getQueryMode();
  data[queryArg] = config.adjustQueryBeforeRequest ? config.adjustQueryBeforeRequest(yasqe) : yasqe.getValue();
  /**
   * add named graphs to ajax config
   */
  const namedGraphs = isFunction(config.namedGraphs) ? config.namedGraphs(yasqe) : config.namedGraphs;
  if (namedGraphs && namedGraphs.length > 0) {
    const argName = queryMode === "query" ? "named-graph-uri" : "using-named-graph-uri";
    data[argName] = namedGraphs;
  }
  /**
   * add default graphs to ajax config
   */
  const defaultGraphs = isFunction(config.defaultGraphs) ? config.defaultGraphs(yasqe) : config.defaultGraphs;
  if (defaultGraphs && defaultGraphs.length > 0) {
    const argName = queryMode == "query" ? "default-graph-uri" : "using-graph-uri";
    data[argName] = defaultGraphs;
  }

  /**
   * add additional request args
   */
  const args = isFunction(config.args) ? config.args(yasqe) : config.args;
  if (args && args.length > 0)
    merge(
      data,
      args.reduce((argsObject: { [key: string]: string[] }, arg) => {
        argsObject[arg.name] ? argsObject[arg.name].push(arg.value) : (argsObject[arg.name] = [arg.value]);
        return argsObject;
      }, {}),
    );

  return data;
}

export function getAcceptHeader(yasqe: IYasqe, _config?: YasqeAjaxConfig) {
  const config: RequestConfig<IYasqe> = getRequestConfigSettings(yasqe, _config);
  let acceptHeader = null;
  if (yasqe.getQueryMode() == "update") {
    acceptHeader = isFunction(config.acceptHeaderUpdate) ? config.acceptHeaderUpdate(yasqe) : config.acceptHeaderUpdate;
  } else {
    const qType = yasqe.getQueryType();
    if (qType == "DESCRIBE" || qType == "CONSTRUCT") {
      acceptHeader = isFunction(config.acceptHeaderGraph) ? config.acceptHeaderGraph(yasqe) : config.acceptHeaderGraph;
    } else {
      acceptHeader = isFunction(config.acceptHeaderSelect)
        ? config.acceptHeaderSelect(yasqe)
        : config.acceptHeaderSelect;
    }
  }
  return acceptHeader;
}

export function getAsCurlString(yasqe: IYasqe, _config?: YasqeAjaxConfig): string {
  const ajaxConfig = getAjaxConfig(yasqe, getRequestConfigSettings(yasqe, _config));
  if (!ajaxConfig) return "";
  let url = ajaxConfig.url;
  if (ajaxConfig.url.indexOf("http") !== 0) {
    //this is either a relative or absolute url, which is not supported by CURL.
    //Add domain, schema, etc etc
    url = `${window.location.protocol}//${window.location.host}`;
    if (ajaxConfig.url.indexOf("/") === 0) {
      //its an absolute path
      url += ajaxConfig.url;
    } else {
      //relative, so append current location to url first
      url += window.location.pathname + ajaxConfig.url;
    }
  }
  const segments: string[] = ["curl"];

  if (ajaxConfig.reqMethod === "GET") {
    url += `?${queryString.stringify(ajaxConfig.args)}`;
    segments.push(url);
  } else if (ajaxConfig.reqMethod === "POST") {
    segments.push(url);
    segments.push("--data", queryString.stringify(ajaxConfig.args));
  } else {
    // I don't expect to get here but let's be sure
    console.warn("Unexpected request-method", ajaxConfig.reqMethod);
    segments.push(url);
  }
  segments.push("-X", ajaxConfig.reqMethod);
  for (const header in ajaxConfig.headers) {
    segments.push(`-H  '${header}: ${ajaxConfig.headers[header]}'`);
  }
  return segments.join(" ");
}
