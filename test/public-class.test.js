import assert from "node:assert/strict";
import test from "node:test";
import { publicClass } from "../server/db.js";

test("embedded class posters are returned as individual image URLs", () => {
  const result = publicClass({ id: "class-one", title: "Class", posterUrl: "data:image/png;base64,AAAA" });
  assert.equal(result.posterUrl, "/api/classes/class-one/poster");
  assert.equal(JSON.stringify(result).includes("base64"), false);
});

test("external poster URLs and missing posters are preserved", () => {
  assert.equal(publicClass({ id: "external", posterUrl: "https://example.com/poster.png" }).posterUrl, "https://example.com/poster.png");
  assert.equal(publicClass({ id: "empty" }).posterUrl, "");
});
