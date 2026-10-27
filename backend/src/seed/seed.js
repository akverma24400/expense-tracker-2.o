import "dotenv/config";
import "../utils/dnsOverride.js";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Category from "../models/category.model.js";
import Transaction from "../models/transaction.model.js";
import defaultCategories from "../utils/defaultCategories.js";

const EMAIL = "rahul@test.com"; // seed data for this user
const PASSWORD = process.env.SEED_PASSWORD || "LocalSeedPassword123!";
const COUNT = 5000;
const METHODS = ["cash", "upi", "card", "bank_transfer", "other"];
const NOTES = ["Lunch", "Groceries", "Uber ride", "Movie", "Electricity bill", "Coffee", "Recharge"];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];

const run = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed while NODE_ENV is production.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const databaseName = mongoose.connection.name;
  console.log(`Database: ${databaseName}`);
  console.log(`Seed user: ${EMAIL}`);

  let user = await User.findOne({ email: EMAIL });
  const createdUser = !user;
  if (!user) {
    user = await User.create({
      username: "Rahul Seed",
      email: EMAIL,
      password: PASSWORD,
    });
  }

  const categories = await Category.find({ user: user._id });
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");
  const missingTypes = [];
  if (!expenseCats.length) missingTypes.push("expense");
  if (!incomeCats.length) missingTypes.push("income");
  if (missingTypes.length) {
    const defaults = defaultCategories
      .filter((category) => missingTypes.includes(category.type))
      .map((category) => ({ ...category, user: user._id }));
    await Category.insertMany(defaults);
  }

  console.log(createdUser ? "Created seed user." : "Reused existing seed user.");
  console.log(missingTypes.length ? `Created default ${missingTypes.join(" and ")} categories.` : "Reused existing income and expense categories.");

  const availableCategories = await Category.find({ user: user._id });
  const availableExpenseCats = availableCategories.filter((c) => c.type === "expense");
  const availableIncomeCats = availableCategories.filter((c) => c.type === "income");

  // --reset removes this user's existing transactions first
  if (process.argv.includes("--reset")) {
    const del = await Transaction.deleteMany({ user: user._id });
    console.log(`Deleted ${del.deletedCount} old transactions`);
  }

  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;

  const docs = Array.from({ length: COUNT }, () => {
    const isIncome = Math.random() < 0.1; // about 10% income
    const category = pick(isIncome ? availableIncomeCats : availableExpenseCats);
    const rupees = isIncome ? rand(20000, 80000) : rand(50, 5000);
    return {
      user: user._id,
      type: isIncome ? "income" : "expense",
      amount: rupees * 100, // stored in paise
      category: category._id,
      date: new Date(now - Math.random() * yearMs),
      note: pick(NOTES),
      paymentMethod: pick(METHODS),
    };
  });

  await Transaction.insertMany(docs);
  await Transaction.syncIndexes();
  console.log(`Inserted ${docs.length} transactions`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
