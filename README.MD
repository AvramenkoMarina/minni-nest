# mini-nest — Part 2: HTTP routing + validation

Minimal Nest-style stack: IoC container (Part 1) + decorator routing + DTO pipes on top of `node:http`.

## Run

```bash
npm install
npm test
```

Docker (service `api`):

```bash
docker compose run --rm api npm test
```

## Part 1 — IoC

TypeScript **стирає типи** у згенерованому JavaScript: у рантаймі немає інформації «конструктор `A` очікує `B`». Якщо увімкнути `experimentalDecorators` і `emitDecoratorMetadata`, компілятор (або SWC з `decoratorMetadata`) для класу з **хоча б одним декоратором** записує типи параметрів конструктора в метадані під ключем `design:paramtypes`.

`@Injectable()` лише викликає `Reflect.defineMetadata` (прапорець injectable + scope). Без декоратора на класі метаданих не буде — навіть при увімкненому `emitDecoratorMetadata`.

Контейнер у `resolve` читає `Reflect.getMetadata('design:paramtypes', Target)`, рекурсивно резолвить кожну залежність і робить `new Target(...deps)`. Інтерфейси в метаданих стають `Object`, тому для них потрібен параметр-декоратор `@Inject(token)` і реєстрація значення/класу під цим токеном. Singleton кешується за конструктором; `transient` створює новий екземпляр щоразу. Цикл відстежується масивом шляху резолву й падає з повідомленням на кшталт `A -> B -> A`.

## Part 2 — HTTP

`@Controller('users')` пише префікс у метадані класу. `@Get` / `@Post` додають записи маршрутів на конструктор. `collectRoutes` читає їх через `Reflect.getMetadata` і склеює повний шлях (`/users` + `:id` → `/users/:id`). `Dispatcher` на `node:http` знаходить маршрут, резолвить контролер із контейнера, збирає аргументи й відповідає JSON.

### Як параметр-декоратор знає, куди підставити значення

`@Body()`, `@Param('id')`, `@Query('limit')` **самі нічого не читають** з `req`. Вони лише записують у метадані методу мапу `{ [parameterIndex]: { type, name } }` під ключем `ROUTE_PARAMS`. Під час обробки запиту диспетчер читає цю мапу, будує масив аргументів у правильному порядку індексів (param → `params[name]`, query → `searchParams`, body → JSON + `ValidationPipe`) і викликає `controller[handler](...args)`. Тому в методі контролера немає ручного доступу до `req` — значення вже підставлені за метаданими.
