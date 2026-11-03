import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../server/db.js", import.meta.url), "utf8");
const connectionSource = source.slice(source.indexOf("let db;"), source.indexOf("export function publicUser"))
  .replaceAll("export ", "");

test("concurrent requests share initialization and failed initialization can retry", async () => {
  let connects = 0;
  let indexes = 0;
  let fail = true;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const database = {
    collection: () => ({
      createIndex: async () => {
        indexes++;
        await gate;
        if (fail) throw new Error("temporary failure");
      },
      findOne: async () => ({ done: true }),
    }),
  };
  const context = vm.createContext({ client: {
    connect: async () => { connects++; },
    db: () => database,
  } });
  vm.runInContext(connectionSource, context);
  const first = vm.runInContext("connectDb()", context);
  const second = vm.runInContext("connectDb()", context);
  const failed = Promise.all([assert.rejects(first, /temporary failure/), assert.rejects(second, /temporary failure/)]);
  assert.throws(() => vm.runInContext("getDb()", context), /아직 연결/);
  release();
  await failed;
  assert.equal(connects, 1);
  assert.equal(indexes, 8);
  fail = false;
  const results = await Promise.all([
    vm.runInContext("connectDb()", context),
    vm.runInContext("connectDb()", context),
  ]);
  assert.ok(results.every((result) => result === database));
  assert.equal(connects, 2);
  assert.equal(indexes, 16);
  assert.equal(vm.runInContext("getDb()", context), database);
  await vm.runInContext("connectDb()", context);
  assert.equal(connects, 2);
});
