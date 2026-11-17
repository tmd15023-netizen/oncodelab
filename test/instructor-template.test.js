import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

test("instructor template defaults to supplied HWP and admin replacement persists with attachment download", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const routes = new Map();
  let record;
  const requireAdmin = () => {};
  vm.runInNewContext(source.slice(source.indexOf("function publicInstructorSettings("), source.indexOf('app.post("/api/applications",')), {
    Buffer, path, requireAdmin,
    app: {
      get: (url, ...handlers) => routes.set(`GET ${url}`, handlers),
      put: (url, ...handlers) => routes.set(`PUT ${url}`, handlers),
    },
    col: () => ({ findOne: async () => record, updateOne: async (_query, update) => { record = { ...record, ...update.$set }; } }),
  });
  async function request(method, url, body = {}) {
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      set(key, value) { Object.assign(this.headers, typeof key === "string" ? { [key]: value } : key); return this; },
      json(body) { this.body = body; }, send(body) { this.body = body; },
    };
    await routes.get(`${method} ${url}`).at(-1)({ body }, res);
    return res;
  }
  const initial = await request("GET", "/api/instructor-template");
  assert.equal(initial.body.email, "oncodelab1@gmail.com");
  assert.equal(initial.body.downloadUrl, "/downloads/instructor-application.hwp");
  const original = fs.readFileSync(new URL("../downloads/instructor-application.hwp", import.meta.url));
  assert.equal(original.subarray(0, 8).toString("hex"), "d0cf11e0a1b11ae1");
  assert.equal(routes.get("PUT /api/admin/instructor-template")[0], requireAdmin);
  const payload = { email: "oncodelab1@gmail.com", fileName: "강사 카드.hwp", fileBase64: original.toString("base64") };
  assert.equal((await request("PUT", "/api/admin/instructor-template", payload)).statusCode, 200);
  const metadata = await request("GET", "/api/instructor-template");
  assert.equal(metadata.body.downloadUrl, "/api/instructor-template/download");
  assert.equal(metadata.body.fileBase64, undefined);
  const downloaded = await request("GET", "/api/instructor-template/download");
  assert.deepEqual(downloaded.body, original);
  assert.match(downloaded.headers["Content-Disposition"], /attachment;.*filename\*=UTF-8''/);
  for (const invalid of [{ fileName: "bad.html" }, { email: "invalid" }, { fileBase64: "bad" }, { fileBase64: Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64") }]) {
    assert.equal((await request("PUT", "/api/admin/instructor-template", { ...payload, ...invalid })).statusCode, 400);
  }
  assert.deepEqual((await request("GET", "/api/instructor-template/download")).body, original);
});

test("instructor basic details no longer require a career message", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  let handler;
  let saved;
  vm.runInNewContext(source.slice(source.indexOf('app.post("/api/applications",'), source.indexOf('app.get("/api/admin/applications",')), {
    app: { post: (_url, callback) => { handler = callback; } },
    instructorApplyPayload: (body) => ({ instructor: body }),
    validPhone: () => true, publicApplication: (item) => item,
    col: () => ({ insertOne: async (item) => { saved = item; } }),
  });
  await handler({ body: { kind: "instructor", name: "지원자", email: "test@example.com", phone: "01012345678" } }, { json() {} });
  assert.equal(saved.instructor.name, "지원자");
});
