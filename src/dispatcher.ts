import { randomUUID } from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ZodType } from 'zod';
import type { Container, Constructor } from "./container.js";
import { runWithRequestContext } from "./context/request-context.js";
import type { RouteParamsMap } from "./decorators/params.js";
import { NotFoundError } from "./errors/domain.errors.js";
import { ExceptionFilter } from "./filters/exception.filter.js";
import type { Guard } from "./guards/auth.guard.js";
import { AuthGuard } from "./guards/auth.guard.js";
import type { Interceptor } from "./interceptors/logging.interceptor.js";
import { LoggingInterceptor } from "./interceptors/logging.interceptor.js";
import { ZodValidationPipe } from "./pipes/zod-validation.pipe.js";
import { collectRoutes, matchRoute, type CompiledRoute } from "./router.js";
import { ROUTE_PARAMS } from "./tokens.js";

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void>,
) => void | Promise<void>;

export type DispatcherOptions = {
  guards?: Guard[];
  interceptors?: Interceptor[];
  middlewares?: Middleware[];
  pipe?: ZodValidationPipe;
  exceptionFilter?: ExceptionFilter;
  onStage?: (stage: string) => void;
};

export class Dispatcher {
  private readonly routes: CompiledRoute[];
  private readonly guards: Guard[];
  private readonly interceptors: Interceptor[];
  private readonly middlewares: Middleware[];
  private readonly pipe: ZodValidationPipe;
  private readonly exceptionFilter: ExceptionFilter;
  private readonly onStage?: (stage: string) => void;

  constructor(
    private readonly container: Container,
    controllers: Constructor[],
    options: DispatcherOptions = {},
  ) {
    this.routes = collectRoutes(controllers);
    this.guards = options.guards ?? [new AuthGuard()];
    this.interceptors = options.interceptors ?? [new LoggingInterceptor()];
    this.middlewares = options.middlewares ?? [];
    this.pipe = options.pipe ?? new ZodValidationPipe();
    this.exceptionFilter = options.exceptionFilter ?? new ExceptionFilter();
    this.onStage = options.onStage;
  }

  createServer(): http.Server {
    return http.createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = readRequestId(req);

    try {
      await runWithRequestContext({ requestId }, async () => {
        await this.runMiddlewares(req, res, async () => {
          await this.dispatch(req, res, requestId);
        });
      });
    } catch (error) {
      this.exceptionFilter.catch(error, { req, res, requestId });
    }
  }

  private async runMiddlewares(
    req: IncomingMessage,
    res: ServerResponse,
    finalHandler: () => Promise<void>,
  ): Promise<void> {
    if (this.middlewares.length === 0) {
      this.onStage?.("middleware");
      await finalHandler();
      return;
    }

    let index = 0;
    const dispatch = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        await finalHandler();
        return;
      }

      const middleware = this.middlewares[index++]!;
      if (index === 1) {
        this.onStage?.("middleware");
      }
      await middleware(req, res, dispatch);
    };

    await dispatch();
  }

  private async dispatch(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const matched = matchRoute(this.routes, method, url.pathname);

    if (!matched) {
      throw new NotFoundError("Route not found");
    }

    const { route, params } = matched;
    const query = Object.fromEntries(url.searchParams.entries());
    const body =
      method === "POST" || method === "PUT" || method === "PATCH"
        ? await readJsonBody(req)
        : undefined;

    this.onStage?.("guard");
    for (const guard of this.guards) {
      const allowed = await guard.canActivate(req);
      if (!allowed) {
        sendJson(res, 403, { message: "Forbidden" }, requestId);
        return;
      }
    }

    const controller = this.container.resolve(route.controller);
    const handler = (controller as Record<string, Function>)[route.handlerName]!;

    const context = {
      req,
      method,
      path: url.pathname,
    };

    const executeHandler = async (): Promise<unknown> => {
      this.onStage?.("pipe");
      const args = await this.buildArgs(route, params, query, body);
      this.onStage?.("handler");
      return handler.apply(controller, args);
    };

    this.onStage?.("interceptor:before");
    let result: unknown;
    try {
      result = await this.runInterceptors(context, executeHandler);
    } finally {
      this.onStage?.("interceptor:after");
    }

    const status = method === "POST" ? 201 : 200;
    sendJson(res, status, result ?? null, requestId);
  }

  private async runInterceptors(
    context: { req: IncomingMessage; method: string; path: string },
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    if (this.interceptors.length === 0) {
      return handler();
    }

    const invoke = async (index: number): Promise<unknown> => {
      if (index >= this.interceptors.length) {
        return handler();
      }

      const interceptor = this.interceptors[index]!;
      return interceptor.intercept(context, () => invoke(index + 1));
    };

    return invoke(0);
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
        const schema = getSchema(dtoType);
        if (schema) {
          args[index] = this.pipe.transform(body, schema);
        } else {
          args[index] = body;
        }
      }
    }

    return args;
  }
}

function getSchema(metatype: Constructor | undefined): ZodType | undefined {
  if (!metatype || typeof metatype !== "function") {
    return undefined;
  }

  const schema = (metatype as { schema?: ZodType }).schema;
  return schema;
}

function readRequestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && header[0]) {
    return header[0];
  }
  return randomUUID();
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

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Request-Id": requestId,
  });
  res.end(body);
}
