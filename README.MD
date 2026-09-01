# mini-nest — Part 1: IoC container

Minimal dependency-injection container in the spirit of NestJS: decorators + `reflect-metadata` + recursive resolve.

## Run

```bash
npm install
npm test
```

Docker (service `api`, same idea as HW #5):

```bash
docker compose run --rm api npm test
```

## Як це працює

TypeScript **стирає типи** у згенерованому JavaScript: у рантаймі немає інформації «конструктор `A` очікує `B`». Якщо увімкнути `experimentalDecorators` і `emitDecoratorMetadata`, компілятор (або SWC з `decoratorMetadata`) для класу з **хоча б одним декоратором** записує типи параметрів конструктора в метадані під ключем `design:paramtypes`.

`@Injectable()` лише викликає `Reflect.defineMetadata` (прапорець injectable + scope). Без декоратора на класі метаданих не буде — навіть при увімкненому `emitDecoratorMetadata`.

Контейнер у `resolve` читає `Reflect.getMetadata('design:paramtypes', Target)`, рекурсивно резолвить кожну залежність і робить `new Target(...deps)`. Інтерфейси в метаданих стають `Object`, тому для них потрібен параметр-декоратор `@Inject(token)` і реєстрація значення/класу під цим токеном. Singleton кешується в `Map`; `transient` створює новий екземпляр щоразу. Цикл відстежується масивом шляху резолву й падає з повідомленням на кшталт `A -> B -> A`.
