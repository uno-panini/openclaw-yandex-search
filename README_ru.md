# OpenClaw Yandex Search

[English version](./README.md)

Компактный Yandex Search provider для OpenClaw.

Плагин регистрирует `yandex` как стандартный `web_search` provider. Он ходит в синхронный Yandex Search API, парсит XML и возвращает только то, что реально полезно агенту:

- `title`
- `url`
- `description`
- `siteName`

Без сырого XML. Без HTML-мусора. Без раздутых payload.

## Что нужно

- OpenClaw с поддержкой native plugins
- доступ к Yandex Search API
- Yandex `folderId`
- либо API key, либо IAM token

## Установка

Из локальной папки:

```bash
openclaw plugins install ./openclaw-yandex-search
```

Из локального архива:

```bash
openclaw plugins install ./openclaw-yandex-search-0.1.0.tgz
```

После установки или изменения конфига перезапусти gateway:

```bash
openclaw gateway restart
```

## Быстрый старт

Добавь в `openclaw.json`:

```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "provider": "yandex"
      }
    }
  },
  "plugins": {
    "entries": {
      "yandex": {
        "enabled": true,
        "config": {
          "webSearch": {
            "apiKey": "AQVN...",
            "folderId": "b1gxxxxxxxxxxxxx",
            "searchType": "SEARCH_TYPE_COM"
          }
        }
      }
    }
  }
}
```

Готовые примеры:

- [`examples/openclaw.config.example.json`](./examples/openclaw.config.example.json)
- [`examples/openclaw.config.iam.example.json`](./examples/openclaw.config.iam.example.json)

## IAM-авторизация

Если нужен IAM token:

```json
{
  "plugins": {
    "entries": {
      "yandex": {
        "enabled": true,
        "config": {
          "webSearch": {
            "iamToken": "y0_AgAA...",
            "authMode": "iam",
            "folderId": "b1gxxxxxxxxxxxxx",
            "searchType": "SEARCH_TYPE_COM"
          }
        }
      }
    }
  }
}
```

## Переменные окружения

Плагин умеет читать креды и folder id из env:

- `YANDEX_SEARCH_API_KEY`
- `YC_API_KEY`
- `YANDEX_IAM_TOKEN`
- `YC_IAM_TOKEN`
- `YANDEX_FOLDER_ID`
- `YC_FOLDER_ID`

## Где живёт конфиг

```json
plugins.entries.yandex.config.webSearch
```

Основные поля:

- `apiKey` — API key для Yandex Search API
- `iamToken` — IAM token вместо API key
- `folderId` — обязательный Yandex folder id
- `authMode` — `auto`, `api-key`, `iam`
- `searchType` — `SEARCH_TYPE_COM`, `SEARCH_TYPE_RU`, `SEARCH_TYPE_TR`, `SEARCH_TYPE_KK`
- `region` — необязательный id региона для смещения ранжирования
- `l10n` — необязательная локализация
- `familyMode` — `FAMILY_MODE_NONE`, `FAMILY_MODE_MODERATE`, `FAMILY_MODE_STRICT`
- `fixTypoMode` — `FIX_TYPO_MODE_ON`, `FIX_TYPO_MODE_OFF`
- `maxPassages` — сколько passages запросить до сжатия сниппета
- `userAgent` — необязательный override user-agent
- `baseUrl` — необязательный override endpoint

## Поддерживаемые аргументы запроса

- `query` — обязательный поисковый запрос
- `count` — количество результатов в пределах лимитов OpenClaw
- `region` — необязательный id региона Yandex
- `search_type` — override корпуса для текущего запроса
- `safe_search` — маппится в family mode Yandex
- `fix_typo` — включает или выключает исправление опечаток

## Неподдерживаемые поля совместимости

Эти поля возвращают явную ошибку:

- `country`
- `language`
- `freshness`
- `date_after`
- `date_before`

## Что проверить, если что-то сломалось

### `missing_yandex_credentials`

Задай `apiKey` или `iamToken`, либо экспортируй одну из поддерживаемых env-переменных.

### `missing_yandex_folder_id`

Задай `plugins.entries.yandex.config.webSearch.folderId` или экспортируй `YANDEX_FOLDER_ID` / `YC_FOLDER_ID`.

### `unsupported_*`

Провайдер увидел фильтр, который он не реализует. Убери поле или вырази ограничение прямо в запросе.

### Результаты слишком широкие или слишком пустые

Обычно помогают такие шаги:

- переключить `searchType` между `SEARCH_TYPE_COM` и `SEARCH_TYPE_RU`
- указать `region`
- выключить исправление опечаток для точных запросов
- уменьшить `count` и сделать второй уточняющий поиск

## Лицензия

MIT-0.
