import "reflect-metadata";
import { PARAM_TOKENS } from "../tokens.js";

export type InjectToken = string | symbol;

export function Inject(token: InjectToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existing: Array<InjectToken | undefined> =
      Reflect.getOwnMetadata(PARAM_TOKENS, target) ?? [];
    existing[parameterIndex] = token;
    Reflect.defineMetadata(PARAM_TOKENS, existing, target);
  };
}

export default Inject;
