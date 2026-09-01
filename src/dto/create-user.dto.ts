import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(2),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

export class CreateUserBody {
  static readonly schema = createUserSchema;
}
