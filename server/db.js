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
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("classes").createIndex({ id: 1 }, { unique: true });
  await db.collection("tests").createIndex({ id: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ token: 1 }, { unique: true });
  await db.collection("applications").createIndex({ id: 1 }, { unique: true });
  await db.collection("notices").createIndex({ id: 1 }, { unique: true });
  await db.collection("posts").createIndex({ id: 1 }, { unique: true });
  await db.collection("applyFields").createIndex({ id: 1 }, { unique: true });
  await seedIfEmpty();
  return db;
}

export function getDb() {
  if (!db) throw new Error("데이터베이스가 아직 연결되지 않았습니다.");
  return db;
}

async function seedIfEmpty() {
  if ((await db.collection("classes").countDocuments()) === 0) {
    await db.collection("classes").insertMany(DEFAULT_CLASSES);
  }
  if ((await db.collection("tests").countDocuments()) === 0) {
    await db.collection("tests").insertMany(DEFAULT_TESTS);
  }
  if ((await db.collection("notices").countDocuments()) === 0) {
    await db.collection("notices").insertMany(DEFAULT_NOTICES);
  }
  if ((await db.collection("posts").countDocuments()) === 0) {
    await db.collection("posts").insertMany(DEFAULT_POSTS);
  }
  if ((await db.collection("applyFields").countDocuments()) === 0) {
    await db.collection("applyFields").insertMany(DEFAULT_APPLY_FIELDS);
  }
}

export function publicUser(user) {
  return user ? { name: user.name, email: user.email, phone: user.phone || "", role: user.role || "user" } : null;
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
      }
    : { id: test.id, title: test.title, summary: test.summary };
}

export function publicClass({ id, label, tone, status, title, summary }) {
  return { id, label, tone, status, title, summary };
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
  };
}
