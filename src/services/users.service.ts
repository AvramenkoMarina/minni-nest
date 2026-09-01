import type { CreateUserDto } from "../dto/create-user.dto.js";
import { Injectable } from "../decorators/injectable.js";
import { NotFoundError } from "../errors/domain.errors.js";
import { AuditService } from "./audit.service.js";

@Injectable()
export class UsersService {
  lastCreated: CreateUserDto | null = null;

  constructor(private readonly audit: AuditService) {}

  findOne(id: string) {
    const requestId = this.audit.currentRequestId();
    if (id === "404") {
      throw new NotFoundError(`User ${id} not found`);
    }
    return { id, requestId };
  }

  create(dto: CreateUserDto) {
    this.lastCreated = dto;
    const requestId = this.audit.currentRequestId();
    return { id: 1, email: dto.email, name: dto.name, requestId };
  }
}
