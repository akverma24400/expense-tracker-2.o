import "dotenv/config";
import "../utils/dnsOverride.js";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Transaction from "../models/transaction.model.js";
import { monthRange, shiftMonth, currentMonth } from "../utils/dateRange.js";

// follow the plan tree and list its stages, e.g. FETCH -> IXSCAN(user_1_date_-1)
const stages = (p) =>
  p
    ? [
        p.stage + (p.indexName ? `(${p.indexName})` : ""),
        ...(p.inputStage ? stages(p.inputStage) : []),
        ...(p.inputStages || []).flatMap(stages),
      ]
    : [];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const measure = async (buildQuery) => {
  const times = [];
  let stats;
  let planStages;

  for (let i = 0; i < 5; i += 1) {
    const plan = await buildQuery().explain("executionStats");
    stats = plan.executionStats;
    const winning = plan.queryPlanner.winningPlan;
    planStages = stages(winning.queryPlan || winning);
    if (i > 0) times.push(stats.executionTimeMillis);
  }

  return { stats, planStages, medianTime: median(times) };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email: "rahul@test.com" });
  if (!user) {
    console.error("Seed user rahul@test.com not found. Run `npm run seed` first.");
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const month = process.argv[2] || shiftMonth(currentMonth(), -1);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must be YYYY-MM");
  }
  const { start, end } = monthRange(month);
  console.log(`Month: ${month}`);

  const [collectionTotal, userTotal] = await Promise.all([
    Transaction.countDocuments({}),
    Transaction.countDocuments({ user: user._id }),
  ]);
  console.log(`Transactions in collection: ${collectionTotal}`);
  console.log(`Transactions for ${user.email}: ${userTotal}`);

  const buildQuery = (useBaseline) => {
    const query = Transaction.find({
      user: user._id,
      date: { $gte: start, $lt: end },
    });
    return useBaseline ? query.hint({ $natural: 1 }) : query;
  };
  const indexed = await measure(() => buildQuery(false));
  const collectionScan = await measure(() => buildQuery(true));

  if (!indexed.planStages.some((stage) => stage.includes("IXSCAN"))) {
    console.warn("WARNING: Indexed query plan does not contain IXSCAN.");
  }
  if (!collectionScan.planStages.some((stage) => stage.includes("COLLSCAN"))) {
    console.warn("WARNING: Baseline query plan does not contain COLLSCAN.");
  }

  for (const [label, result] of [["Indexed", indexed], ["Collection scan", collectionScan]]) {
    console.log(`${label}:`);
    console.log("  Winning plan stages:", result.planStages.join(" -> "));
    console.log("  nReturned:", result.stats.nReturned);
    console.log("  totalKeysExamined:", result.stats.totalKeysExamined);
    console.log("  totalDocsExamined:", result.stats.totalDocsExamined);
    console.log("  Median executionTimeMillis (4 measured runs):", result.medianTime);
  }
  console.log(
    `Indexed: ${indexed.stats.totalDocsExamined} docs examined / ${indexed.medianTime} ms vs collection scan: ${collectionScan.stats.totalDocsExamined} docs examined / ${collectionScan.medianTime} ms`
  );

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
