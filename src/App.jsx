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
} from "lucide-react";

/**
 * SOLRUNNER — broader Solana meme-token discovery
 *
 * Discovery:
 *   1) Birdeye Meme Token List (preferred): broad meme-token universe
 *   2) DexScreener latest profiles + boosts (fallback / additional coverage)
 *
 * Classification:
 *   - FAST: strong recent price/volume momentum
 *   - HOLDERS: high reported holder count
 *   - BOTH: satisfies both
 *   - ALL: union of everything discovered
 *
 * IMPORTANT:
 * API keys in a React frontend are visible to users.
 * For production, proxy Birdeye/Solscan through your own backend.
 */

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const DEX_BASE = "https://api.dexscreener.com";

const DEFAULTS = {
  maxResults: 150,
  minHolders: 500,
  minFastPrice5m: 8, // percent
  minFastVolume5m: 5000, // USD
  minFastTxns5m: 25,
  minLiquidity: 0, // inclusive by default
  onlySolana: true,
};

const safeNum = (value, fallback = 0) => {
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

const formatUsd = (num) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(num) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(num) < 10 ? 2 : 0,
  }).format(safeNum(num));

const formatNumber = (num) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeNum(num));

const pct = (num) => `${safeNum(num).toFixed(1)}%`;

const shortAddress = (address = "") =>
  address.length > 14
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : address;

const buildBirdeyeParams = (extra = {}) => ({
  sort_by: "holder",
  sort_type: "desc",
  source: "all",
  offset: 0,
  limit: 100,
  ...extra,
});

const normalizeBirdeyeToken = (item = {}, source = "Birdeye") => {
  const address =
    item.address || item.tokenAddress || item.token_address || item.mint;

  if (!address) return null;

  return {
    address,
    name: item.name || item.symbol || "Unknown",
    symbol: item.symbol || "UNKNOWN",
    source,
    holders: firstNumber(
      item.holder,
      item.holders,
      item.holderCount,
      item.holder_count,
    ),
    priceUsd: firstNumber(item.price, item.priceUsd, item.price_usd),
    volume1m: firstNumber(item.volume_1m_usd, item.volume1mUsd),
    volume5m: firstNumber(item.volume_5m_usd, item.volume5mUsd),
    volume30m: firstNumber(item.volume_30m_usd, item.volume30mUsd),
    volume1h: firstNumber(item.volume_1h_usd, item.volume1hUsd),
    volume5mChange: firstNumber(
      item.volume_5m_change_percent,
      item.volume5mChangePercent,
    ),
    priceChange5m: firstNumber(
      item.price_change_5m_percent,
      item.priceChange5mPercent,
    ),
    priceChange1h: firstNumber(
      item.price_change_1h_percent,
      item.priceChange1hPercent,
    ),
    marketCap: firstNumber(item.market_cap, item.marketCap),
    liquidity: firstNumber(item.liquidity),
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
    sourcePlatform: item.source || item.platform || null,
  };
};

const normalizeDexPair = (pair = {}, source = "DexScreener") => ({
  address: pair.baseToken?.address,
  name: pair.baseToken?.name || pair.baseToken?.symbol || "Unknown",
  symbol: pair.baseToken?.symbol || "UNKNOWN",
  source,
  priceUsd: safeNum(pair.priceUsd),
  volume5m: safeNum(pair.volume?.m5),
  volume1h: safeNum(pair.volume?.h1),
  liquidity: safeNum(pair.liquidity?.usd),
  fdv: safeNum(pair.fdv),
  marketCap: safeNum(pair.marketCap),
  txns5m: safeNum(pair.txns?.m5?.buys) + safeNum(pair.txns?.m5?.sells),
  buys5m: safeNum(pair.txns?.m5?.buys),
  sells5m: safeNum(pair.txns?.m5?.sells),
  priceChange5m: safeNum(pair.priceChange?.m5),
  priceChange1h: safeNum(pair.priceChange?.h1),
  pairCreatedAt: safeNum(pair.pairCreatedAt),
  dexUrl: pair.url || "",
  pairAddress: pair.pairAddress || "",
});

