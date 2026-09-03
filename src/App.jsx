import "./App.css";
import React, { useMemo, useState } from "react";
import axios from "axios";
import {
  Flame,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Key,
  Users,
  TrendingUp,
  Activity,
  AlertTriangle,
} from "lucide-react";

const DEX_BASE = "https://api.dexscreener.com";
const BIRDEYE_BASE = "https://public-api.birdeye.so";

const AGE_BUCKETS = ["0-5m", "5-10m", "10-15m", "15-30m", "30-60m"];

const DEFAULTS = {
  maxResults: 200,
  minHolders: 500,
  minFastPrice5m: 8,
  minFastVolume5m: 5000,
  minFastTxns5m: 25,
  minLiquidity: 0,
};

const makeEmpty = () => ({
  ALL: [],
  FAST: [],
  HOLDERS: [],
  BOTH: [],
  "0-5m": [],
  "5-10m": [],
  "10-15m": [],
  "15-30m": [],
  "30-60m": [],
});

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const formatUsd = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(num(value)) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(num(value)) < 10 ? 2 : 0,
  }).format(num(value));

const formatNumber = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num(value));

const formatPct = (value) => `${num(value).toFixed(1)}%`;

const shortAddress = (address = "") =>
  address.length > 14
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : address;

async function getJson(url, config = {}, timeout = 15000) {
  const response = await axios({
    url,
    timeout,
    validateStatus: () => true,
    ...config,
    headers: {
      Accept: "application/json",
      ...(config.headers || {}),
    },
  });

  if (response.status < 200 || response.status >= 300) {
    const message =
      response?.data?.message ||
      response?.data?.error ||
      `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.response = response;
    throw error;
  }

  return response.data;
}

function extractPairs(payload) {
  // DexScreener endpoints have returned both arrays and { pairs: [] }
  // across endpoint families/versions. Handle both safely.
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.pairs)) return payload.pairs;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.tokens)) return payload.data.tokens;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeDexPair(pair = {}) {
  return {
    address: pair.baseToken?.address || "",
    name: pair.baseToken?.name || pair.baseToken?.symbol || "Unknown",
    symbol: pair.baseToken?.symbol || "UNKNOWN",
    source: "DexScreener",
    priceUsd: num(pair.priceUsd),
    liquidity: num(pair.liquidity?.usd),
    marketCap: num(pair.marketCap),
    fdv: num(pair.fdv),
    volume5m: num(pair.volume?.m5),
    volume1h: num(pair.volume?.h1),
    priceChange1m: num(pair.priceChange?.m1),
    priceChange5m: num(pair.priceChange?.m5),
    priceChange1h: num(pair.priceChange?.h1),
    txns5m: num(pair.txns?.m5?.buys) + num(pair.txns?.m5?.sells),
    buys5m: num(pair.txns?.m5?.buys),
    sells5m: num(pair.txns?.m5?.sells),
    pairCreatedAt: num(pair.pairCreatedAt),
    dexUrl: pair.url || "",
    pairAddress: pair.pairAddress || "",
  };
}

function normalizeBirdeyeToken(item = {}) {
  const address =
    item.address || item.tokenAddress || item.token_address || item.mint || "";

  return {
    address,
    name: item.name || item.symbol || "Unknown",
    symbol: item.symbol || "UNKNOWN",
    source: "Birdeye",
    holders: firstNumber(
      item.holder,
      item.holders,
      item.holderCount,
      item.holder_count,
    ),
    priceUsd: firstNumber(item.price, item.priceUsd, item.price_usd),
    liquidity: firstNumber(
      item.liquidity,
      item.liquidityUsd,
      item.liquidity_usd,
    ),
    marketCap: firstNumber(item.market_cap, item.marketCap),
    fdv: firstNumber(item.fdv),
    volume1m: firstNumber(item.volume_1m_usd, item.volume1mUsd),
    volume5m: firstNumber(item.volume_5m_usd, item.volume5mUsd),
    volume30m: firstNumber(item.volume_30m_usd, item.volume30mUsd),
    volume1h: firstNumber(item.volume_1h_usd, item.volume1hUsd),
    volume1mChange: firstNumber(
      item.volume_1m_change_percent,
      item.volume1mChangePercent,
    ),
    volume5mChange: firstNumber(
      item.volume_5m_change_percent,
      item.volume5mChangePercent,
    ),
    priceChange1m: firstNumber(
      item.price_change_1m_percent,
      item.priceChange1mPercent,
    ),
    priceChange5m: firstNumber(
      item.price_change_5m_percent,
      item.priceChange5mPercent,
    ),
    priceChange1h: firstNumber(
      item.price_change_1h_percent,
      item.priceChange1hPercent,
    ),
    trade1m: firstNumber(item.trade_1m_count, item.trade1mCount),
    trade5m: firstNumber(item.trade_5m_count, item.trade5mCount),
    createdTime: firstNumber(
      item.creation_time,
      item.created_time,
      item.createdAt,
    ),
    recentListingTime: firstNumber(
      item.recent_listing_time,
      item.recentListingTime,
    ),
    lastTradeTime: firstNumber(
      item.last_trade_unix_time,
      item.lastTradeUnixTime,
    ),
  };
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [errors, setErrors] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  const [birdeyeApiKey, setBirdeyeApiKey] = useState(
    () => localStorage.getItem("BIRDEYE_KEY") || "",
  );

  const [settings, setSettings] = useState(DEFAULTS);
  const [tokens, setTokens] = useState(makeEmpty());
  const [discoveryStats, setDiscoveryStats] = useState({
    profiles: 0,
    boosts: 0,
    dexPairs: 0,
    birdeye: 0,
    merged: 0,
  });

  const saveKey = () => {
    localStorage.setItem("BIRDEYE_KEY", birdeyeApiKey.trim());
  };

  const getAgeMinutes = (token) => {
    const timestamps = [
      token.createdTime,
      token.recentListingTime,
      token.pairCreatedAt,
    ]
      .map((raw) => {
        const value = num(raw);
        if (!value) return 0;
        return value < 10_000_000_000 ? value * 1000 : value;
      })
      .filter(Boolean);

    if (!timestamps.length) return null;

    const createdMs = Math.min(...timestamps);
    const age = (Date.now() - createdMs) / 60000;
    return Number.isFinite(age) && age >= 0 ? age : null;
  };

  const getAgeBucket = (age) => {
    if (age === null) return null;
    if (age <= 5) return "0-5m";
    if (age <= 10) return "5-10m";
    if (age <= 15) return "10-15m";
    if (age <= 30) return "15-30m";
    if (age <= 60) return "30-60m";
    return null;
  };

  const calculateFastScore = (token) => {
    const price1m = Math.max(0, num(token.priceChange1m));
    const price5m = Math.max(0, num(token.priceChange5m));
    const volume1m = Math.max(0, num(token.volume1m));
    const volume5m = Math.max(0, num(token.volume5m));
    const volume5mChange = Math.max(0, num(token.volume5mChange));
    const trades = num(token.trade5m) || num(token.txns5m);

    return (
      Math.min(price1m, 100) * 2.5 +
      Math.min(price5m, 200) * 1.5 +
      Math.log10(volume1m + 1) * 4 +
      Math.log10(volume5m + 1) * 3 +
      Math.min(volume5mChange, 1000) * 0.08 +
      Math.min(trades, 2000) * 0.01
    );
  };

  const discoverDexProfilesAndBoosts = async () => {
    const [profilesResult, boostsResult] = await Promise.allSettled([
      getJson(`${DEX_BASE}/token-profiles/latest/v1`),
      getJson(`${DEX_BASE}/token-boosts/latest/v1`),
    ]);

    const addresses = new Set();
    let profilesCount = 0;
    let boostsCount = 0;
    const sourceErrors = [];

    if (profilesResult.status === "fulfilled") {
      const rows = extractRows(profilesResult.value);
      profilesCount = rows.length;
      rows
        .filter((item) => item.chainId === "solana" && item.tokenAddress)
        .forEach((item) => addresses.add(item.tokenAddress));
    } else {
      sourceErrors.push(
        `Dex profiles: ${profilesResult.reason?.message || "request failed"}`,
      );
    }

    if (boostsResult.status === "fulfilled") {
      const rows = extractRows(boostsResult.value);
      boostsCount = rows.length;
      rows
        .filter((item) => item.chainId === "solana" && item.tokenAddress)
        .forEach((item) => addresses.add(item.tokenAddress));
    } else {
      sourceErrors.push(
        `Dex boosts: ${boostsResult.reason?.message || "request failed"}`,
      );
    }

    return {
      addresses: [...addresses],
      profilesCount,
      boostsCount,
      sourceErrors,
    };
  };

  const fetchDexPairs = async (addresses) => {
    if (!addresses.length) return [];

    const chunks = [];
    for (let i = 0; i < addresses.length; i += 30) {
      chunks.push(addresses.slice(i, i + 30));
    }

    const results = await Promise.allSettled(
      chunks.map((chunk) =>
        getJson(`${DEX_BASE}/tokens/v1/solana/${chunk.join(",")}`),
      ),
    );

    const byAddress = new Map();
    const sourceErrors = [];

    results.forEach((result) => {
      if (result.status === "rejected") {
        sourceErrors.push(
          `Dex token lookup: ${result.reason?.message || "request failed"}`,
        );
        return;
      }

      // IMPORTANT FIX: /tokens/v1 returns an ARRAY of pairs.
      // The old app incorrectly expected response.data.pairs here.
      const pairs = extractPairs(result.value);

      pairs
        .filter((pair) => pair.chainId === "solana")
        .sort((a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd))
        .forEach((pair) => {
          const token = normalizeDexPair(pair);
          if (!token.address || byAddress.has(token.address)) return;
          byAddress.set(token.address, token);
        });
    });

    return { tokens: [...byAddress.values()], sourceErrors };
  };

  const discoverBirdeye = async () => {
    const key = birdeyeApiKey.trim();
    if (!key) return { tokens: [], sourceErrors: [] };

    // One reliable meme-list request is better than several guessed sort modes.
    // The endpoint supports sorting/filtering/pagination, while the response
    // contains summary market data. We can use its data without making it
    // a hard dependency for the app.
    try {
      const payload = await getJson(`${BIRDEYE_BASE}/defi/v3/token/meme/list`, {
        headers: {
          "X-API-KEY": key,
          "x-chain": "solana",
        },
        params: {
          sort_by: "holder",
          sort_type: "desc",
          source: "all",
          offset: 0,
          limit: 100,
        },
      });

      const rows = extractRows(payload);
      const tokens = rows
        .map(normalizeBirdeyeToken)
        .filter((token) => token.address);

      return { tokens, sourceErrors: [] };
    } catch (error) {
      return {
        tokens: [],
        sourceErrors: [`Birdeye: ${error.message || "request failed"}`],
      };
    }
  };

  const mergeTokens = (groups) => {
    const merged = new Map();

    groups.flat().forEach((token) => {
      if (!token.address) return;

      const old = merged.get(token.address);
      if (!old) {
        merged.set(token.address, token);
        return;
      }

      merged.set(token.address, {
        ...old,
        name: old.name !== "Unknown" ? old.name : token.name,
        symbol: old.symbol !== "UNKNOWN" ? old.symbol : token.symbol,
        source:
          old.source === token.source ? old.source : "Birdeye + DexScreener",
        holders: Math.max(num(old.holders), num(token.holders)),
        priceUsd: firstNumber(old.priceUsd, token.priceUsd),
        liquidity: Math.max(num(old.liquidity), num(token.liquidity)),
        marketCap: Math.max(num(old.marketCap), num(token.marketCap)),
        fdv: Math.max(num(old.fdv), num(token.fdv)),
        volume1m: Math.max(num(old.volume1m), num(token.volume1m)),
        volume5m: Math.max(num(old.volume5m), num(token.volume5m)),
        volume1h: Math.max(num(old.volume1h), num(token.volume1h)),
        volume5mChange: Math.max(
          num(old.volume5mChange),
          num(token.volume5mChange),
        ),
        priceChange1m: firstNumber(old.priceChange1m, token.priceChange1m),
        priceChange5m: firstNumber(old.priceChange5m, token.priceChange5m),
        priceChange1h: firstNumber(old.priceChange1h, token.priceChange1h),
        trade1m: Math.max(num(old.trade1m), num(token.trade1m)),
        trade5m: Math.max(num(old.trade5m), num(token.trade5m)),
        txns5m: Math.max(num(old.txns5m), num(token.txns5m)),
        buys5m: Math.max(num(old.buys5m), num(token.buys5m)),
        sells5m: Math.max(num(old.sells5m), num(token.sells5m)),
        createdTime: firstNumber(old.createdTime, token.createdTime),
        recentListingTime: firstNumber(
          old.recentListingTime,
          token.recentListingTime,
        ),
        lastTradeTime: firstNumber(old.lastTradeTime, token.lastTradeTime),
        pairCreatedAt: firstNumber(old.pairCreatedAt, token.pairCreatedAt),
        dexUrl: old.dexUrl || token.dexUrl || "",
        pairAddress: old.pairAddress || token.pairAddress || "",
      });
    });

    return [...merged.values()];
  };

  const enrichWithDex = async (candidateTokens) => {
    const addresses = [
      ...new Set(candidateTokens.map((token) => token.address).filter(Boolean)),
    ];
    if (!addresses.length) return { tokens: candidateTokens, sourceErrors: [] };

    const pairResult = await fetchDexPairs(addresses);
    const dexByAddress = new Map(
      pairResult.tokens.map((token) => [token.address, token]),
    );

    const enriched = candidateTokens.map((token) => {
      const dex = dexByAddress.get(token.address);
      if (!dex) return token;

      return {
        ...token,
        name: token.name !== "Unknown" ? token.name : dex.name,
        symbol: token.symbol !== "UNKNOWN" ? token.symbol : dex.symbol,
        priceUsd: firstNumber(token.priceUsd, dex.priceUsd),
        liquidity: Math.max(num(token.liquidity), num(dex.liquidity)),
        marketCap: Math.max(num(token.marketCap), num(dex.marketCap)),
        fdv: Math.max(num(token.fdv), num(dex.fdv)),
        volume5m: Math.max(num(token.volume5m), num(dex.volume5m)),
        volume1h: Math.max(num(token.volume1h), num(dex.volume1h)),
        priceChange1m: firstNumber(token.priceChange1m, dex.priceChange1m),
        priceChange5m: firstNumber(token.priceChange5m, dex.priceChange5m),
        priceChange1h: firstNumber(token.priceChange1h, dex.priceChange1h),
        txns5m: Math.max(num(token.txns5m), num(dex.txns5m)),
        buys5m: Math.max(num(token.buys5m), num(dex.buys5m)),
        sells5m: Math.max(num(token.sells5m), num(dex.sells5m)),
        pairCreatedAt: firstNumber(token.pairCreatedAt, dex.pairCreatedAt),
        dexUrl: token.dexUrl || dex.dexUrl,
        pairAddress: token.pairAddress || dex.pairAddress,
      };
    });

    // Include DEX pairs not originally present in a profile/boost response.
    // This is useful when the profile endpoints are sparse.
    const existing = new Map(enriched.map((token) => [token.address, token]));
    pairResult.tokens.forEach((token) => {
      if (!existing.has(token.address)) existing.set(token.address, token);
    });

    return {
      tokens: [...existing.values()],
      sourceErrors: pairResult.sourceErrors,
    };
  };

  const classify = (token) => {
    const ageMinutes = getAgeMinutes(token);
    const ageBucket = getAgeBucket(ageMinutes);

    const fast =
      num(token.priceChange1m) >= settings.minFastPrice5m / 2 ||
      num(token.priceChange5m) >= settings.minFastPrice5m ||
      num(token.volume1m) >= settings.minFastVolume5m / 5 ||
      num(token.volume5m) >= settings.minFastVolume5m ||
      num(token.volume5mChange) >= 100 ||
      num(token.txns5m) >= settings.minFastTxns5m;

    const holderHeavy = num(token.holders) >= settings.minHolders;

    return {
      ...token,
      ageMinutes,
      ageBucket,
      fast,
      holderHeavy,
      fastScore: calculateFastScore(token),
      category:
        fast && holderHeavy
          ? "BOTH"
          : fast
            ? "FAST"
            : holderHeavy
              ? "HOLDERS"
              : "WATCH",
    };
  };

  const scanSolana = async () => {
    setLoading(true);
    setErrors([]);

    try {
      const dexDiscovery = await discoverDexProfilesAndBoosts();
      const birdeyeDiscovery = await discoverBirdeye();

      const dexPairDiscovery = await fetchDexPairs(dexDiscovery.addresses);

      let candidates = mergeTokens([
        dexPairDiscovery.tokens,
        birdeyeDiscovery.tokens,
      ]);

      // Second pass enriches any Birdeye-only CAs with current DEX information.
      const enriched = await enrichWithDex(candidates);
      candidates = enriched.tokens;

      const errorsFound = [
        ...dexDiscovery.sourceErrors,
        ...dexPairDiscovery.sourceErrors,
        ...birdeyeDiscovery.sourceErrors,
        ...enriched.sourceErrors,
      ];
      setErrors(errorsFound);

      // IMPORTANT: liquidity is the only default numeric gate.
      // ALL stays broad; FAST/HOLDERS/BOTH are views over the same universe.
      const classified = candidates
        .map(classify)
        .filter((token) => num(token.liquidity) >= num(settings.minLiquidity));

      const sortResearch = (a, b) =>
        b.fastScore - a.fastScore ||
        num(b.holders) - num(a.holders) ||
        num(b.volume5m) - num(a.volume5m);

      const sortHolders = (a, b) =>
        num(b.holders) - num(a.holders) || b.fastScore - a.fastScore;

      const sortAge = (a, b) => {
        const ageA =
          a.ageMinutes === null ? Number.POSITIVE_INFINITY : a.ageMinutes;
        const ageB =
          b.ageMinutes === null ? Number.POSITIVE_INFINITY : b.ageMinutes;
        return ageA - ageB || sortResearch(a, b);
      };

      const result = makeEmpty();
      result.ALL = [...classified].sort(sortResearch);
      result.FAST = classified.filter((x) => x.fast).sort(sortResearch);
      result.HOLDERS = classified
        .filter((x) => x.holderHeavy)
        .sort(sortHolders);
      result.BOTH = classified
        .filter((x) => x.fast && x.holderHeavy)
        .sort(sortResearch);

      AGE_BUCKETS.forEach((bucket) => {
        result[bucket] = classified
          .filter((x) => x.ageBucket === bucket)
          .sort(sortAge);
      });

      Object.keys(result).forEach((key) => {
        result[key] = result[key].slice(0, Math.max(1, settings.maxResults));
      });

      setTokens(result);
      setDiscoveryStats({
        profiles: dexDiscovery.profilesCount,
        boosts: dexDiscovery.boostsCount,
        dexPairs: dexPairDiscovery.tokens.length,
        birdeye: birdeyeDiscovery.tokens.length,
        merged: classified.length,
      });
      setLastScanned(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Scanning error:", error);
      setErrors((old) => [...old, error?.message || "Scanning failed."]);
      setTokens(makeEmpty());
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (address) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1800);
    } catch (error) {
      console.error("Clipboard error:", error);
    }
  };

  const visibleTokens = tokens[activeTab] || [];

  const counts = useMemo(
    () => ({
      all: tokens.ALL.length,
      fast: tokens.FAST.length,
      holders: tokens.HOLDERS.length,
      both: tokens.BOTH.length,
      fresh: tokens["0-5m"].length,
    }),
    [tokens],
  );

  return (
    <div className="min-h-screen bg-black text-white font-mono p-4 sm:p-6 max-w-7xl mx-auto selection:bg-neutral-800">
      <header className="flex flex-col xl:flex-row items-center justify-between border-b border-neutral-900 pb-5 mb-6 gap-4">
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-100">
              SOLRUNNER
            </h1>
            <p className="text-xs text-neutral-500">
              Broad Solana token discovery • momentum + holders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full xl:w-auto">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 p-3 rounded-xl border border-neutral-800 transition-all"
            title="Scanner settings"
          >
            <Key className="w-4 h-4" />
          </button>

          <button
            onClick={scanSolana}
            disabled={loading}
            className="flex-1 xl:flex-none bg-neutral-100 text-black hover:bg-neutral-300 transition-all font-bold py-3 px-8 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "SCANNING..." : "SCAN SOL"}
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="mb-6 bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-5">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
            <Key className="w-4 h-4" /> OPTIONAL BIRDEYE
          </div>

          <div>
            <label className="block text-[10px] text-neutral-500 uppercase mb-2">
              Birdeye API Key
            </label>
            <input
              type="password"
              placeholder="Paste Birdeye API Key (optional)"
              value={birdeyeApiKey}
              onChange={(e) => setBirdeyeApiKey(e.target.value)}
              className="w-full bg-black border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-neutral-600"
            />
            <p className="text-[10px] text-neutral-600 mt-2">
              SOLRUNNER still scans through DexScreener when this is blank.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <label className="text-[10px] text-neutral-500 uppercase">
              Max results
              <input
                type="number"
                min="1"
                max="500"
                value={settings.maxResults}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    maxResults: Math.min(
                      500,
                      Math.max(1, num(e.target.value, 200)),
                    ),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min holders
              <input
                type="number"
                min="0"
                value={settings.minHolders}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minHolders: Math.max(0, num(e.target.value)),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min 5m gain %
              <input
                type="number"
                min="0"
                value={settings.minFastPrice5m}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minFastPrice5m: Math.max(0, num(e.target.value)),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min 5m volume
              <input
                type="number"
                min="0"
                value={settings.minFastVolume5m}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minFastVolume5m: Math.max(0, num(e.target.value)),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min liquidity
              <input
                type="number"
                min="0"
                value={settings.minLiquidity}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minLiquidity: Math.max(0, num(e.target.value)),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveKey}
              className="bg-neutral-800 hover:bg-neutral-700 text-xs font-bold px-4 py-2 rounded-lg text-neutral-200"
            >
              Save API Key
            </button>
            <button
              onClick={() => setSettings(DEFAULTS)}
              className="bg-neutral-900 hover:bg-neutral-800 text-xs font-bold px-4 py-2 rounded-lg text-neutral-400 border border-neutral-800"
            >
              Reset Filters
            </button>
          </div>
        </section>
      )}

      <div className="mb-6 bg-neutral-950 border border-neutral-900 rounded-xl p-3 text-[11px] space-y-2">
        {errors.map((error, index) => (
          <div key={index} className="flex gap-2 text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        ))}

        {lastScanned ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-neutral-600">
            <span>
              Last scan: <span className="text-neutral-400">{lastScanned}</span>
            </span>
            <span>
              Profiles:{" "}
              <span className="text-neutral-400">
                {discoveryStats.profiles}
              </span>
            </span>
            <span>
              Boosts:{" "}
              <span className="text-neutral-400">{discoveryStats.boosts}</span>
            </span>
            <span>
              DEX pairs:{" "}
              <span className="text-neutral-400">
                {discoveryStats.dexPairs}
              </span>
            </span>
            <span>
              Birdeye:{" "}
              <span className="text-neutral-400">{discoveryStats.birdeye}</span>
            </span>
            <span>
              Merged:{" "}
              <span className="text-neutral-400">{discoveryStats.merged}</span>
            </span>
          </div>
        ) : (
          <div className="text-neutral-600">Ready. Birdeye is optional.</div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Discovered"
          value={counts.all}
        />
        <Stat
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Fast"
          value={counts.fast}
          valueClass="text-emerald-400"
        />
        <Stat
          icon={<Users className="w-3.5 h-3.5" />}
          label="Holders"
          value={counts.holders}
          valueClass="text-sky-400"
        />
        <Stat
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Both"
          value={counts.both}
          valueClass="text-orange-400"
        />
        <Stat
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Fresh 0–5m"
          value={counts.fresh}
          valueClass="text-violet-400"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap bg-neutral-950 p-1 rounded-xl border border-neutral-900 gap-1">
          {[
            ["ALL", "ALL"],
            ["FAST", "FAST"],
            ["HOLDERS", "HOLDERS"],
            ["BOTH", "BOTH"],
            ...AGE_BUCKETS.map((bucket) => [bucket, bucket.toUpperCase()]),
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === key ? "bg-neutral-800 text-emerald-400 shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              {label} ({tokens[key]?.length || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {visibleTokens.length === 0 ? (
          <div className="border border-dashed border-neutral-900 rounded-2xl p-12 text-center bg-neutral-950/50">
            <Flame className="w-8 h-8 text-neutral-800 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">
              {lastScanned
                ? "Nothing is in this filter. Check ALL for the discovered universe."
                : "Hit SCAN SOL to start discovery."}
            </p>
          </div>
        ) : (
          visibleTokens.map((token) => (
            <div
              key={token.address}
              className="bg-neutral-950 border border-neutral-900 hover:border-neutral-800 p-4 rounded-xl transition-all"
            >
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-base text-neutral-100 truncate max-w-[300px]">
                      {token.name}
                    </span>
                    <span className="text-xs text-neutral-500 uppercase font-semibold">
                      ${token.symbol}
                    </span>
                    {token.ageBucket && (
                      <span className="bg-neutral-900 text-neutral-400 border border-neutral-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {token.ageBucket}
                      </span>
                    )}
                    {token.category === "BOTH" && (
                      <Badge
                        text="FAST + HOLDERS"
                        className="bg-orange-950/60 text-orange-300 border-orange-900/50"
                      />
                    )}
                    {token.category === "FAST" && (
                      <Badge
                        text="FAST"
                        className="bg-emerald-950/60 text-emerald-300 border-emerald-900/50"
                      />
                    )}
                    {token.category === "HOLDERS" && (
                      <Badge
                        text="HIGH HOLDERS"
                        className="bg-sky-950/60 text-sky-300 border-sky-900/50"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-neutral-500 break-all">
                      {shortAddress(token.address)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(token.address)}
                      className="text-neutral-500 hover:text-neutral-200 p-1 rounded"
                      title="Copy Contract Address"
                    >
                      {copiedAddress === token.address ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-left xl:text-right">
                  <Metric
                    label="Holders"
                    value={formatNumber(token.holders)}
                    className="text-sky-400"
                  />
                  <Metric
                    label="5m Price"
                    value={formatPct(token.priceChange5m)}
                    className="text-emerald-400"
                  />
                  <Metric label="5m Volume" value={formatUsd(token.volume5m)} />
                  <Metric label="5m Txns" value={formatNumber(token.txns5m)} />
                  <Metric
                    label="Liquidity"
                    value={formatUsd(token.liquidity)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  {token.dexUrl ? (
                    <a
                      href={token.dexUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      DEX <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-neutral-600 uppercase">
                      No indexed pair
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-neutral-900 mt-4 pt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-neutral-600 uppercase">
                <span>
                  Source:{" "}
                  <span className="text-neutral-400">{token.source}</span>
                </span>
                <span>
                  Age:{" "}
                  <span className="text-neutral-400">
                    {token.ageMinutes === null
                      ? "unknown"
                      : `${token.ageMinutes.toFixed(1)}m`}
                  </span>
                </span>
                <span>
                  Buys:{" "}
                  <span className="text-neutral-400">
                    {formatNumber(token.buys5m)}
                  </span>
                </span>
                <span>
                  Sells:{" "}
                  <span className="text-neutral-400">
                    {formatNumber(token.sells5m)}
                  </span>
                </span>
                <span>
                  Momentum:{" "}
                  <span className="text-neutral-400">
                    {num(token.fastScore).toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[10px] text-neutral-700 mt-6 leading-relaxed">
        Holder counts are displayed as reported data; the app does not attempt
        to decide whether wallets are bots, snipers, bundlers, insiders, or
        humans.
      </p>
    </div>
  );
}

function Stat({ icon, label, value, valueClass = "text-neutral-100" }) {
  return (
    <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
      <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value, className = "text-neutral-300" }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-neutral-500 font-bold">
        {label}
      </p>
      <p className={`text-sm font-bold ${className}`}>{value}</p>
    </div>
  );
}

function Badge({ text, className }) {
  return (
    <span
      className={`border text-[10px] px-2 py-0.5 rounded-full font-bold ${className}`}
    >
      {text}
    </span>
  );
}
