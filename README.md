# OpenClaw Yandex Search

[Русская версия](./README_ru.md)

Compact Yandex Search provider plugin for OpenClaw.

The plugin registers `yandex` as a standard `web_search` provider. It calls the synchronous Yandex Search API, parses the XML payload, and returns only the fields an agent actually needs:

- `title`
- `url`
- `description`
- `siteName`

No raw XML. No HTML noise. No oversized payloads.

## Requirements

- OpenClaw with native plugin support
- Yandex Search API access
- Yandex `folderId`
- either an API key or an IAM token

## Install

From a local folder:

```bash
openclaw plugins install ./openclaw-yandex-search
```

From a local archive:

```bash
openclaw plugins install ./openclaw-yandex-search-0.1.0.tgz
```

After installation or config changes, restart the gateway:

```bash
openclaw gateway restart
```

## Quick start

Add this to `openclaw.json`:

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

Ready-to-copy examples:

- [`examples/openclaw.config.example.json`](./examples/openclaw.config.example.json)
- [`examples/openclaw.config.iam.example.json`](./examples/openclaw.config.iam.example.json)

## IAM auth

If you prefer IAM auth:

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

## Environment variables

The plugin can also read credentials and folder id from the environment:

- `YANDEX_SEARCH_API_KEY`
- `YC_API_KEY`
- `YANDEX_IAM_TOKEN`
- `YC_IAM_TOKEN`
- `YANDEX_FOLDER_ID`
- `YC_FOLDER_ID`

## Provider config

Provider config lives under:

```json
plugins.entries.yandex.config.webSearch
```

Common fields:

- `apiKey` — Yandex Search API key
- `iamToken` — IAM token instead of an API key
- `folderId` — required Yandex folder id
- `authMode` — `auto`, `api-key`, or `iam`
- `searchType` — `SEARCH_TYPE_COM`, `SEARCH_TYPE_RU`, `SEARCH_TYPE_TR`, `SEARCH_TYPE_KK`
- `region` — optional Yandex region id for ranking bias
- `l10n` — optional localization value
- `familyMode` — `FAMILY_MODE_NONE`, `FAMILY_MODE_MODERATE`, `FAMILY_MODE_STRICT`
- `fixTypoMode` — `FIX_TYPO_MODE_ON`, `FIX_TYPO_MODE_OFF`
- `maxPassages` — number of passages requested before compacting snippets
- `userAgent` — optional user agent override
- `baseUrl` — optional endpoint override

## Supported request arguments

- `query` — required search string
- `count` — result count, clamped to OpenClaw limits
- `region` — optional Yandex region id
- `search_type` — corpus override for the current request
- `safe_search` — maps to Yandex family mode
- `fix_typo` — enables or disables typo correction

## Unsupported compatibility fields

These fields return explicit errors instead of pretending to work:

- `country`
- `language`
- `freshness`
- `date_after`
- `date_before`

## Troubleshooting

### `missing_yandex_credentials`

Set either `apiKey` or `iamToken`, or export one of the supported environment variables.

### `missing_yandex_folder_id`

Set `plugins.entries.yandex.config.webSearch.folderId` or export `YANDEX_FOLDER_ID` / `YC_FOLDER_ID`.

### `unsupported_*`

The provider saw a filter it does not implement. Remove that field or express the constraint in the query itself.

### Results are too broad or too thin

Try one of these:

- switch `searchType` between `SEARCH_TYPE_COM` and `SEARCH_TYPE_RU`
- set a `region`
- disable typo correction for exact queries
- lower `count` and refine with a second search

## License

MIT-0.
