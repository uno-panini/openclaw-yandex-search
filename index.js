// SPDX-License-Identifier: MIT-0
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  buildSearchCacheKey,
  DEFAULT_SEARCH_COUNT,
  MAX_SEARCH_COUNT,
  formatCliCommand,
  mergeScopedSearchConfig,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveProviderWebSearchPluginConfig,
  resolveSearchCacheTtlMs,
  resolveSearchCount,
  resolveSearchTimeoutSeconds,
  resolveSiteName,
  setProviderWebSearchPluginConfigValue,
  withTrustedWebSearchEndpoint,
  wrapWebContent,
  writeCachedSearchPayload,
} from "openclaw/plugin-sdk/provider-web-search";

const YANDEX_SEARCH_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/web/search";
const YANDEX_DOCS_URL = "https://aistudio.yandex.ru/docs/ru/search-api/operations/web-search-sync.html";
const YANDEX_SIGNUP_URL = "https://aistudio.yandex.ru/docs/ru/search-api/quickstart/index.html";
const SEARCH_TYPES = new Set([
  "SEARCH_TYPE_COM",
  "SEARCH_TYPE_RU",
  "SEARCH_TYPE_TR",
  "SEARCH_TYPE_KK",
]);
const FAMILY_MODES = new Set([
  "FAMILY_MODE_NONE",
  "FAMILY_MODE_MODERATE",
  "FAMILY_MODE_STRICT",
]);
const FIX_TYPO_MODES = new Set(["FIX_TYPO_MODE_ON", "FIX_TYPO_MODE_OFF"]);
const DEFAULT_SEARCH_TYPE = "SEARCH_TYPE_COM";
const DEFAULT_FAMILY_MODE = "FAMILY_MODE_MODERATE";
const DEFAULT_FIX_TYPO_MODE = "FIX_TYPO_MODE_ON";
const DEFAULT_MAX_PASSAGES = 2;
const DEFAULT_DESCRIPTION_LENGTH = 220;

function isPlainRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveYandexConfig(searchConfig) {
  const yandex = searchConfig?.yandex;
  return isPlainRecord(yandex) ? yandex : {};
}

function readSecretish(value, path) {
  const resolved = readConfiguredSecretString(value, path);
  if (typeof resolved !== "string") {
    return undefined;
  }
  const trimmed = resolved.trim();
  return trimmed || undefined;
}

function readConfigString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeSearchType(value) {
  const candidate = readConfigString(value)?.toUpperCase();
  return candidate && SEARCH_TYPES.has(candidate) ? candidate : DEFAULT_SEARCH_TYPE;
}

function normalizeFamilyMode(value) {
  const raw = readConfigString(value);
  if (!raw) {
    return DEFAULT_FAMILY_MODE;
  }
  const upper = raw.toUpperCase();
  if (FAMILY_MODES.has(upper)) {
    return upper;
  }
  const mapped = {
    none: "FAMILY_MODE_NONE",
    moderate: "FAMILY_MODE_MODERATE",
    strict: "FAMILY_MODE_STRICT",
    off: "FAMILY_MODE_NONE",
    on: "FAMILY_MODE_MODERATE",
    false: "FAMILY_MODE_NONE",
    true: "FAMILY_MODE_MODERATE",
  }[raw.toLowerCase()];
  return mapped ?? DEFAULT_FAMILY_MODE;
}

function normalizeFixTypoMode(value) {
  const raw = readConfigString(value);
  if (!raw) {
    return DEFAULT_FIX_TYPO_MODE;
  }
  const upper = raw.toUpperCase();
  if (FIX_TYPO_MODES.has(upper)) {
    return upper;
  }
  const mapped = {
    on: "FIX_TYPO_MODE_ON",
    off: "FIX_TYPO_MODE_OFF",
    false: "FIX_TYPO_MODE_OFF",
    true: "FIX_TYPO_MODE_ON",
  }[raw.toLowerCase()];
  return mapped ?? DEFAULT_FIX_TYPO_MODE;
}

