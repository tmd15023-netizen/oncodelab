import assert from "node:assert/strict";
import test from "node:test";
import { publicClass } from "../server/db.js";

test("embedded class posters are returned as individual image URLs", () => {
  const result = publicClass({ id: "class-one", title: "Class", posterUrl: "data:image/png;base64,AAAA" });
  assert.equal(result.posterUrl, "/api/classes/class-one/poster?v=1");
  assert.equal(JSON.stringify(result).includes("base64"), false);
});

test("external poster URLs and missing posters are preserved", () => {
  assert.equal(publicClass({ id: "external", posterUrl: "https://example.com/poster.png" }).posterUrl, "https://example.com/poster.png");
  assert.equal(publicClass({ id: "empty" }).posterUrl, "");
});

test("class edits keep the stored poster when the form sends the image endpoint", async () => {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function isKeptPosterReference");
  const end = source.indexOf("function classPayload");
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext("isKeptPosterReference('/api/classes/class-one/poster?v=1', 'class-one')", context), true);
  assert.equal(vm.runInContext("isKeptPosterReference('https://www.oncodelab.co.kr/api/classes/class-one/poster?v=ab12', 'class-one')", context), true);
  assert.equal(vm.runInContext("isKeptPosterReference('data:image/png;base64,AAAA', 'class-one')", context), false);
  assert.equal(vm.runInContext("isKeptPosterReference('https://example.com/poster.png', 'class-one')", context), false);
});
