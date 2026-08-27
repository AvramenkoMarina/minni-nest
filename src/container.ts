import "reflect-metadata";
import type { Scope } from "./decorators/injectable.js";
import { PARAM_TOKENS, SCOPE } from "./tokens.js";

export type Constructor<T = unknown> = new (...args: any[]) => T;
export type InjectionToken = string | symbol | Constructor;

export class Container {
  private readonly singletons = new Map<InjectionToken, unknown>();
  private readonly providers = new Map<InjectionToken, unknown>();

  /** Register a class or a concrete value under a token. */
  register(token: InjectionToken, provider: unknown): this {
    this.providers.set(token, provider);
    return this;
  }

  resolve<T>(type: Constructor<T>): T;
  resolve<T>(token: string | symbol): T;
  resolve<T>(token: InjectionToken): T {
    return this.resolveInternal(token, []) as T;
  }

  private resolveInternal(token: InjectionToken, resolving: InjectionToken[]): unknown {
    if (resolving.includes(token)) {
      const chain = [...resolving, token].map(formatToken).join(" -> ");
      throw new Error(`Circular dependency detected: ${chain}`);
    }

    if (this.singletons.has(token)) {
      return this.singletons.get(token);
    }

    if (this.providers.has(token)) {
      const provider = this.providers.get(token);
      if (isConstructor(provider)) {
        return this.instantiate(provider, resolving, token);
      }
      return provider;
    }

    if (isConstructor(token)) {
      return this.instantiate(token, resolving, token);
    }

    throw new Error(`No provider registered for token: ${formatToken(token)}`);
  }

  private instantiate(
    Target: Constructor,
    resolving: InjectionToken[],
    cacheKey: InjectionToken,
  ): unknown {
    const nextPath = [...resolving, cacheKey];
    const paramTypes: Array<Constructor | undefined> =
      Reflect.getMetadata("design:paramtypes", Target) ?? [];
    const injected: Array<InjectionToken | undefined> =
      Reflect.getOwnMetadata(PARAM_TOKENS, Target) ?? [];

    const deps = paramTypes.map((type, index) => {
      const override = injected[index];
      if (override !== undefined) {
        return this.resolveInternal(override, nextPath);
      }
      if (type === undefined || type === Object) {
        throw new Error(
          `Cannot resolve parameter ${index} of ${Target.name}. Use @Inject(token) for interfaces/tokens.`,
        );
      }
      return this.resolveInternal(type, nextPath);
    });

    const instance = new Target(...deps);
    const scope = (Reflect.getMetadata(SCOPE, Target) as Scope | undefined) ?? "singleton";

    if (scope === "singleton") {
      this.singletons.set(cacheKey, instance);
    }

    return instance;
  }
}

function isConstructor(value: unknown): value is Constructor {
  return typeof value === "function";
}

function formatToken(token: InjectionToken): string {
  if (typeof token === "function") {
    return token.name || "Anonymous";
  }
  return String(token);
}