function resolveYandexApiKey(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return (
    readSecretish(yandex.apiKey, "plugins.entries.yandex.config.webSearch.apiKey") ??
    readProviderEnvValue(["YANDEX_SEARCH_API_KEY", "YC_API_KEY"])
  );
}

function resolveYandexIamToken(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return (
    readSecretish(yandex.iamToken, "plugins.entries.yandex.config.webSearch.iamToken") ??
    readProviderEnvValue(["YANDEX_IAM_TOKEN", "YC_IAM_TOKEN"])
  );
}

function resolveYandexFolderId(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return (
    readSecretish(yandex.folderId, "plugins.entries.yandex.config.webSearch.folderId") ??
    readProviderEnvValue(["YANDEX_FOLDER_ID", "YC_FOLDER_ID"])
  );
}

function resolveYandexAuth(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  const apiKey = resolveYandexApiKey(searchConfig);
  const iamToken = resolveYandexIamToken(searchConfig);
  const mode = readConfigString(yandex.authMode)?.toLowerCase() ?? "auto";

  if (mode === "iam") {
    if (iamToken) {
      return { kind: "iam", value: iamToken, header: `Bearer ${iamToken}` };
    }
    if (apiKey) {
      return { kind: "api-key", value: apiKey, header: `Api-Key ${apiKey}` };
    }
    return undefined;
  }

  if (mode === "api-key" || mode === "api_key") {
    if (apiKey) {
      return { kind: "api-key", value: apiKey, header: `Api-Key ${apiKey}` };
    }
    if (iamToken) {
      return { kind: "iam", value: iamToken, header: `Bearer ${iamToken}` };
    }
    return undefined;
  }

  if (iamToken) {
    return { kind: "iam", value: iamToken, header: `Bearer ${iamToken}` };
  }
  if (apiKey) {
    return { kind: "api-key", value: apiKey, header: `Api-Key ${apiKey}` };
  }
  return undefined;
}

function resolveYandexSearchType(searchConfig, override) {
  if (override) {
    return normalizeSearchType(override);
  }
  const yandex = resolveYandexConfig(searchConfig);
  return normalizeSearchType(yandex.searchType);
}

function resolveYandexRegion(searchConfig, override) {
  if (override) {
    return readConfigString(override);
  }
  const yandex = resolveYandexConfig(searchConfig);
  return readConfigString(yandex.region);
}

function resolveYandexL10n(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return readConfigString(yandex.l10n ?? yandex.l10N);
}

function resolveYandexFamilyMode(searchConfig, safeSearchOverride) {
  if (typeof safeSearchOverride === "boolean") {
    return safeSearchOverride ? "FAMILY_MODE_MODERATE" : "FAMILY_MODE_NONE";
  }
  const yandex = resolveYandexConfig(searchConfig);
  return normalizeFamilyMode(yandex.familyMode);
}

function resolveYandexFixTypoMode(searchConfig, fixTypoOverride) {
  if (typeof fixTypoOverride === "boolean") {
    return fixTypoOverride ? "FIX_TYPO_MODE_ON" : "FIX_TYPO_MODE_OFF";
  }
  const yandex = resolveYandexConfig(searchConfig);
  return normalizeFixTypoMode(yandex.fixTypoMode);
}

function resolveYandexBaseUrl(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return readConfigString(yandex.baseUrl) ?? YANDEX_SEARCH_ENDPOINT;
}

function resolveYandexUserAgent(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return readConfigString(yandex.userAgent) ?? "OpenClaw Yandex Search Plugin/0.1.0";
}

