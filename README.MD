# mini-nest — Part 3: Request lifecycle

Minimal Nest-style stack: IoC (Part 1) + HTTP routing (Part 2) + full request lifecycle on `node:http`.

## Run

```bash
npm install
npm test
```

Docker (service `api`):

```bash
docker compose run --rm api npm test
```

## Request lifecycle

```
HTTP request
    │
    ▼
┌─────────────┐
│ Middleware  │  ALS: requestId from X-Request-Id or UUID
└──────┬──────┘
       ▼
┌─────────────┐
│   Guard     │  AuthGuard → Authorization header? else 403
└──────┬──────┘
       ▼
┌─────────────┐
│ Interceptor │  before: start timer
│   (before)  │
└──────┬──────┘
       ▼
┌─────────────┐
│    Pipe     │  ZodValidationPipe → ValidationError → 400
└──────┬──────┘
       ▼
┌─────────────┐
│   Handler   │  controller method
└──────┬──────┘
       ▼
┌─────────────┐
│ Interceptor │  after: log `GET /path — 12.3 ms`
│   (after)   │
└──────┬──────┘
       ▼
   JSON response (+ X-Request-Id)

Any thrown error ──► ExceptionFilter
  NotFoundError     → 404 + message
  ValidationError   → 400 + field list
  anything else     → 500 (no stack / internal message leak)
```

## Why AsyncLocalStorage, not a global variable

Node.js serves many requests concurrently on one thread. While request A awaits I/O, the event loop runs request B — a module-level `let requestId` would be overwritten before A’s service layer logs anything. `AsyncLocalStorage.run(store, callback)` binds the store to the async chain for that single request: every `await` downstream still reads the same id via `getRequestId()`, without threading it through every function parameter. That is the same pattern Nest uses for CLS (continuation-local storage) and what OpenTelemetry hooks into later for tracing.

## Part 1 — IoC

TypeScript **стирає типи** у згенерованому JavaScript: у рантаймі немає інформації «конструктор `A` очікує `B`». Якщо увімкнути `experimentalDecorators` і `emitDecoratorMetadata`, компілятор (або SWC з `decoratorMetadata`) для класу з **хоча б одним декоратором** записує типи параметрів конструктора в метадані під ключем `design:paramtypes`.

`@Injectable()` лише викликає `Reflect.defineMetadata` (прапорець injectable + scope). Без декоратора на класі метаданих не буде — навіть при увімкненому `emitDecoratorMetadata`.

Контейнер у `resolve` читає `Reflect.getMetadata('design:paramtypes', Target)`, рекурсивно резолвить кожну залежність і робить `new Target(...deps)`. Інтерфейси в метаданих стають `Object`, тому для них потрібен параметр-декоратор `@Inject(token)` і реєстрація значення/класу під цим токеном. Singleton кешується за конструктором; `transient` створює новий екземпляр щоразу. Цикл відстежується масивом шляху резолву й падає з повідомленням на кшталт `A -> B -> A`.

## Part 2 — HTTP

`@Controller('users')` пише префікс у метадані класу. `@Get` / `@Post` додають записи маршрутів на конструктор. `collectRoutes` читає їх через `Reflect.getMetadata` і склеює повний шлях (`/users` + `:id` → `/users/:id`). `Dispatcher` на `node:http` знаходить маршрут, резолвить контролер із контейнера, збирає аргументи й відповідає JSON.

### Як параметр-декоратор знає, куди підставити значення

`@Body()`, `@Param('id')`, `@Query('limit')` **самі нічого не читають** з `req`. Вони лише записують у метадані методу мапу `{ [parameterIndex]: { type, name } }` під ключем `ROUTE_PARAMS`. Під час обробки запиту диспетчер читає цю мапу, будує масив аргументів у правильному порядку індексів (param → `params[name]`, query → `searchParams`, body → JSON + `ZodValidationPipe`) і викликає `controller[handler](...args)`.

## Part 3 — Lifecycle

| Component | File | Role |
|-----------|------|------|
| Guard | `src/guards/auth.guard.ts` | `Authorization` header → allow / 403 |
| Interceptor | `src/interceptors/logging.interceptor.ts` | wraps handler, logs duration |
| Pipe | `src/pipes/zod-validation.pipe.ts` | Zod 4 validation (`error.issues`) |
| Filter | `src/filters/exception.filter.ts` | maps domain/unknown errors to HTTP |
| Context | `src/context/request-context.ts` | `AsyncLocalStorage` + `getRequestId()` |
