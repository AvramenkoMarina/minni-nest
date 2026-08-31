// @ts-nocheck — IDE may ignore experimentalDecorators; tsc/vitest still run this file.
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Container } from "../src/container.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get, Post } from "../src/decorators/methods.js";
import { Body, Param, Query } from "../src/decorators/params.js";
import { Dispatcher } from "../src/dispatcher.js";
import { CreateUserDto } from "../src/dto/create-user.dto.js";

@Injectable()
class UsersService {
  lastCreated: CreateUserDto | null = null;

  create(dto: CreateUserDto) {
    this.lastCreated = dto;
    return { id: 1, email: dto.email, name: dto.name };
  }
}

@Controller("users")
@Injectable()
class UsersController {
  constructor(public readonly users: UsersService) {}

  @Get()
  list(@Query("limit") limit: string) {
    return { limit };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { id };
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }
}

describe("HTTP dispatcher", () => {
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

  async function startApp() {
    const container = new Container();
    const dispatcher = new Dispatcher(container, [UsersController]);
    const server = dispatcher.createServer();
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    return { container, baseUrl };
  }

  it("joins controller prefix with @Get(':id') → GET /users/42", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/users/42`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "42" });
  });

  it("injects @Param into the handler argument", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/users/42`);
    const text = await res.text();

    expect(text).toMatch(/42/);
  });

  it("injects @Query into a separate handler argument", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/users?limit=5`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ limit: "5" });
  });

  it("rejects invalid DTO with 400 and field details", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const text = await res.text();
    const json = JSON.parse(text);

    expect(res.status).toBe(400);
    expect(text).toMatch(/email/);
    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: expect.stringMatching(/email|name/),
          constraints: expect.any(Array),
        }),
      ]),
    );
  });

  it("accepts valid DTO as CreateUserDto instance", async () => {
    const { container, baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", name: "Ada" }),
    });
    const json = await res.json();
    const service = container.resolve(UsersService);

    expect(res.status).toBe(201);
    expect(json).toEqual({ id: 1, email: "ada@example.com", name: "Ada" });
    expect(service.lastCreated).toBeInstanceOf(CreateUserDto);
  });

  it("resolves controller dependencies via the IoC container singleton", async () => {
    const { container, baseUrl } = await startApp();
    const serviceBefore = container.resolve(UsersService);

    await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "grace@example.com", name: "Grace" }),
    });

    const serviceAfter = container.resolve(UsersService);
    expect(serviceAfter).toBe(serviceBefore);
    expect(serviceAfter.lastCreated).toBeInstanceOf(CreateUserDto);
    expect(serviceAfter.lastCreated?.email).toBe("grace@example.com");
  });
});
