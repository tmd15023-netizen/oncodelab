import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function classApplicationClosed(status) {
  return String(status || "").split("·").map((part) => part.trim()).some((part) => /마감(?!임박)/.test(part) || /종료|종강/.test(part));
}

test("class submissions are idempotent across concurrent requests and existing applications", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const records = new Map();
  let handler;
  const context = {
    crypto,
    classApplicationClosed,
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

test("closed and ended classes cannot be applied to", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const helpers = js.slice(js.indexOf("function classStatusTokens"), js.indexOf("function renderHomePreviews"));
  const list = js.slice(js.indexOf("function renderClassPage"), js.indexOf("function renderClassDetailPage"));
  const apply = js.slice(js.indexOf("function renderClassAttendanceApply"), js.indexOf("async function submitClassApply"));
  const client = vm.createContext({});
  vm.runInContext(helpers, client);
  assert.equal(client.classApplicationClosed("온라인 · 진행중"), false);
  assert.equal(client.classApplicationClosed("마감임박"), false);
  assert.equal(client.classApplicationClosed("마감"), true);
  assert.equal(client.classApplicationClosed("종료"), true);
  assert.equal(client.classApplicationClosed("온라인 · 마감 · 종료"), true);
  assert.match(list, /classApplicationClosed\(item\.status\)/);
  assert.match(list, /class-program-action is-closed/);
  assert.match(apply, /classApplicationClosed\(cls\?\.status\)/);
  assert.match(apply, /button\.disabled = true/);

  let handler;
  let inserted = false;
  vm.runInNewContext(source.slice(source.indexOf('app.post("/api/applications",'), source.indexOf('app.get("/api/admin/applications",')), {
    crypto,
    classApplicationClosed,
    app: { post: (_path, callback) => { handler = callback; } },
    userFromReq: async () => ({ email: "test@example.com", phone: "01012345678", name: "Test" }),
    applyPayload: () => { throw new Error("closed class must not create an application"); },
    publicApplication: (item) => item,
    col: (name) => name === "applyFields" ? { find: () => ({ sort: () => ({ toArray: async () => [] }) }) }
      : name === "classes" ? { findOne: async () => ({ id: "course-1", title: "Course", status: "마감 · 종료" }) }
      : { findOne: async () => null, findOneAndUpdate: async () => { inserted = true; } },
  });
  let statusCode;
  let error;
  await handler({ body: { kind: "class", type: "Course", classId: "course-1" } }, {
    status(code) { statusCode = code; return this; },
    json(body) { error = body.error; },
  });
  assert.equal(statusCode, 400);
  assert.match(error, /마감되었거나 종료된/);
  assert.equal(inserted, false);
});
