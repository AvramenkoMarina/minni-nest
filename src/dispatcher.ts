import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Container, Constructor } from "./container.js";
import type { RouteParamsMap } from "./decorators/params.js";
import { ValidationException, ValidationPipe } from "./pipes/validation.pipe.js";
import { collectRoutes, matchRoute, type CompiledRoute } from "./router.js";
import { ROUTE_PARAMS } from "./tokens.js";

export class Dispatcher {
  private readonly routes: CompiledRoute[];
  private readonly pipe = new ValidationPipe();

  constructor(
    private readonly container: Container,
    controllers: Constructor[],
  ) {
    this.routes = collectRoutes(controllers);
  }

  createServer(): http.Server {
    return http.createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", "http://localhost");
      const matched = matchRoute(this.routes, method, url.pathname);

      if (!matched) {
        sendJson(res, 404, { message: "Not Found" });
        return;
      }

      const { route, params } = matched;
      const query = Object.fromEntries(url.searchParams.entries());
      const body = method === "POST" || method === "PUT" || method === "PATCH"
        ? await readJsonBody(req)
        : undefined;

      const controller = this.container.resolve(route.controller);
      const args = await this.buildArgs(route, params, query, body);
      const result = await (controller as Record<string, Function>)[route.handlerName]!(
        ...args,
      );

      const status = method === "POST" ? 201 : 200;
      sendJson(res, status, result ?? null);
    } catch (error) {
      if (error instanceof ValidationException) {
        sendJson(res, 400, error.errors);
        return;
      }
      const message = error instanceof Error ? error.message : "Internal Server Error";
      sendJson(res, 500, { message });
    }
  }

  private async buildArgs(
    route: CompiledRoute,
    params: Record<string, string>,
    query: Record<string, string>,
    body: unknown,
  ): Promise<unknown[]> {
    const proto = route.controller.prototype as object;
    const paramMap: RouteParamsMap =
      Reflect.getOwnMetadata(ROUTE_PARAMS, proto, route.handlerName) ?? {};
    const paramTypes: Array<Constructor | undefined> =
      Reflect.getMetadata("design:paramtypes", proto, route.handlerName) ?? [];

    const indexes = Object.keys(paramMap).map(Number);
    const maxIndex = indexes.length > 0 ? Math.max(...indexes) : -1;
    const args: unknown[] = [];

    for (let index = 0; index <= maxIndex; index++) {
      const meta = paramMap[index];
      if (!meta) {
        args[index] = undefined;
        continue;
      }

      if (meta.type === "param") {
        args[index] = meta.name ? params[meta.name] : undefined;
        continue;
      }

      if (meta.type === "query") {
        args[index] = meta.name ? query[meta.name] : undefined;
        continue;
      }

      if (meta.type === "body") {
        const dtoType = paramTypes[index];
        if (dtoType && dtoType !== Object && typeof dtoType === "function") {
          args[index] = await this.pipe.transform(body, dtoType as Constructor<object>);
        } else {
          args[index] = body;
        }
      }
    }

    return args;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
