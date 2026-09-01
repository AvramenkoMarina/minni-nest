import "reflect-metadata";
import type { Constructor } from "./container.js";
import type { HttpMethod, RouteMeta } from "./decorators/methods.js";
import { CONTROLLER_PREFIX, ROUTES } from "./tokens.js";

export type CompiledRoute = {
  method: HttpMethod;
  path: string;
  regex: RegExp;
  paramNames: string[];
  controller: Constructor;
  handlerName: string;
};

export function collectRoutes(controllers: Constructor[]): CompiledRoute[] {
  const compiled: CompiledRoute[] = [];

  for (const controller of controllers) {
    const prefix =
      (Reflect.getMetadata(CONTROLLER_PREFIX, controller) as
        | string
        | undefined) ?? "";
    const routes =
      (Reflect.getMetadata(ROUTES, controller) as RouteMeta[] | undefined) ??
      [];

    for (const route of routes) {
      const fullPath = joinPaths(prefix, route.path);
      const { regex, paramNames } = pathToRegex(fullPath);
      compiled.push({
        method: route.method,
        path: fullPath,
        regex,
        paramNames,
        controller,
        handlerName: route.handlerName,
      });
    }
  }

  compiled.sort((a, b) => scorePath(b.path) - scorePath(a.path));
  return compiled;
}

export function matchRoute(
  routes: CompiledRoute[],
  method: string,
  pathname: string,
): { route: CompiledRoute; params: Record<string, string> } | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  for (const route of routes) {
    if (route.method !== method.toUpperCase()) {
      continue;
    }
    const match = route.regex.exec(normalized);
    if (!match) {
      continue;
    }
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = match[index + 1]!;
    });
    return { route, params };
  }

  return undefined;
}

function joinPaths(prefix: string, path: string): string {
  const joined = `/${prefix}/${path}`.replace(/\/+/g, "/");
  if (joined.length > 1 && joined.endsWith("/")) {
    return joined.slice(0, -1);
  }
  return joined || "/";
}

function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return { regex: new RegExp(`^${pattern}$`), paramNames };
}

function scorePath(path: string): number {
  return path.split("/").filter((s) => s && !s.startsWith(":")).length;
}
