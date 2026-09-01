import "reflect-metadata";
import { IS_INJECTABLE, SCOPE } from "../tokens.js";

export type Scope = "singleton" | "transient";

export function Injectable(options?: { scope?: Scope }): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(IS_INJECTABLE, true, target);
    Reflect.defineMetadata(SCOPE, options?.scope ?? "singleton", target);
  };
}

export default Injectable;