export default function App() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [copiedAddress, setCopiedAddress] = useState(null);

  const [birdeyeApiKey, setBirdeyeApiKey] = useState(
    () => localStorage.getItem("BIRDEYE_KEY") || "",
  );

  const [settings, setSettings] = useState(DEFAULTS);
  const [showSettings, setShowSettings] = useState(false);

  const AGE_BUCKETS = ["0-5m", "5-10m", "10-15m", "15-30m", "30-60m"];

  const [tokens, setTokens] = useState({
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

  const [lastScanned, setLastScanned] = useState(null);
  const [errors, setErrors] = useState([]);

  const saveKey = () => {
    localStorage.setItem("BIRDEYE_KEY", birdeyeApiKey.trim());
  };

  const axiosWithTimeout = (config, timeout = 12000) =>
    axios({
      timeout,
      ...config,
    });

  /**
   * Birdeye gives us a broad discovery layer and directly exposes
   * holder counts plus short-window volume/price fields.
   *
   * We intentionally query multiple ranked views and UNION them.
   * That is much more inclusive than taking only one ranking.
   */
  const discoverFromBirdeye = async () => {
    if (!birdeyeApiKey.trim()) return [];

    const headers = {
      "X-API-KEY": birdeyeApiKey.trim(),
      "x-chain": "solana",
    };

    const queries = [
      buildBirdeyeParams({
        sort_by: "holder",
      }),
      buildBirdeyeParams({
        sort_by: "volume_5m_usd",
      }),
      buildBirdeyeParams({
        sort_by: "price_change_5m_percent",
      }),
      buildBirdeyeParams({
        sort_by: "volume_1m_usd",
      }),
    ];

    const results = await Promise.allSettled(
      queries.map((params) =>
        axiosWithTimeout({
          method: "GET",
          url: `${BIRDEYE_BASE}/defi/v3/token/meme/list`,
          headers,
          params,
        }),
      ),
    );

    const out = new Map();

    results.forEach((result) => {
      if (result.status !== "fulfilled") return;

      const rows =
        result.value?.data?.data?.items || result.value?.data?.data || [];

      rows.forEach((row) => {
        const token = normalizeBirdeyeToken(row);
        if (!token) return;

        const existing = out.get(token.address);

        // Keep the richest non-zero values when the same CA
        // appears in multiple ranked views.
        if (!existing) {
          out.set(token.address, token);
          return;
        }

        out.set(token.address, {
          ...existing,
          name: existing.name !== "Unknown" ? existing.name : token.name,
          symbol:
            existing.symbol !== "UNKNOWN" ? existing.symbol : token.symbol,
          holders: Math.max(existing.holders, token.holders),
          priceUsd: firstNumber(existing.priceUsd, token.priceUsd),
          volume1m: Math.max(existing.volume1m, token.volume1m),
          volume5m: Math.max(existing.volume5m, token.volume5m),
          volume30m: Math.max(existing.volume30m, token.volume30m),
          volume1h: Math.max(existing.volume1h, token.volume1h),
          volume5mChange: Math.max(
            existing.volume5mChange,
            token.volume5mChange,
          ),
          priceChange5m: Math.max(existing.priceChange5m, token.priceChange5m),
          priceChange1h: Math.max(existing.priceChange1h, token.priceChange1h),
          marketCap: Math.max(existing.marketCap, token.marketCap),
          liquidity: Math.max(existing.liquidity, token.liquidity),
          createdTime: firstNumber(existing.createdTime, token.createdTime),
          recentListingTime: firstNumber(
            existing.recentListingTime,
            token.recentListingTime,
          ),
          lastTradeTime: firstNumber(
            existing.lastTradeTime,
            token.lastTradeTime,
          ),
        });
      });
    });

    return [...out.values()];
  };

  /**
   * DexScreener is kept as an additional discovery source / fallback.
   * Unlike the old version, we do NOT immediately slice the discovered
   * addresses to 30 before classification.
   */
  const discoverFromDexScreener = async () => {
    const [profiles, boosts] = await Promise.allSettled([
      axiosWithTimeout({
        method: "GET",
        url: `${DEX_BASE}/token-profiles/latest/v1`,
      }),
      axiosWithTimeout({
        method: "GET",
        url: `${DEX_BASE}/token-boosts/latest/v1`,
      }),
    ]);

    const addresses = new Set();

    if (profiles.status === "fulfilled") {
      (profiles.value?.data || [])
        .filter((x) => x.chainId === "solana" && x.tokenAddress)
        .forEach((x) => addresses.add(x.tokenAddress));
    }

    if (boosts.status === "fulfilled") {
      (boosts.value?.data || [])
        .filter((x) => x.chainId === "solana" && x.tokenAddress)
        .forEach((x) => addresses.add(x.tokenAddress));
    }

    const addressList = [...addresses];

    if (!addressList.length) return [];

    // DexScreener's token endpoint accepts comma-separated addresses.
    // Batch conservatively to avoid giant URLs.
    const chunks = [];
    for (let i = 0; i < addressList.length; i += 25) {
      chunks.push(addressList.slice(i, i + 25));
    }

    const pairResults = await Promise.allSettled(
      chunks.map((chunk) =>
        axiosWithTimeout({
          method: "GET",
          url: `${DEX_BASE}/latest/dex/tokens/${chunk.join(",")}`,
        }),
      ),
    );

    const out = new Map();

    pairResults.forEach((result) => {
      if (result.status !== "fulfilled") return;

      const pairs = result.value?.data?.pairs || [];

      pairs
        .filter((p) => p.chainId === "solana")
        .sort((a, b) => safeNum(b.liquidity?.usd) - safeNum(a.liquidity?.usd))
        .forEach((pair) => {
          const token = normalizeDexPair(pair);
          if (!token.address || out.has(token.address)) return;
          out.set(token.address, token);
        });
    });

    return [...out.values()];
  };

  /**
   * Enrich candidates with the best available DexScreener pair data.
   * This also means a token discovered from Birdeye gets a DEX URL,
   * liquidity, transaction count, and pair timestamps when available.
   */
  const enrichWithDexScreener = async (candidateTokens) => {
    const addresses = [
      ...new Set(candidateTokens.map((x) => x.address)),
    ].filter(Boolean);

    if (!addresses.length) return [];

    const chunks = [];
    for (let i = 0; i < addresses.length; i += 25) {
      chunks.push(addresses.slice(i, i + 25));
    }

    const results = await Promise.allSettled(
      chunks.map((chunk) =>
        axiosWithTimeout({
          method: "GET",
          url: `${DEX_BASE}/latest/dex/tokens/${chunk.join(",")}`,
        }),
      ),
    );

    const byAddress = new Map();

    results.forEach((result) => {
      if (result.status !== "fulfilled") return;

      const pairs = result.value?.data?.pairs || [];

      pairs
        .filter((p) => p.chainId === "solana")
        .sort((a, b) => safeNum(b.liquidity?.usd) - safeNum(a.liquidity?.usd))
        .forEach((pair) => {
          const row = normalizeDexPair(pair);
          if (!row.address || byAddress.has(row.address)) return;
          byAddress.set(row.address, row);
        });
    });

    return candidateTokens.map((token) => {
      const dex = byAddress.get(token.address);

      if (!dex) {
        return {
          ...token,
          liquidity: safeNum(token.liquidity),
          priceChange5m: safeNum(token.priceChange5m),
          volume5m: safeNum(token.volume5m),
          dexUrl: "",
          pairAddress: "",
          pairCreatedAt: 0,
          txns5m: 0,
          buys5m: 0,
          sells5m: 0,
        };
      }

      return {
        ...token,
        // Prefer Birdeye holder count. DexScreener does not provide
        // a trustworthy global holder count here.
        name: token.name || dex.name,
        symbol: token.symbol || dex.symbol,
        priceUsd: firstNumber(token.priceUsd, dex.priceUsd),
        volume5m: Math.max(token.volume5m, dex.volume5m),
        volume1h: Math.max(token.volume1h, dex.volume1h),
        liquidity: Math.max(token.liquidity, dex.liquidity),
        marketCap: Math.max(token.marketCap, dex.marketCap),
        priceChange5m: firstNumber(token.priceChange5m, dex.priceChange5m),
        priceChange1h: firstNumber(token.priceChange1h, dex.priceChange1h),
        pairCreatedAt: dex.pairCreatedAt,
        txns5m: dex.txns5m,
        buys5m: dex.buys5m,
        sells5m: dex.sells5m,
        dexUrl: dex.dexUrl,
        pairAddress: dex.pairAddress,
      };
    });
  };

  const calculateFastScore = (token) => {
    const price = Math.max(0, safeNum(token.priceChange5m));
    const volume = Math.max(0, safeNum(token.volume5m));
    const volumeChange = Math.max(0, safeNum(token.volume5mChange));
    const txns = Math.max(0, safeNum(token.txns5m));

    // No attempt is made to call this an investment signal.
    // It is simply a ranking score for recent market activity.
    return (
      Math.min(price, 100) * 2.0 +
      Math.min(volumeChange, 500) * 0.12 +
      Math.log10(volume + 1) * 5 +
      Math.min(txns, 1000) * 0.01
    );
  };

  const getAgeMinutes = (token) => {
    const candidates = [
      token.createdTime,
      token.recentListingTime,
      token.pairCreatedAt,
    ]
      .map(safeNum)
      .filter((n) => n > 0);

    if (!candidates.length) return null;

    // API timestamps may be either seconds or milliseconds.
    const raw = Math.min(...candidates);
    const createdMs = raw < 10_000_000_000 ? raw * 1000 : raw;

    const age = (Date.now() - createdMs) / 60000;
    return Number.isFinite(age) ? age : null;
  };

  const getAgeBucket = (ageMinutes) => {
    if (ageMinutes === null || ageMinutes < 0) return null;
    if (ageMinutes <= 5) return "0-5m";
    if (ageMinutes <= 10) return "5-10m";
    if (ageMinutes <= 15) return "10-15m";
    if (ageMinutes <= 30) return "15-30m";
    if (ageMinutes <= 60) return "30-60m";
    return null;
  };

  const classify = (token) => {
    const holders = safeNum(token.holders);

    const price5m = safeNum(token.priceChange5m);
    const volume5m = safeNum(token.volume5m);
    const volume5mChange = safeNum(token.volume5mChange);
    const txns5m = safeNum(token.txns5m);

    // A token can qualify as FAST through multiple independent paths.
    // This prevents a single missing metric from killing discovery.
    const fast =
      price5m >= settings.minFastPrice5m ||
      volume5m >= settings.minFastVolume5m ||
      volume5mChange >= 100 ||
      txns5m >= settings.minFastTxns5m;

    const holderHeavy = holders >= settings.minHolders;
    const ageMinutes = getAgeMinutes(token);
    const ageBucket = getAgeBucket(ageMinutes);

    return {
      ...token,
      fast,
      holderHeavy,
      ageMinutes,
      ageBucket,
      category:
        fast && holderHeavy
          ? "BOTH"
          : fast
            ? "FAST"
            : holderHeavy
              ? "HOLDERS"
              : null,
      fastScore: calculateFastScore(token),
    };
  };

  const scanSolana = async () => {
    setLoading(true);
    setErrors([]);

    try {
      let candidates = [];

      // Preferred broad discovery.
      if (birdeyeApiKey.trim()) {
        try {
          candidates = await discoverFromBirdeye();
        } catch (error) {
          console.error("Birdeye discovery failed:", error);
          setErrors((prev) => [
            ...prev,
            "Birdeye discovery failed; DexScreener fallback was used.",
          ]);
        }
      }

      // Always add DexScreener discovery to broaden coverage.
      try {
        const dexCandidates = await discoverFromDexScreener();

        const merged = new Map(
          candidates.map((token) => [token.address, token]),
        );

        dexCandidates.forEach((token) => {
          const existing = merged.get(token.address);

          if (!existing) {
            merged.set(token.address, token);
          } else {
            merged.set(token.address, {
              ...existing,
              name: existing.name !== "Unknown" ? existing.name : token.name,
              symbol:
                existing.symbol !== "UNKNOWN" ? existing.symbol : token.symbol,
              priceUsd: firstNumber(existing.priceUsd, token.priceUsd),
              volume5m: Math.max(existing.volume5m, token.volume5m),
              volume1h: Math.max(existing.volume1h, token.volume1h),
              liquidity: Math.max(existing.liquidity, token.liquidity),
              marketCap: Math.max(existing.marketCap, token.marketCap),
              priceChange5m: firstNumber(
                existing.priceChange5m,
                token.priceChange5m,
              ),
              priceChange1h: firstNumber(
                existing.priceChange1h,
                token.priceChange1h,
              ),
              pairCreatedAt: existing.pairCreatedAt || token.pairCreatedAt,
              txns5m: Math.max(existing.txns5m || 0, token.txns5m || 0),
              buys5m: Math.max(existing.buys5m || 0, token.buys5m || 0),
              sells5m: Math.max(existing.sells5m || 0, token.sells5m || 0),
              dexUrl: existing.dexUrl || token.dexUrl,
              pairAddress: existing.pairAddress || token.pairAddress,
            });
          }
        });

        candidates = [...merged.values()];
      } catch (error) {
        console.error("DexScreener discovery failed:", error);
        setErrors((prev) => [...prev, "DexScreener discovery failed."]);
      }

      if (!candidates.length) {
        throw new Error(
          "No candidates were discovered. Add a Birdeye key or try again.",
        );
      }

      // DEX enrichment is useful, but does not decide whether a token
      // enters the universe.
      candidates = await enrichWithDexScreener(candidates);

      const classified = candidates.map(classify).filter((token) => {
        if (safeNum(token.liquidity) < safeNum(settings.minLiquidity)) {
          return false;
        }

        // Discovery is intentionally inclusive:
        // keep tokens with either FAST momentum OR high holders.
        // We do not require an age bucket for FAST/HOLDERS views.
        return token.fast || token.holderHeavy;
      });

      const sortByResearchValue = (a, b) =>
        b.fastScore - a.fastScore ||
        safeNum(b.holders) - safeNum(a.holders) ||
        safeNum(b.volume5m) - safeNum(a.volume5m);

      const sortByHolders = (a, b) =>
        safeNum(b.holders) - safeNum(a.holders) || b.fastScore - a.fastScore;

      const sortByAgeThenMomentum = (a, b) =>
        safeNum(a.ageMinutes, Number.POSITIVE_INFINITY) -
          safeNum(b.ageMinutes, Number.POSITIVE_INFINITY) ||
        sortByResearchValue(a, b);

      // Age buckets contain everything relevant in that age range.
      // Cross-age tabs keep signal-based discovery separate.
      const next = {
        ALL: [...classified].sort(sortByResearchValue),
        FAST: classified.filter((x) => x.fast).sort(sortByResearchValue),
        HOLDERS: classified.filter((x) => x.holderHeavy).sort(sortByHolders),
        BOTH: classified
          .filter((x) => x.fast && x.holderHeavy)
          .sort(sortByResearchValue),
        "0-5m": classified
          .filter((x) => x.ageBucket === "0-5m")
          .sort(sortByAgeThenMomentum),
        "5-10m": classified
          .filter((x) => x.ageBucket === "5-10m")
          .sort(sortByAgeThenMomentum),
        "10-15m": classified
          .filter((x) => x.ageBucket === "10-15m")
          .sort(sortByAgeThenMomentum),
        "15-30m": classified
          .filter((x) => x.ageBucket === "15-30m")
          .sort(sortByAgeThenMomentum),
        "30-60m": classified
          .filter((x) => x.ageBucket === "30-60m")
          .sort(sortByAgeThenMomentum),
      };

      // Cap only after the full universe has been discovered/classified.
      Object.keys(next).forEach((key) => {
        next[key] = next[key].slice(0, Math.max(1, settings.maxResults));
      });

      setTokens(next);
      setLastScanned(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Scanning error:", error);
      setErrors((prev) => [...prev, error?.message || "Scanning failed."]);
      setTokens({
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
      early: tokens["5-10m"].length,
    }),
    [tokens],
  );

  return (
    <div className="min-h-screen bg-black text-white font-mono p-4 sm:p-6 max-w-6xl mx-auto selection:bg-neutral-800">
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
              Broad meme-token discovery • momentum + holder count
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full xl:w-auto">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 p-3 rounded-xl border border-neutral-800 transition-all"
            title="Configure scanner"
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
            <Key className="w-4 h-4" />
            BIRDEYE DISCOVERY
          </div>

          <div>
            <label className="block text-[10px] text-neutral-500 uppercase mb-2">
              Birdeye API Key
            </label>
            <input
              type="password"
              placeholder="Paste Birdeye API Key"
              value={birdeyeApiKey}
              onChange={(e) => setBirdeyeApiKey(e.target.value)}
              className="w-full bg-black border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-neutral-600"
            />
            <p className="text-[10px] text-neutral-600 mt-2">
              For production, put this behind your server/proxy instead of
              shipping it in browser code.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="text-[10px] text-neutral-500 uppercase">
              Min holders
              <input
                type="number"
                value={settings.minHolders}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minHolders: safeNum(e.target.value),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min 5m price gain %
              <input
                type="number"
                value={settings.minFastPrice5m}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minFastPrice5m: safeNum(e.target.value),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min 5m volume
              <input
                type="number"
                value={settings.minFastVolume5m}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minFastVolume5m: safeNum(e.target.value),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min liquidity
              <input
                type="number"
                value={settings.minLiquidity}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minLiquidity: safeNum(e.target.value),
                  }))
                }
                className="mt-2 w-full bg-black border border-neutral-800 rounded-lg p-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-neutral-500 uppercase">
              Min 5m transactions
              <input
                type="number"
                value={settings.minFastTxns5m}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minFastTxns5m: safeNum(e.target.value),
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

      {errors.length > 0 && (
        <div className="mb-5 bg-neutral-950 border border-amber-900/40 rounded-xl p-3 text-[11px] text-amber-300">
          {errors.map((error, index) => (
            <div key={index}>{error}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
            <Activity className="w-3.5 h-3.5" />
            Discovered
          </div>
          <p className="text-lg font-bold text-neutral-100 mt-1">
            {counts.all}
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
            <TrendingUp className="w-3.5 h-3.5" />
            Fast
          </div>
          <p className="text-lg font-bold text-emerald-400 mt-1">
            {counts.fast}
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
            <Users className="w-3.5 h-3.5" />
            Holders
          </div>
          <p className="text-lg font-bold text-sky-400 mt-1">
            {counts.holders}
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
            <Flame className="w-3.5 h-3.5" />
            Both
          </div>
          <p className="text-lg font-bold text-orange-400 mt-1">
            {counts.both}
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-900 rounded-xl p-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase">
            <Zap className="w-3.5 h-3.5" />
            Fresh 0–5m
          </div>
          <p className="text-lg font-bold text-violet-400 mt-1">
            {counts.fresh}
          </p>
        </div>
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
              className={`px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${
                activeTab === key
                  ? "bg-neutral-800 text-emerald-400 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {label} ({tokens[key]?.length || 0})
            </button>
          ))}
        </div>

        {lastScanned && (
          <span className="text-[11px] text-neutral-600 font-mono">
            LAST SCAN: <span className="text-neutral-400">{lastScanned}</span>
          </span>
        )}
      </div>

      <div className="space-y-3">
        {visibleTokens.length === 0 ? (
          <div className="border border-dashed border-neutral-900 rounded-2xl p-12 text-center bg-neutral-950/50">
            <Flame className="w-8 h-8 text-neutral-800 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">
              Hit “SCAN SOL” to build a broad candidate set, then inspect it by
              age, momentum, holder count, or the overlap between signals.
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

                    {token.category === "BOTH" && (
                      <span className="bg-orange-950/60 text-orange-300 border border-orange-900/50 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        FAST + HOLDERS
                      </span>
                    )}

                    {token.category === "FAST" && (
                      <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-900/50 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        FAST
                      </span>
                    )}

                    {token.category === "HOLDERS" && (
                      <span className="bg-sky-950/60 text-sky-300 border border-sky-900/50 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        HIGH HOLDERS
                      </span>
                    )}

                    {token.ageBucket && (
                      <span className="bg-neutral-900 text-neutral-400 border border-neutral-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {token.ageBucket}
                      </span>
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left xl:text-right">
                  <div>
                    <p className="text-[10px] uppercase text-neutral-500 font-bold">
                      Holders
                    </p>
                    <p className="text-sm font-bold text-sky-400">
                      {formatNumber(token.holders)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-neutral-500 font-bold">
                      5m Price
                    </p>
                    <p className="text-sm font-bold text-emerald-400">
                      {pct(token.priceChange5m)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-neutral-500 font-bold">
                      5m Volume
                    </p>
                    <p className="text-sm font-bold text-neutral-200">
                      {formatUsd(token.volume5m)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase text-neutral-500 font-bold">
                      Liquidity
                    </p>
                    <p className="text-sm font-bold text-neutral-300">
                      {formatUsd(token.liquidity)}
                    </p>
                  </div>
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
                      No indexed DEX pair
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
                  5m txns:{" "}
                  <span className="text-neutral-400">
                    {formatNumber(token.txns5m)}
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
                  Age:{" "}
                  <span className="text-neutral-400">
                    {token.ageMinutes === null
                      ? "unknown"
                      : `${token.ageMinutes.toFixed(1)}m`}
                  </span>
                </span>

                <span>
                  Momentum score:{" "}
                  <span className="text-neutral-400">
                    {safeNum(token.fastScore).toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-[10px] text-neutral-700 mt-6 leading-relaxed">
        Holder count is treated as a raw reported holder count for research
        purposes; this UI does not remove wallets based on whether they may be
        bots, snipers, bundlers, insiders, or ordinary users. Age buckets are
        separate from momentum filters, so a fast token can appear even when it
        is older than 5 minutes.
      </p>
    </div>
  );
}
