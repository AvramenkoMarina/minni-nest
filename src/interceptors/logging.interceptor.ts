import type { IncomingMessage } from "node:http";

export type InterceptorContext = {
  req: IncomingMessage;
  method: string;
  path: string;
};

export interface Interceptor {
  intercept(
    context: InterceptorContext,
    next: () => Promise<unknown>,
  ): Promise<unknown>;
}

export class LoggingInterceptor implements Interceptor {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async intercept(
    context: InterceptorContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const started = performance.now();
    try {
      return await next();
    } finally {
      const elapsed = performance.now() - started;
      this.log(`${context.method} ${context.path} — ${formatMs(elapsed)} ms`);
    }
  }
}

function formatMs(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
