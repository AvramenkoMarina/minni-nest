// @ts-nocheck
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Container } from "../src/container.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get } from "../src/decorators/methods.js";
import { Dispatcher } from "../src/dispatcher.js";

@Controller("ping")
@Injectable()
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe("request lifecycle order", () => {
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

  it("runs middleware → guard → interceptor:before → pipe → handler → interceptor:after", async () => {
    const order: string[] = [];
    const container = new Container();
    const dispatcher = new Dispatcher(container, [PingController], {
      onStage: (stage) => order.push(stage),
    });
    const server = dispatcher.createServer();
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Authorization: "Bearer test" },
    });

    expect(res.status).toBe(200);
    expect(order).toEqual([
      "middleware",
      "guard",
      "interceptor:before",
      "pipe",
      "handler",
      "interceptor:after",
    ]);
  });
});