function resolveYandexMaxPassages(searchConfig) {
  const yandex = resolveYandexConfig(searchConfig);
  return clampInteger(yandex.maxPassages, 1, 5, DEFAULT_MAX_PASSAGES);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value, limit = DEFAULT_DESCRIPTION_LENGTH) {
  const text = normalizeWhitespace(value);
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function decodeXmlEntities(value) {
  if (!value) {
    return "";
  }
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function cleanXmlText(value, limit = DEFAULT_DESCRIPTION_LENGTH) {
  return truncate(normalizeWhitespace(stripTags(decodeXmlEntities(value ?? ""))), limit);
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

function extractAllTags(xml, tag) {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const values = [];
  let match;
  while ((match = regex.exec(xml))) {
    values.push(match[1]);
  }
  return values;
}

function splitXmlResultBlocks(xml) {
  const groups = xml.match(/<group\b[\s\S]*?<\/group>/gi);
  if (groups?.length) {
    return groups;
  }
  return xml.match(/<doc\b[\s\S]*?<\/doc>/gi) ?? [];
}

function extractDocBlock(block) {
  const match = block.match(/<doc\b[\s\S]*?<\/doc>/i);
  return match?.[0] ?? block;
}

function buildDescription(docXml) {
  const headline = cleanXmlText(extractTag(docXml, "headline") ?? "", DEFAULT_DESCRIPTION_LENGTH);
  if (headline) {
    return headline;
  }
  const passages = extractAllTags(docXml, "passage")
    .map((entry) => cleanXmlText(entry, 120))
    .filter(Boolean)
    .slice(0, 2);
  if (!passages.length) {
    return "";
  }
  return truncate(passages.join(" "), DEFAULT_DESCRIPTION_LENGTH);
}

function parseYandexXml(xml, limit) {
  const blocks = splitXmlResultBlocks(xml);
  const results = [];

  for (const block of blocks) {
    const docXml = extractDocBlock(block);
    const url = cleanXmlText(extractTag(docXml, "url") ?? "", 500);
    if (!url) {
      continue;
    }

    const title =
      cleanXmlText(extractTag(docXml, "title") ?? "", 180) ||
      cleanXmlText(extractTag(docXml, "headline") ?? "", 180) ||
      resolveSiteName(url) ||
      url;

    const description = buildDescription(docXml);
    const domain = cleanXmlText(extractTag(docXml, "domain") ?? "", 120);
    const siteName = resolveSiteName(url) || domain || undefined;

    results.push({ title, url, description, siteName });
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

async function runYandexSearch(params) {
  const requestBody = {
    query: {
      searchType: params.searchType,
      queryText: params.query,
      familyMode: params.familyMode,
      fixTypoMode: params.fixTypoMode,
    },
    folderId: params.folderId,
    responseFormat: "FORMAT_XML",
    groupSpec: {
      groupMode: "GROUP_MODE_FLAT",
      groupsOnPage: params.count,
      docsInGroup: 1,
    },
    maxPassages: params.maxPassages,
    userAgent: params.userAgent,
  };

  if (params.region) {
    requestBody.region = params.region;
  }
  if (params.l10n) {
    requestBody.l10n = params.l10n;
  }

  return withTrustedWebSearchEndpoint(
    {
      url: params.url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: params.authHeader,
        },
        body: JSON.stringify(requestBody),
      },
    },
    async (res) => {
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Yandex Search API error (${res.status}): ${detail || res.statusText}`);
      }

      const data = await res.json();
      const rawData = typeof data?.rawData === "string" ? data.rawData : "";
      if (!rawData) {
        return [];
      }

      const trimmedRawData = rawData.trim();
      let xml = trimmedRawData;
      if (!trimmedRawData.startsWith("<")) {
        const decoded = Buffer.from(trimmedRawData, "base64").toString("utf8").trim();
        if (decoded.startsWith("<")) {
          xml = decoded;
        }
      }

      return parseYandexXml(xml, params.count).map((entry) => ({
        title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
        url: entry.url,
        description: entry.description ? wrapWebContent(entry.description, "web_search") : "",
        siteName: entry.siteName,
      }));
    },
  );
}

function createYandexSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "Search query string.",
      },
      count: {
        type: "number",
        minimum: 1,
        maximum: MAX_SEARCH_COUNT,
        description: "Number of results to return (1-10).",
      },
      region: {
        type: "string",
        description: "Optional Yandex region id used to bias ranking.",
      },
      search_type: {
        type: "string",
        enum: Array.from(SEARCH_TYPES),
        description: "Search corpus: SEARCH_TYPE_COM, _RU, _TR, or _KK.",
      },
      safe_search: {
        type: "boolean",
        description: "Enable Yandex family filtering for the current request.",
      },
      fix_typo: {
        type: "boolean",
        description: "Enable typo correction for the current request.",
      },
      country: {
        type: "string",
        description: "Compatibility field only; not supported by this provider.",
      },
      language: {
        type: "string",
        description: "Compatibility field only; use provider l10n config instead.",
      },
      freshness: {
        type: "string",
        description: "Compatibility field only; not supported in sync mode here.",
      },
      date_after: {
        type: "string",
        description: "Compatibility field only; not supported in sync mode here.",
      },
      date_before: {
        type: "string",
        description: "Compatibility field only; not supported in sync mode here.",
      },
    },
  };
}

function missingYandexCredentialPayload() {
  return {
    error: "missing_yandex_credentials",
    message:
      `web_search (yandex) needs a Yandex Search credential. ` +
      `Set plugins.entries.yandex.config.webSearch.apiKey or iamToken, ` +
      `or export YANDEX_SEARCH_API_KEY / YANDEX_IAM_TOKEN. ` +
      `Run \`${formatCliCommand("openclaw configure --section web")}\` to store it in config.`,
    docs: YANDEX_DOCS_URL,
  };
}

function missingYandexFolderPayload() {
  return {
    error: "missing_yandex_folder_id",
    message:
      "web_search (yandex) needs folderId. Set plugins.entries.yandex.config.webSearch.folderId " +
      "or export YANDEX_FOLDER_ID / YC_FOLDER_ID.",
    docs: YANDEX_DOCS_URL,
  };
}

function unsupportedFilterPayload(field, help) {
  return {
    error: `unsupported_${field}`,
    message: `${field} is not supported by this Yandex sync search provider. ${help}`,
    docs: YANDEX_DOCS_URL,
  };
}

function getBooleanArg(record, key) {
  return typeof record?.[key] === "boolean" ? record[key] : undefined;
}

function setCredentialOnSearchConfig(searchConfigTarget, value) {
  if (!isPlainRecord(searchConfigTarget)) {
    return;
  }
  if (!isPlainRecord(searchConfigTarget.yandex)) {
    searchConfigTarget.yandex = {};
  }
  searchConfigTarget.yandex.apiKey = value;
}

function getConfiguredCredentialValue(config) {
  const providerConfig = resolveProviderWebSearchPluginConfig(config, "yandex");
  return providerConfig?.apiKey ?? providerConfig?.iamToken;
}

function createYandexToolDefinition(searchConfig) {
  return {
    description:
      "Search the web using Yandex Search API sync mode. " +
      "Returns compact title/url/snippet results parsed from XML with low token overhead.",
    parameters: createYandexSchema(),
    execute: async (args) => {
      const auth = resolveYandexAuth(searchConfig);
      if (!auth?.value) {
        return missingYandexCredentialPayload();
      }

      const folderId = resolveYandexFolderId(searchConfig);
      if (!folderId) {
        return missingYandexFolderPayload();
      }

      const params = isPlainRecord(args) ? args : {};
      const query = readStringParam(params, "query", { required: true });
      const countParam = readNumberParam(params, "count", { integer: true });
      const count = resolveSearchCount(countParam, searchConfig?.maxResults ?? DEFAULT_SEARCH_COUNT);
      const region = resolveYandexRegion(searchConfig, readStringParam(params, "region"));
      const searchTypeOverride = readStringParam(params, "search_type");
      const safeSearch = getBooleanArg(params, "safe_search");
      const fixTypo = getBooleanArg(params, "fix_typo");

      if (readStringParam(params, "country")) {
        return unsupportedFilterPayload("country", "Use region instead.");
      }
      if (readStringParam(params, "language")) {
        return unsupportedFilterPayload("language", "Configure webSearch.l10n on the provider instead.");
      }
      if (readStringParam(params, "freshness")) {
        return unsupportedFilterPayload("freshness", "Yandex sync search does not expose this filter in this compact provider.");
      }
      if (readStringParam(params, "date_after") || readStringParam(params, "date_before")) {
        return unsupportedFilterPayload("date_filter", "Use the query text itself for date constraints if needed.");
      }

      const searchType = resolveYandexSearchType(searchConfig, searchTypeOverride);
      const familyMode = resolveYandexFamilyMode(searchConfig, safeSearch);
      const fixTypoMode = resolveYandexFixTypoMode(searchConfig, fixTypo);
      const cacheKey = buildSearchCacheKey([
        "yandex",
        query,
        count,
        region,
        searchType,
        familyMode,
        fixTypoMode,
        folderId,
      ]);
      const cached = readCachedSearchPayload(cacheKey);
      if (cached) {
        return cached;
      }

      const start = Date.now();
      const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
      const cacheTtlMs = resolveSearchCacheTtlMs(searchConfig);
      const results = await runYandexSearch({
        url: resolveYandexBaseUrl(searchConfig),
        query,
        count,
        searchType,
        familyMode,
        fixTypoMode,
        folderId,
        region,
        l10n: resolveYandexL10n(searchConfig),
        maxPassages: resolveYandexMaxPassages(searchConfig),
        userAgent: resolveYandexUserAgent(searchConfig),
        timeoutSeconds,
        authHeader: auth.header,
      });

      const payload = {
        query,
        provider: "yandex",
        count: results.length,
        tookMs: Date.now() - start,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: "yandex",
          wrapped: true,
        },
        results,
      };

      writeCachedSearchPayload(cacheKey, payload, cacheTtlMs);
      return payload;
    },
  };
}

export function createYandexWebSearchProvider() {
  return {
    id: "yandex",
    label: "Yandex Search",
    hint: "Structured XML results · compact snippets · API key or IAM token",
    onboardingScopes: ["text-inference"],
    credentialLabel: "Yandex Search API key / IAM token",
    envVars: [
      "YANDEX_SEARCH_API_KEY",
      "YC_API_KEY",
      "YANDEX_IAM_TOKEN",
      "YC_IAM_TOKEN",
    ],
    placeholder: "AQVN... or y0_AgAA...",
    signupUrl: YANDEX_SIGNUP_URL,
    docsUrl: YANDEX_DOCS_URL,
    autoDetectOrder: 45,
    credentialPath: "plugins.entries.yandex.config.webSearch.apiKey",
    inactiveSecretPaths: [
      "plugins.entries.yandex.config.webSearch.apiKey",
      "plugins.entries.yandex.config.webSearch.iamToken",
    ],
    getCredentialValue: (searchConfig) => {
      const yandex = resolveYandexConfig(searchConfig);
      return yandex.apiKey ?? yandex.iamToken;
    },
    setCredentialValue: setCredentialOnSearchConfig,
    getConfiguredCredentialValue,
    setConfiguredCredentialValue: (configTarget, value) => {
      setProviderWebSearchPluginConfigValue(configTarget, "yandex", "apiKey", value);
    },
    createTool: (ctx) =>
      createYandexToolDefinition(
        mergeScopedSearchConfig(
          ctx.searchConfig,
          "yandex",
          resolveProviderWebSearchPluginConfig(ctx.config, "yandex"),
        ),
      ),
  };
}

export default definePluginEntry({
  id: "yandex",
  name: "Yandex Search Plugin",
  description: "OpenClaw Yandex Search provider",
  register(api) {
    api.registerWebSearchProvider(createYandexWebSearchProvider());
  },
});

export const __testing = {
  normalizeSearchType,
  normalizeFamilyMode,
  normalizeFixTypoMode,
  parseYandexXml,
  buildDescription,
};
