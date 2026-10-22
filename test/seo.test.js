import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const config = JSON.parse(read("vercel.json"));

test("every sitemap URL has one matching canonical and is not redirected", () => {
  const urls = [...read("sitemap.xml").matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]));
  for (const url of urls) {
    const html = read(url.pathname === "/" ? "index.html" : `${url.pathname.slice(1)}.html`);
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
    assert.equal(canonicals.length, 1, url.href);
    assert.equal(canonicals[0][1], url.href);
    assert.equal(config.redirects.some((redirect) => redirect.source === url.pathname), false);
  }
});

test("legacy page redirects have terminal destinations and leave verification files alone", () => {
  for (const redirect of config.redirects) {
    assert.equal(redirect.permanent, true);
    assert.equal(config.redirects.some((other) => other.source === redirect.destination), false);
    assert.ok(fs.existsSync(new URL(redirect.destination === "/" ? "index.html" : `${redirect.destination.slice(1)}.html`, root)));
  }
  assert.equal(config.redirects.find((redirect) => redirect.source === "/index").destination, "/");
  for (const file of fs.readdirSync(root).filter((name) => /^(google|naver).*\.html$/.test(name))) {
    assert.equal(config.redirects.some((redirect) => redirect.source === `/${file}`), false);
  }
});

test("internal homepage links use the canonical root", () => {
  for (const file of [...fs.readdirSync(root).filter((name) => name.endsWith(".html")), "js/main.js"]) {
    assert.equal(read(file).includes('href="index"'), false, file);
  }
});
