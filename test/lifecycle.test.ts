// @ts-nocheck
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Constructor } from "../src/container.js";
import { Container } from "../src/container.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get } from "../src/decorators/methods.js";
import { Param } from "../src/decorators/params.js";
import { Dispatcher } from "../src/dispatcher.js";
import { NotFoundError } from "../src/errors/domain.errors.js";
import { AuthGuard } from "../src/guards/auth.guard.js";
import { LoggingInterceptor } from "../src/interceptors/logging.interceptor.js";
import { UsersService } from "../src/services/users.service.js";

describe("lifecycle components", () => {
  const servers: Array<ReturnType<Dispatcher["createServer"]>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  async function startServer(
    controllers: Constructor[],
    options: ConstructorParameters<typeof Dispatcher>[2] = {},
  ) {
    const container = new Container();
    const dispatcher = new Dispatcher(container, controllers, options);
    const server = dispatcher.createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}` };
  }

  it("AuthGuard returns 403 and skips the handler without Authorization", async () => {
    let handlerCalls = 0;

    @Controller("secure")
    @Injectable()
    class SecureController {
      @Get()
      index() {
        handlerCalls++;
        return { ok: true };
      }
    }

    const { baseUrl } = await startServer([SecureController], {
      guards: [new AuthGuard()],
      interceptors: [],
    });

    const res = await fetch(`${baseUrl}/secure`);
    expect(res.status).toBe(403);
    expect(handlerCalls).toBe(0);
  });

  it("LoggingInterceptor logs METHOD /path with duration in ms", async () => {
    const logs: string[] = [];

    @Controller("metrics")
    @Injectable()
    class MetricsController {
      @Get()
      index() {
        return { ok: true };
      }
    }

    const { baseUrl } = await startServer([MetricsController], {
      guards: [],
      interceptors: [new LoggingInterceptor((line) => logs.push(line))],
    });

    await fetch(`${baseUrl}/metrics`);
    expect(logs.some((line) => /GET \/metrics — [0-9]+(\.[0-9]+)? ms/.test(line))).toBe(
      true,
    );
  });

  it("maps NotFoundError to 404 with a meaningful message", async () => {
    @Controller("items")
    @Injectable()
    class ItemsController {
      @Get(":id")
      findOne() {
        throw new NotFoundError("Item missing");
      }
    }

    const { baseUrl } = await startServer([ItemsController], { guards: [] });
    const res = await fetch(`${baseUrl}/items/1`);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.message).toBe("Item missing");
  });

  it("maps unexpected errors to 500 without leaking message or stack trace", async () => {
    @Controller("boom")
    @Injectable()
    class BoomController {
      @Get()
      index() {
        throw new Error("boom");
      }
    }

    const { baseUrl } = await startServer([BoomController], { guards: [], interceptors: [] });
    const res = await fetch(`${baseUrl}/boom`);
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toMatch(/boom|at .*\.ts:/);
  });

  it("returns X-Request-Id and echoes a client-provided value", async () => {
    @Controller("trace")
    @Injectable()
    class TraceController {
      @Get()
      index() {
        return { ok: true };
      }
    }

    const { baseUrl } = await startServer([TraceController], {
      guards: [],
      interceptors: [],
    });

    const generated = await fetch(`${baseUrl}/trace`);
    expect(generated.headers.get("x-request-id")).toBeTruthy();

    const customId = "client-request-id-42";
    const echoed = await fetch(`${baseUrl}/trace`, {
      headers: { "X-Request-Id": customId },
    });
    expect(echoed.headers.get("x-request-id")).toBe(customId);
  });

  it("AsyncLocalStorage keeps requestId for nested service calls without passing it", async () => {
    @Controller("users")
    @Injectable()
    class UsersController {
      constructor(public readonly users: UsersService) {}

      @Get(":id")
      findOne(@Param("id") id: string) {
        return this.users.findOne(id);
      }
    }

    const { baseUrl } = await startServer([UsersController], {
      guards: [],
      interceptors: [],
    });

    const requestId = "nested-service-id";
    const res = await fetch(`${baseUrl}/users/7`, {
      headers: { "X-Request-Id": requestId },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.requestId).toBe(requestId);
  });

  it("parallel requests do not mix AsyncLocalStorage contexts", async () => {
    @Controller("slow")
    @Injectable()
    class SlowController {
      constructor(public readonly users: UsersService) {}

      @Get(":id")
      async findOne(@Param("id") id: string) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
        return this.users.findOne(id);
      }
    }

    const { baseUrl } = await startServer([SlowController], {
      guards: [],
      interceptors: [],
    });

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) => {
        const requestId = `parallel-${index}`;
        return fetch(`${baseUrl}/slow/${index}`, {
          headers: { "X-Request-Id": requestId },
        }).then(async (res) => ({
          requestId,
          body: await res.json(),
          header: res.headers.get("x-request-id"),
        }));
      }),
    );

    for (const { requestId, body, header } of responses) {
      expect(header).toBe(requestId);
      expect(body.requestId).toBe(requestId);
    }
  });

  it("UsersService throws NotFoundError mapped to 404", async () => {
    @Controller("users")
    @Injectable()
    class UsersController {
      constructor(public readonly users: UsersService) {}

      @Get(":id")
      findOne(@Param("id") id: string) {
        return this.users.findOne(id);
      }
    }

    const { baseUrl } = await startServer([UsersController], {
      guards: [],
      interceptors: [],
    });

    const res = await fetch(`${baseUrl}/users/404`);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.message).toMatch(/404/);
  });
});
