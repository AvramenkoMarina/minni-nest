import "reflect-metadata";
import { ROUTES } from "../tokens.js";

export type HttpMethod = "GET" | "POST";

export type RouteMeta = {
  method: HttpMethod;
  path: string;
  handlerName: string;
};

function createMethodDecorator(httpMethod: HttpMethod) {
  return (path = ""): MethodDecorator => {
    return (target, propertyKey) => {
      const ctor = target.constructor;
      const routes: RouteMeta[] = Reflect.getOwnMetadata(ROUTES, ctor) ?? [];
      routes.push({
        method: httpMethod,
        path: String(path).replace(/^\/+/, ""),
        handlerName: String(propertyKey),
      });
      Reflect.defineMetadata(ROUTES, routes, ctor);
    };
  };
}

export const Get = createMethodDecorator("GET");
export const Post = createMethodDecorator("POST");
