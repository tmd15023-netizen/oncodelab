import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("member search sorts complete results before pagination without changing stored order", () => {
  const source = fs.readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
  const sort = vm.runInNewContext(source.slice(source.indexOf("function sortedAdminMembers("), source.indexOf("function adminUsersPanel(")) + "sortedAdminMembers;");
  const members = [
    { name: "홍길동", createdAt: "2026-11-01" },
    { name: "김민수", createdAt: "2025-01-01" },
    { name: "박영희", createdAt: "2026-03-01" },
    { name: "김민정", createdAt: null },
  ];
  assert.equal(sort(members, "", "newest")[0].name, "홍길동");
  assert.equal(sort(members, "", "oldest")[0].name, "김민수");
  assert.equal(sort(members, "", "name")[0].name, "김민수");
  assert.equal(sort(members, " 김 민 ", "newest").length, 2);
  assert.equal(sort(members, "없는이름", "name").length, 0);
  assert.equal(sort(members, "", "oldest").at(-1).name, "김민정");
  assert.equal(members[0].name, "홍길동");
});
