import { getRequestId } from "../context/request-context.js";
import { Injectable } from "../decorators/injectable.js";

@Injectable()
export class AuditService {
  currentRequestId(): string {
    return getRequestId();
  }
}
