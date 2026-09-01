import type { IncomingMessage, ServerResponse } from "node:http";
import { NotFoundError } from "../errors/domain.errors.js";
import { ValidationError } from "../pipes/zod-validation.pipe.js";

export type ExceptionFilterHost = {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
};

export class ExceptionFilter {
  catch(exception: unknown, host: ExceptionFilterHost): void {
    if (exception instanceof NotFoundError) {
      sendJson(host.res, 404, { message: exception.message }, host.requestId);
      return;
    }

    if (exception instanceof ValidationError) {
      sendJson(host.res, 400, exception.fields, host.requestId);
      return;
    }

    sendJson(
      host.res,
      500,
      { message: "Internal Server Error" },
      host.requestId,
    );
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Request-Id": requestId,
  });
  res.end(body);
}
