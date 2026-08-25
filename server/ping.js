import { connectDb } from "./db.js";

try {
  const db = await connectDb();
  await db.command({ ping: 1 });
  console.log("MongoDB 연결 성공");
  process.exit(0);
} catch (error) {
  console.error("MongoDB 연결 실패");
  console.error(error.message);
  process.exit(1);
}
