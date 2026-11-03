import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
test("admin bootstrap opens the shell then loads member lists separately", async () => {
  const requests = [];
  const context = {
    location: { hostname: "www.oncodelab.co.kr" },
    document: { getElementById: (id) => id === "admin" ? {} : null },
    token: () => "test-token", getSession: () => ({ role: "admin" }), isAdmin: () => true,
    setTimeout, clearTimeout, console, AbortSignal: { timeout: () => undefined },
    fetch: async (url) => {
      requests.push(url.replace(/^https:\/\/www\.oncodelab\.co\.kr/, ""));
      if (url.includes("/api/admin/users") || url.includes("/api/admin/applications")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => ({ classes: [], tests: [], notices: [], posts: [], applyFields: [] }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf("let classCache")) + `
    let classCache, testCache, noticeCache, postCache, applyFieldCache, userCache, applyCache,
      popupCache, myApplyAccess, myClassApplications, adminDataState, adminListsState, adminDataError;
  ` + source.slice(source.indexOf("function fetchCacheMode"), source.indexOf("// Intentionally in-memory")), context);
  await vm.runInContext("loadSiteData()", context);
  assert.deepEqual(requests, ["/api/site-data?view=admin", "/api/admin/users", "/api/admin/applications"]);
  assert.equal(vm.runInContext("adminDataState", context), "ready");
  assert.equal(vm.runInContext("adminListsState", context), "ready");
  assert.equal(vm.runInContext("userCache.length + applyCache.length", context), 0);
});

test("apex pages send admin authentication directly to canonical API and recover private lists", async () => {
  const requests = [];
  const context = {
    location: { hostname: "oncodelab.co.kr" },
    document: { getElementById: (id) => id === "admin" ? {} : null },
    token: () => "test-token", getSession: () => ({ role: "admin" }), isAdmin: () => true,
    setTimeout, clearTimeout, console, AbortSignal: { timeout: () => undefined },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const data = url.includes("/admin/users")
        ? [{ email: "test@example.com" }]
        : url.includes("/admin/applications")
          ? [{ id: "existing-application" }]
          : { classes: [], tests: [], notices: [], posts: [], applyFields: [] };
      return { ok: true, json: async () => data };
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf("let classCache")) + `
    let classCache, testCache, noticeCache, postCache, applyFieldCache, userCache, applyCache,
      popupCache, myApplyAccess, myClassApplications, adminDataState, adminListsState, adminDataError;
  ` + source.slice(source.indexOf("function fetchCacheMode"), source.indexOf("// Intentionally in-memory")), context);
  await vm.runInContext("loadSiteData()", context);
  assert.equal(vm.runInContext("adminDataState", context), "ready");
  assert.equal(vm.runInContext("userCache.length", context), 1);
  assert.equal(vm.runInContext("applyCache.length", context), 1);
  for (const { url, options } of requests) {
    assert.ok(url.startsWith("https://www.oncodelab.co.kr/api/"));
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.cache, "no-store");
  }
  context.fetch = async () => ({ ok: false, json: async () => ({ error: "인증 만료" }) });
  await vm.runInContext("loadSiteData()", context);
  assert.equal(vm.runInContext("adminDataState", context), "error");
  assert.equal(vm.runInContext("userCache.length", context), 1);
});
