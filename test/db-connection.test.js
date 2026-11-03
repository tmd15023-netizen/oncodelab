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
  const database = {
    collection: () => ({
      createIndex: async () => { indexes++; },
      findOne: async () => ({ done: true }),
    }),
  };
  const context = vm.createContext({
    console: { error() {} },
    client: {
      connect: async () => {
        connects++;
        if (fail) throw new Error("temporary failure");
      },
      db: () => database,
    },
  });
  vm.runInContext(connectionSource, context);
  await Promise.all([
    assert.rejects(vm.runInContext("connectDb()", context), /temporary failure/),
    assert.rejects(vm.runInContext("connectDb()", context), /temporary failure/),
  ]);
  assert.equal(connects, 1);
  assert.throws(() => vm.runInContext("getDb()", context), /아직 연결/);
  fail = false;
  const results = await Promise.all([
    vm.runInContext("connectDb()", context),
    vm.runInContext("connectDb()", context),
  ]);
  assert.ok(results.every((result) => result === database));
  assert.equal(connects, 2);
  assert.equal(vm.runInContext("getDb()", context), database);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(indexes, 9);
  await vm.runInContext("connectDb()", context);
  assert.equal(connects, 2);
});
