import assert from "node:assert/strict";
import test from "node:test";
import { isCountableVisitor, isSiteOrigin, kstDateKey, readVisitStats, recordVisit } from "../server/visits.js";

function collection() {
  const docs = new Map();
  return {
    async findOne(filter) {
      return docs.get(filter._id) || null;
    },
    async updateOne(filter, update, options = {}) {
      let doc = docs.get(filter._id);
      let upsertedCount = 0;
      if (!doc) {
        if (!options.upsert) return { upsertedCount: 0, matchedCount: 0 };
        doc = { _id: filter._id, ...(update.$setOnInsert || {}) };
        docs.set(filter._id, doc);
        upsertedCount = 1;
      }
      for (const [path, amount] of Object.entries(update.$inc || {})) {
        const parts = path.split(".");
        let cursor = doc;
        for (let i = 0; i < parts.length - 1; i += 1) {
          if (!cursor[parts[i]] || typeof cursor[parts[i]] !== "object") cursor[parts[i]] = {};
          cursor = cursor[parts[i]];
        }
        const leaf = parts[parts.length - 1];
        cursor[leaf] = Number(cursor[leaf] || 0) + amount;
      }
      return { upsertedCount, matchedCount: upsertedCount ? 0 : 1 };
    },
  };
}

const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const visitorA = "a".repeat(32);
const visitorB = "b".repeat(32);

function db() {
  return { visitStats: collection(), visitKeys: collection() };
}

test("Seoul calendar date rolls at midnight KST", () => {
  assert.equal(kstDateKey(new Date("2026-11-27T14:30:00Z")), "2026-11-27");
  assert.equal(kstDateKey(new Date("2026-11-27T15:30:00Z")), "2026-11-28");
});

test("only a real browser on the site origin can be counted", () => {
  assert.equal(isSiteOrigin("https://www.oncodelab.co.kr"), true);
  assert.equal(isSiteOrigin("http://127.0.0.1:3000"), true);
  assert.equal(isSiteOrigin("https://example.com"), false);
  assert.equal(isSiteOrigin(""), false);
  assert.equal(isCountableVisitor(visitorA, browser), true);
  assert.equal(isCountableVisitor(visitorA, "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)"), false);
  assert.equal(isCountableVisitor("short", browser), false);
});

test("the same browser counts once per day and the total keeps growing", async () => {
  const collections = db();
  const morning = new Date("2026-11-27T01:00:00Z");
  const evening = new Date("2026-11-27T10:00:00Z");
  const nextDay = new Date("2026-11-28T01:00:00Z");

  const first = await recordVisit(collections, { visitorId: visitorA, userAgent: browser, now: morning });
  const repeat = await recordVisit(collections, { visitorId: visitorA, userAgent: browser, now: evening });
  const another = await recordVisit(collections, { visitorId: visitorB, userAgent: browser, now: evening });
  const later = await recordVisit(collections, { visitorId: visitorA, userAgent: browser, now: nextDay });
  const bot = await recordVisit(collections, { visitorId: "c".repeat(32), userAgent: "Googlebot/2.1", now: nextDay });

  assert.deepEqual(first, { date: "2026-11-27", today: 1, total: 1 });
  assert.deepEqual(repeat, { date: "2026-11-27", today: 1, total: 1 });
  assert.deepEqual(another, { date: "2026-11-27", today: 2, total: 2 });
  assert.deepEqual(later, { date: "2026-11-28", today: 1, total: 3 });
  assert.deepEqual(bot, { date: "2026-11-28", today: 1, total: 3 });
  assert.deepEqual(await readVisitStats(collections, nextDay), later);
});
