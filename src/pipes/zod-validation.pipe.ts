import type { ZodType } from 'zod';
import { ZodError } from 'zod';

export type FieldError = {
  field: string;
  constraints: string[];
};

export class ValidationError extends Error {
  constructor(public readonly fields: FieldError[]) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

export class ZodValidationPipe {
  transform<T>(value: unknown, schema: ZodType<T>): T {
    try {
      return schema.parse(value ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError(
          error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            constraints: [issue.message],
          })),
        );
      }
      throw error;
    }
  }
}
