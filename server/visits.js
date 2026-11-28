const SITE_HOSTS = new Set(["www.oncodelab.co.kr", "oncodelab.co.kr", "localhost", "127.0.0.1"]);
const VISITOR_ID = /^[a-zA-Z0-9_-]{16,64}$/;
const BOT_UA = /bot\b|crawl|spider|slurp|headless|lighthouse|wget|curl|python-requests|facebookexternalhit|yeti\/|inspectiontool|adsbot|semrush|ahrefs|petalbot|bytespider/i;

export function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isSiteOrigin(origin) {
  try {
    const url = new URL(String(origin || ""));
    return (url.protocol === "https:" || url.protocol === "http:") && SITE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isCountableVisitor(visitorId, userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua || BOT_UA.test(ua)) return false;
  return VISITOR_ID.test(String(visitorId || ""));
}

export async function readVisitStats(collections, now = new Date()) {
  const date = kstDateKey(now);
  const stats = await collections.visitStats.findOne({ _id: "stats" });
  return {
    date,
    today: Number(stats?.days?.[date] || 0),
    total: Number(stats?.total || 0),
  };
}

// One browser counts once per Seoul calendar day. The total keeps every day.
export async function recordVisit(collections, { visitorId, userAgent, now = new Date() } = {}) {
  const date = kstDateKey(now);
  if (isCountableVisitor(visitorId, userAgent)) {
    try {
      const inserted = await collections.visitKeys.updateOne(
        { _id: `${date}:${visitorId}` },
        { $setOnInsert: { date, createdAt: now } },
        { upsert: true },
      );
      if (inserted.upsertedCount === 1) {
        await collections.visitStats.updateOne(
          { _id: "stats" },
          { $inc: { total: 1, [`days.${date}`]: 1 } },
          { upsert: true },
        );
      }
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return readVisitStats(collections, now);
}
