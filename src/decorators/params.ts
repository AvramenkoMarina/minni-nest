import "reflect-metadata";
import { ROUTE_PARAMS } from "../tokens.js";

export type ParamSource = "body" | "param" | "query";

export type RouteParamMeta = {
  type: ParamSource;
  name?: string;
};

export type RouteParamsMap = Record<number, RouteParamMeta>;

function createParamDecorator(type: ParamSource, name?: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const key = propertyKey as string | symbol;
    const existing: RouteParamsMap = Reflect.getOwnMetadata(ROUTE_PARAMS, target, key) ?? {};
    existing[parameterIndex] = { type, name };
    Reflect.defineMetadata(ROUTE_PARAMS, existing, target, key);
  };
}

export function Body(): ParameterDecorator {
  return createParamDecorator("body");
}

export function Param(name: string): ParameterDecorator {
  return createParamDecorator("param", name);
}

export function Query(name: string): ParameterDecorator {
  return createParamDecorator("query", name);
}
