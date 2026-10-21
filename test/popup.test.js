import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

// Exercise the real route handlers with an isolated store, never production data.
function fixture() {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const routes = new Map();
  let record = null;
  const requireAdmin = () => {};
  const context = {
    crypto, Buffer, requireAdmin,
    app: {
      put: (path, ...handlers) => routes.set(`PUT ${path}`, handlers),
      get: (path, ...handlers) => routes.set(`GET ${path}`, handlers),
    },
    col: (name) => {
      assert.equal(name, "popupSettings");
      return {
        findOne: async () => record && { ...record },
        updateOne: async (query, update) => { record = { ...record, ...query, ...update.$set }; },
      };
    },
  };
  vm.runInNewContext(source.slice(source.indexOf("function publicPopup("), source.indexOf('app.get("/api/site-data"')), context);
  async function request(method, path, body = {}) {
    const handlers = routes.get(`${method} ${path}`);
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      set(headers) { this.headers = headers; return this; },
      json(value) { this.body = value; },
      send(value) { this.body = value; },
      end() {},
    };
    await handlers.at(-1)({ body }, res);
    return res;
  }
  return { request, routes, requireAdmin };
}

test("popup upload, metadata, disable and image replacement preserve stored image", async () => {
  const app = fixture();
  assert.equal(app.routes.get("PUT /api/admin/popup")[0], app.requireAdmin);
  const imageDataUrl = "data:image/png;base64,aGVsbG8=";
  const saved = await app.request("PUT", "/api/admin/popup", { title: "안내", enabled: true, imageDataUrl, linkUrl: "/class" });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.enabled, true);
  assert.equal(JSON.stringify(saved.body).includes("base64"), false);
  assert.match(saved.body.imageUrl, /^\/api\/popup\/image\?v=/);
  const image = await app.request("GET", "/api/popup/image");
  assert.equal(image.body.toString(), "hello");
  const disabled = await app.request("PUT", "/api/admin/popup", { enabled: false });
  assert.equal(disabled.body.enabled, false);
  assert.equal(disabled.body.imageUrl, saved.body.imageUrl);
  const replaced = await app.request("PUT", "/api/admin/popup", { enabled: true, imageDataUrl });
  assert.notEqual(replaced.body.imageUrl, saved.body.imageUrl);
});

test("popup rejects activation without image, unsafe URLs, SVG and oversized data", async () => {
  const app = fixture();
  assert.equal((await app.request("GET", "/api/popup/image")).statusCode, 404);
  for (const body of [
    { enabled: true },
    { linkUrl: "javascript:alert(1)" },
    { linkUrl: "//example.com" },
    { imageDataUrl: "data:image/svg+xml;base64,aGVsbG8=" },
    { imageDataUrl: `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")}` },
  ]) assert.equal((await app.request("PUT", "/api/admin/popup", body)).statusCode, 400);
});
