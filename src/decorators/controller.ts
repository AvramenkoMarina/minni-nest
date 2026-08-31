import "reflect-metadata";
import { CONTROLLER_PREFIX } from "../tokens.js";

export function Controller(prefix = ""): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_PREFIX, normalizePrefix(prefix), target);
  };
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

export default Controller;
