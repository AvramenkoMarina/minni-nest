import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { Constructor } from "../container.js";

export type FieldError = {
  field: string;
  constraints: string[];
};

export class ValidationException extends Error {
  constructor(public readonly errors: FieldError[]) {
    super("Validation failed");
    this.name = "ValidationException";
  }
}

export class ValidationPipe {
  async transform<T extends object>(value: unknown, metatype: Constructor<T>): Promise<T> {
    const instance = plainToInstance(metatype, value ?? {});
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      throw new ValidationException(
        errors.map((error) => ({
          field: error.property,
          constraints: Object.values(error.constraints ?? {}),
        })),
      );
    }

    return instance;
  }
}
