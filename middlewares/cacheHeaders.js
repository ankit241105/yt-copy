const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getCacheConfig = () => {
  return {
    publicFeedCacheS: toNumber(process.env.PUBLIC_FEED_CACHE_S, 60),
    publicDetailCacheS: toNumber(process.env.PUBLIC_DETAIL_CACHE_S, 300),
    publicSearchCacheS: toNumber(process.env.PUBLIC_SEARCH_CACHE_S, 30),
    staleWhileRevalidateS: toNumber(process.env.PUBLIC_STALE_WHILE_REVALIDATE_S, 120),
  };
};

const setPublicCache = (res, seconds, staleWhileRevalidateS) => {
  res.set(
    "Cache-Control",
    `public, max-age=${seconds}, stale-while-revalidate=${staleWhileRevalidateS}`
  );
  res.set("Vary", "Accept-Encoding");
};

export const cachePublicFeed = (_req, res, next) => {
  const { publicFeedCacheS, staleWhileRevalidateS } = getCacheConfig();
  setPublicCache(res, publicFeedCacheS, staleWhileRevalidateS);
  next();
};

export const cachePublicSearch = (_req, res, next) => {
  const { publicSearchCacheS, staleWhileRevalidateS } = getCacheConfig();
  setPublicCache(res, publicSearchCacheS, staleWhileRevalidateS);
  next();
};

export const cachePublicDetail = (_req, res, next) => {
  const { publicDetailCacheS, staleWhileRevalidateS } = getCacheConfig();
  setPublicCache(res, publicDetailCacheS, staleWhileRevalidateS);
  next();
};
