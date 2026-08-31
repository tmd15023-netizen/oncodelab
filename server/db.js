import "dotenv/config";
import dns from "node:dns";
import { MongoClient } from "mongodb";
import { DEFAULT_CLASSES, DEFAULT_TESTS, DEFAULT_NOTICES, DEFAULT_POSTS, DEFAULT_APPLY_FIELDS } from "./defaults.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI가 .env에 없습니다.");
}

if (uri.includes("여기비밀번호") || uri.includes("<db_password>")) {
  throw new Error(".env의 비밀번호 자리를 실제 비밀번호로 바꿔 주세요.");
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 20000,
});

let db;

export async function connectDb() {
  if (db) return db;
  await client.connect();
  db = client.db("oncodelab");
  // Run index creation (idempotent) and the seed check in parallel batches
  // instead of 13 sequential round-trips — on a cold serverless start this
  // was the single biggest source of added latency per request.
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("classes").createIndex({ id: 1 }, { unique: true }),
    db.collection("tests").createIndex({ id: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ token: 1 }, { unique: true }),
    db.collection("applications").createIndex({ id: 1 }, { unique: true }),
    db.collection("notices").createIndex({ id: 1 }, { unique: true }),
    db.collection("posts").createIndex({ id: 1 }, { unique: true }),
    db.collection("applyFields").createIndex({ id: 1 }, { unique: true }),
  ]);
  await seedIfEmpty();
  return db;
}

export function getDb() {
  if (!db) throw new Error("데이터베이스가 아직 연결되지 않았습니다.");
  return db;
}

// Runs once ever, not once per cold start: without the _meta flag, deleting every
// row in e.g. "posts" down to zero would make the next serverless cold start see
// countDocuments() === 0 and silently re-insert the sample defaults, undoing an
// admin's intentional "delete all" every time the function restarts.
async function seedIfEmpty() {
  const meta = await db.collection("_meta").findOne({ _id: "seed" });
  if (meta?.done) return;
  const [classes, tests, notices, posts, applyFields] = await Promise.all([
    db.collection("classes").countDocuments(),
    db.collection("tests").countDocuments(),
    db.collection("notices").countDocuments(),
    db.collection("posts").countDocuments(),
    db.collection("applyFields").countDocuments(),
  ]);
  await Promise.all([
    classes === 0 ? db.collection("classes").insertMany(DEFAULT_CLASSES) : null,
    tests === 0 ? db.collection("tests").insertMany(DEFAULT_TESTS) : null,
    notices === 0 ? db.collection("notices").insertMany(DEFAULT_NOTICES) : null,
    posts === 0 ? db.collection("posts").insertMany(DEFAULT_POSTS) : null,
    applyFields === 0 ? db.collection("applyFields").insertMany(DEFAULT_APPLY_FIELDS) : null,
  ]);
  await db.collection("_meta").updateOne({ _id: "seed" }, { $set: { done: true, at: new Date() } }, { upsert: true });
}

export function publicUser(user) {
  return user ? { name: user.name, email: user.email, phone: user.phone || "", role: user.role || "user", createdAt: user.createdAt || null } : null;
}

export function publicTest(test, { includeSecret = false } = {}) {
  if (!test) return null;
  return includeSecret
    ? {
        id: test.id,
        title: test.title,
        summary: test.summary,
        password: test.password,
        body: test.body,
        linkUrl: test.linkUrl || "",
        fileUrl: test.fileUrl || "",
        fileName: test.fileName || "",
        unlockCount: test.unlockCount || 0,
      }
    : { id: test.id, title: test.title, summary: test.summary };
}

export function publicClass(cls, { includeSecret = false } = {}) {
  if (!cls) return null;
  const base = {
    id: cls.id,
    label: cls.label,
    tone: cls.tone,
    status: cls.status,
    title: cls.title,
    summary: cls.summary,
    posterUrl: cls.posterUrl || "",
  };
  return includeSecret
    ? { ...base, linkUrl: cls.linkUrl || "", fileUrl: cls.fileUrl || "", fileName: cls.fileName || "", password: cls.password || "" }
    : base;
}

export function publicNotice({ id, tag, title, body, createdAt }) {
  return { id, tag, title, body, createdAt };
}

export function publicPost({ id, tag, name, title, body, createdAt }) {
  return { id, tag, name: name || "", title, body, createdAt };
}

export function publicApplyField({ id, label, type, required, options, order }) {
  return { id, label, type, required: Boolean(required), options: options || [], order };
}

export function publicApplication(item) {
  if (!item) return null;
  return {
    id: item.id,
    type: item.type,
    values: item.values || {},
    note: item.note || "",
    status: item.status || "pending",
    createdAt: item.createdAt,
    viewedAt: item.viewedAt || null,
  };
}
