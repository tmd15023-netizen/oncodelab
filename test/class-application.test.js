import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("class submissions are idempotent across concurrent requests and existing applications", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const records = new Map();
  let handler;
  const context = {
    crypto,
    app: { post: (_path, callback) => { handler = callback; } },
    userFromReq: async () => ({ email: "test@example.com", phone: "01012345678", name: "Test" }),
    applyPayload: (body) => ({ id: crypto.randomUUID(), type: body.type, classId: body.classId, values: {} }),
    publicApplication: (item) => item,
    unwrap: (doc) => (doc?.id || doc?.email || doc?._id ? doc : doc?.value || null),
    col: (name) => name === "applyFields" ? { find: () => ({ sort: () => ({ toArray: async () => [] }) }) }
      : name === "classes" ? { findOne: async () => ({ id: "course-1", title: "Course" }) }
      : {
        find: () => ({ toArray: async () => { throw new Error("class apply must not scan all applications"); } }),
        findOneAndUpdate: async (query, update) => {
          if (!records.has(query._id)) records.set(query._id, update.$setOnInsert);
          return records.get(query._id);
        },
        findOne: async (query) => records.get(query._id),
      },
  };
  vm.runInNewContext(source.slice(source.indexOf('app.post("/api/applications",'), source.indexOf('app.get("/api/admin/applications",')), context);
  const request = async () => {
    let result;
    await handler({ body: { kind: "class", type: "Course", classId: "course-1" } }, { json: (item) => { result = item; } });
    return result;
  };
  const results = await Promise.all(Array.from({ length: 30 }, request));
  assert.equal(records.size, 1);
  assert.equal(new Set(results.map((item) => item.id)).size, 1);
  assert.equal((await request()).id, results[0].id);
  assert.equal(records.size, 1);
  assert.equal(source.includes(".find({ $or: [{ classId: cls.id }, { type: cls.title }] }).toArray()"), false);
});
