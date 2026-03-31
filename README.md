# OpenClaw Yandex Search plugin

[Русская версия](./README_ru.md)

A native OpenClaw plugin that adds Yandex as a standard web search provider.

This plugin does not create a second search tool. It plugs into OpenClaw's normal web search flow, so you set `tools.web.search.provider` to `yandex` and keep the usual search UX.

The output is intentionally small. The provider asks Yandex for XML, flattens groups, keeps one document per group, and returns only the fields that matter to an agent:

- `title`
- `url`
- `description`
- `siteName`

No raw XML. No HTML noise. No long text dumps that waste tokens.

## What it does

- registers a standard web search provider with id `yandex`
- calls the synchronous Yandex Search API endpoint
- supports API key or IAM token authentication
- returns compact search results instead of verbose provider payloads
- keeps compatibility with the usual OpenClaw search arguments where that mapping is clean

## Why this exists

Most web search APIs are designed for people, not agents. They often return extra markup, oversized snippets, or provider-specific fields that are expensive to pass through an LLM.

This plugin stays boring on purpose. It is built for agent search.

The real reason is that i needed a search provider for OpenClaw, that really can search from/inside Russia, and here is my solution.

## Requirements

- OpenClaw with native plugin support
- Yandex Search API access
- a Yandex `folderId`
- either an API key or an IAM token

## Install

### From a local folder

```bash
openclaw plugins install ./openclaw-yandex-search
```

### From a local archive

```bash
openclaw plugins install ./openclaw-yandex-search-plugin-0.1.0.tgz
```

### From ClawHub


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

That is enough for the common case.

A ready-to-copy file is included as [`examples/openclaw.config.example.json`](./examples/openclaw.config.example.json).

## IAM token configuration

If you prefer IAM auth, use this instead:

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
            "searchType": "SEARCH_TYPE_RU"
          }
        }
      }
    }
  }
}
```

A separate example lives in [`examples/openclaw.config.iam.example.json`](./examples/openclaw.config.iam.example.json).

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

### Common fields

| Field | What it does |
| --- | --- |
| `apiKey` | Yandex Search API key |
| `iamToken` | IAM token instead of an API key |
| `authMode` | `auto`, `api-key`, or `iam` |
| `folderId` | Required Yandex folder id |
| `searchType` | `SEARCH_TYPE_COM`, `SEARCH_TYPE_RU`, `SEARCH_TYPE_TR`, `SEARCH_TYPE_KK` |
| `region` | Optional Yandex region id used for ranking bias |
| `l10n` | Optional Yandex localization value |
| `familyMode` | `FAMILY_MODE_NONE`, `FAMILY_MODE_MODERATE`, or `FAMILY_MODE_STRICT` |
| `fixTypoMode` | `FIX_TYPO_MODE_ON` or `FIX_TYPO_MODE_OFF` |
| `maxPassages` | How many Yandex passages to request before compacting snippets |
| `userAgent` | Optional user agent override |
| `baseUrl` | Optional endpoint override |

## Supported request arguments

These are the per-search arguments the provider handles.

| Argument | Type | Notes |
| --- | --- | --- |
| `query` | `string` | Required search query |
| `count` | `number` | Result count, clamped to OpenClaw limits |
| `region` | `string` | Optional Yandex region id |
| `search_type` | `string` | `SEARCH_TYPE_COM`, `SEARCH_TYPE_RU`, `SEARCH_TYPE_TR`, `SEARCH_TYPE_KK` |
| `safe_search` | `boolean` | Maps to Yandex family mode |
| `fix_typo` | `boolean` | Turns typo correction on or off |

## Unsupported compatibility fields

These fields are left in place for compatibility with broader search interfaces, but this provider returns an explicit error for them instead of pretending to support them:

- `country`
- `language`
- `freshness`
- `date_after`
- `date_before`

That makes failures obvious and easier to debug.

## Example tool input

```json
{
  "query": "openclaw yandex search plugin",
  "count": 5,
  "region": "213",
  "search_type": "SEARCH_TYPE_COM",
  "safe_search": false,
  "fix_typo": true
}
```

## Example response shape

```json
{
  "query": "openclaw yandex search plugin",
  "provider": "yandex",
  "count": 3,
  "tookMs": 412,
  "results": [
    {
      "title": "OpenClaw Yandex Search plugin",
      "url": "https://example.com/openclaw-yandex-search",
      "description": "Compact Yandex-backed search provider for OpenClaw.",
      "siteName": "example.com"
    }
  ]
}
```

## How it keeps token usage down

Most of the savings come from being strict about the response shape:

- XML in, compact JSON out
- flat grouping with one document per group
- short snippet built from `headline` or `passage`
- long titles and descriptions trimmed before they hit the model

If you need full page content, that is usually a separate fetch step, not a search step.

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
- lower `count` and let the agent refine with a second search

## License

This project is released under MIT-0.
