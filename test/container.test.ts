// @ts-nocheck — IDE may ignore experimentalDecorators; tsc/vitest still run this file.
import { describe, expect, it } from "vitest";
import { Container } from "../src/container.js";
import { Inject } from "../src/decorators/inject.js";
import { Injectable } from "../src/decorators/injectable.js";
import { CONFIG } from "../src/tokens.js";

type AppConfig = { port: number };

@Injectable()
class GraphC {
  readonly tag = "C";
}

@Injectable()
class GraphB {
  constructor(public readonly c: GraphC) {}
}

@Injectable()
class GraphA {
  constructor(public readonly b: GraphB) {}
}

@Injectable()
class SingletonX {}

@Injectable({ scope: "transient" })
class TransientY {}

@Injectable()
class App {
  constructor(@Inject(CONFIG) public readonly config: AppConfig) {}
}

@Injectable()
class CycleA {
  constructor(@Inject("B") public readonly b: unknown) {}
}

@Injectable()
class CycleB {
  constructor(@Inject("A") public readonly a: unknown) {}
}

describe("Container", () => {
  it("resolves a recursive graph A -> B -> C", () => {
    const container = new Container();
    const a = container.resolve(GraphA);

    expect(a).toBeInstanceOf(GraphA);
    expect(a.b).toBeInstanceOf(GraphB);
    expect(a.b.c).toBeInstanceOf(GraphC);
    expect(a.b.c.tag).toBe("C");
  });

  it("returns the same instance for singleton scope (default)", () => {
    const container = new Container();
    expect(container.resolve(SingletonX)).toBe(container.resolve(SingletonX));
  });

  it("shares singleton between token alias and constructor resolve", () => {
    const container = new Container();
    container.register("X", SingletonX);

    const viaToken = container.resolve<SingletonX>("X");
    const viaClass = container.resolve(SingletonX);
    expect(viaToken).toBe(viaClass);
  });

  it("returns a new instance for transient scope", () => {
    const container = new Container();
    expect(container.resolve(TransientY)).not.toBe(container.resolve(TransientY));
  });

  it("resolves @Inject(token) by token, not by type", () => {
    const container = new Container();
    container.register(CONFIG, { port: 3000 });

    const app = container.resolve(App);
    expect(app.config).toEqual({ port: 3000 });
    expect(app.config.port).toBe(3000);
  });

  it("throws a readable error for circular dependencies", () => {
    // Direct class↔class types hit TDZ in one file; tokens exercise the same resolve path.
    const container = new Container();
    container.register("A", CycleA);
    container.register("B", CycleB);

    expect(() => container.resolve("A")).toThrowError(/A -> B -> A/);
    try {
      container.resolve("A");
    } catch (error) {
      expect(error).not.toBeInstanceOf(RangeError);
      expect(error).toBeInstanceOf(Error);
    }
  });
});
