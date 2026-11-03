import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { publicClass, publicTest, publicNotice } from "../server/db.js";

test("home data skips account and private collections even with an admin token", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  let handler;
  const collections = [];
  const context = {
    app: { get: (_path, fn) => { handler = fn; } },
    userFromReq: () => { throw new Error("Home must not load accounts"); },
    isAdmin: () => false,
    publicClass, publicTest, publicNotice,
    publicPost: () => { throw new Error("Home must not load posts"); },
    publicApplyField: () => { throw new Error("Home must not load fields"); },
    publicUser: () => { throw new Error("Home must not load users"); },
    publicApplication: () => { throw new Error("Home must not load applications"); },
    publicPopup: () => null, classListProjection: {}, sortClasses: (items) => items,
    homePageCache: { body: null, at: 0 },
    col: (name) => {
      collections.push(name);
      const cursor = { sort: () => cursor, toArray: async () => [] };
      return { aggregate: () => cursor, find: () => cursor, findOne: async () => null };
    },
  };
  const start = source.indexOf('app.get("/api/site-data"');
  const end = source.indexOf('app.get("/api/classes/:id/poster"', start);
  vm.runInNewContext(source.slice(start, end), context);
  const headers = {};
  let body;
  await handler({ query: { view: "home" }, headers: { authorization: "Bearer admin" } }, {
    set: (key, value) => { headers[key] = value; }, json: (value) => { body = value; },
  });
  assert.deepEqual(collections.sort(), ["classes", "notices", "popupSettings", "tests"]);
  assert.equal(body.users, null);
  assert.equal(body.applications, null);
  assert.match(headers["Cache-Control"], /public.*s-maxage=300/);
});

test("admin bootstrap is a dedicated view and public site-data omits member lists", async () => {
  const source = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  let handler;
  const collections = [];
  const context = {
    app: { get: (_path, fn) => { handler = fn; } },
    userFromReq: async () => ({ role: "admin" }),
    isAdmin: () => true,
    publicClass, publicTest, publicNotice,
    publicPost: () => ({ id: "post" }),
    publicApplyField: () => ({ id: "field" }),
    publicUser: (user) => user,
    publicApplication: (item) => item,
    publicPopup: () => null, classListProjection: {}, sortClasses: (items) => items,
    homePageCache: { body: null, at: 0 },
    col: (name) => {
      collections.push(name);
      const cursor = { project() { return cursor; }, sort: () => cursor, toArray: async () => [] };
      return { aggregate: () => cursor, find: () => cursor, findOne: async () => null };
    },
  };
  const start = source.indexOf('app.get("/api/site-data"');
  const end = source.indexOf('app.get("/api/classes/:id/poster"', start);
  vm.runInNewContext(source.slice(start, end), context);
  await handler({ query: { view: "admin" }, headers: { authorization: "Bearer admin" } }, {
    set() {}, json() {},
  });
  assert.equal(collections.includes("users"), false);
  assert.equal(collections.includes("applications"), false);
});

test("homepage loads independently of personal application requests", async () => {
  const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: () => ({}) }, console,
    localStorage: { setItem() {}, getItem() { return null; } },
    sessionStorage: { setItem() {}, getItem() { return null; } },
    api: async (path) => {
      requests.push(path);
      return { classes: [{ id: "class" }], tests: [], notices: [], popup: null };
    },
  });
  vm.runInContext(`let classCache, testCache, noticeCache, popupCache;\n` +
    source.slice(source.indexOf("function applyHomeData"), source.indexOf("// Intentionally in-memory")), context);
  await vm.runInContext("loadSiteData()", context);
  assert.deepEqual(requests, ["/api/site-data?view=home"]);
  assert.equal(vm.runInContext("classCache[0].id", context), "class");
});

test("homepage uses compressed heroes, subset font, and no live list polling", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(html, /pretendard-dynamic-subset/);
  assert.match(html, /__oncodelabHomeRequest/);
  assert.match(html, /hero1\.webp/);
  assert.match(js, /hero\$\{n\}\.webp/);
  assert.match(js, /isNarrowViewport\(\)/);
  assert.match(js, /HOME_REVIEW_PAGE_SIZE_MOBILE/);
  assert.match(js, /is-fallback-open/);
  assert.match(js, /finally \{[\s\S]*showHomePopup\(\)/);
  assert.equal(js.includes("showPageLoading"), false);
  assert.match(js, /cache: fetchCacheMode/);
  assert.match(js, /writeHomeCache/);
  assert.match(js, /homeDataBoot/);
  const watchers = js.slice(js.indexOf("const watchers = ["), js.indexOf("].filter((watcher)"));
  assert.equal(watchers.includes("home-class-preview"), false);
});

test("home popup stays visible when showModal is unavailable", () => {
  const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const appended = [];
  const classNames = new Set();
  const dialog = {
    className: "",
    open: false,
    setAttribute(name, value) { if (name === "open") this.open = true; this[name] = value; },
    addEventListener() {},
    before(node) { appended.push(node); },
    remove() {},
    showModal() { throw new Error("not allowed"); },
    classList: {
      add(name) { classNames.add(name); },
      contains(name) { return classNames.has(name); },
    },
  };
  const context = vm.createContext({
    document: {
      body: { classList: { contains: () => true }, append(node) { appended.push(node); }, style: {} },
      createElement: (tag) => (tag === "dialog" ? dialog : { className: "", addEventListener() {} }),
      activeElement: null,
    },
    localStorage: { getItem: () => null, setItem() {} },
    homePopupShown: false,
    popupCache: { enabled: true, imageUrl: "/api/popup/image?v=1", title: "안내" },
    escapeHtml: (value) => String(value),
    assetUrl: (value) => value,
    popupHref: (url) => String(url || "").trim() || "/class",
    readJson: () => null,
  });
  vm.runInContext(source.slice(source.indexOf("function showHomePopup"), source.indexOf("function adminChangeItems")), context);
  vm.runInContext("showHomePopup()", context);
  assert.equal(classNames.has("is-fallback-open"), true);
  assert.equal(appended.includes(dialog), true);
  assert.match(dialog.innerHTML, /href="\/class"/);
});

test("popup poster links fall back to the class apply list", () => {
  const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf("function popupHref"), source.indexOf("async function loadSiteData")), context);
  assert.equal(vm.runInContext("popupHref('')", context), "/class");
  assert.equal(vm.runInContext("popupHref('class-detail?id=one')", context), "/class-detail?id=one");
  assert.equal(vm.runInContext("popupHref('/contact')", context), "/contact");
});

test("homepage blog reviews fetch the latest feed only", async () => {
  const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: (id) => (id === "home-reviews" ? {} : null) },
    console,
    api: async (path) => {
      requests.push(path);
      return [];
    },
  });
  vm.runInContext(
    `let blogReviewCache = [];\n` +
      source.slice(source.indexOf("let blogReviewsFull = false;"), source.indexOf("let homeReviewSearch")),
    context,
  );
  await vm.runInContext("loadBlogReviews()", context);
  assert.deepEqual(requests, ["/api/blog-reviews?latest=1"]);
});
