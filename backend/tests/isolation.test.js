import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";
import Transaction from "../src/models/transaction.model.js";
import Budget from "../src/models/budget.model.js";
import Category from "../src/models/category.model.js";

const register = (agent, username, email) =>
  agent.post("/api/auth/register").send({ username, email, password: "secret123" });

describe("cross-user data isolation", () => {
  it("keeps transaction, category, budget, and analytics data scoped to each user", async () => {
    const userA = request.agent(app);
    const userB = request.agent(app);
    expect((await register(userA, "User A", "a@example.com")).status).toBe(201);
    expect((await register(userB, "User B", "b@example.com")).status).toBe(201);

    const categoryResponse = await userA.post("/api/categories").send({
      name: "Isolation Meals", type: "expense", color: "#123456",
    });
    expect(categoryResponse.status).toBe(201);
    const categoryId = categoryResponse.body.category._id;
    const transactionResponse = await userA.post("/api/transactions").send({
      type: "expense", amount: 250.75, category: categoryId,
      date: "2026-10-12T12:00:00.000Z", note: "A private lunch", paymentMethod: "upi",
    });
    expect(transactionResponse.status).toBe(201);
    const transactionId = transactionResponse.body.transaction._id;
    const budgetResponse = await userA.post("/api/budgets").send({
      category: categoryId, month: "2026-10", limit: 1000,
    });
    expect(budgetResponse.status).toBe(201);
    const budgetId = budgetResponse.body.budget._id;

    for (const response of [
      await userB.get(`/api/transactions/${transactionId}`),
      await userB.put(`/api/transactions/${transactionId}`).send({ note: "changed" }),
      await userB.delete(`/api/transactions/${transactionId}`),
      await userB.put(`/api/budgets/${budgetId}`).send({ limit: 1 }),
      await userB.delete(`/api/budgets/${budgetId}`),
      await userB.put(`/api/categories/${categoryId}`).send({ name: "Stolen" }),
      await userB.delete(`/api/categories/${categoryId}`),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    }

    const foreignCategoryTransaction = await userB.post("/api/transactions").send({
      type: "expense", amount: 10, category: categoryId,
    });
    expect(foreignCategoryTransaction.status).toBe(400);

    const [transactions, categories, budgets, summary, byCategory, daily, trend, topExpenses] = await Promise.all([
      userB.get("/api/transactions"),
      userB.get("/api/categories"),
      userB.get("/api/budgets?month=2026-10"),
      userB.get("/api/analytics/summary?month=2026-10"),
      userB.get("/api/analytics/by-category?month=2026-10&type=expense"),
      userB.get("/api/analytics/daily?month=2026-10&type=expense"),
      userB.get("/api/analytics/monthly-trend?months=2"),
      userB.get("/api/analytics/top-expenses?month=2026-10"),
    ]);
    expect(transactions.body.transactions).toHaveLength(0);
    expect(categories.body.categories.some((c) => c._id === categoryId)).toBe(false);
    expect(budgets.body.budgets).toHaveLength(0);
    expect(summary.body.expense).toBe(0);
    expect(byCategory.body.categories).toHaveLength(0);
    expect(daily.body.total).toBe(0);
    expect(daily.body.days.reduce((sum, day) => sum + day.count, 0)).toBe(0);
    expect(trend.body.trend.every((month) => month.expense === 0)).toBe(true);
    expect(topExpenses.body.expenses).toHaveLength(0);
    for (const response of [transactions, categories, budgets, summary, byCategory, daily, trend, topExpenses]) {
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain("A private lunch");
      expect(JSON.stringify(response.body)).not.toContain(categoryId);
    }

    expect(await Transaction.countDocuments({ _id: transactionId })).toBe(1);
    expect(await Category.countDocuments({ _id: categoryId })).toBe(1);
    expect(await Budget.countDocuments({ _id: budgetId })).toBe(1);
    const unchanged = await userA.get(`/api/transactions/${transactionId}`);
    expect(unchanged.body.transaction.note).toBe("A private lunch");
    expect(unchanged.body.transaction.amount).toBe(250.75);
    expect((await userA.get(`/api/categories`)).body.categories.some((c) => c._id === categoryId)).toBe(true);
    expect((await userA.get("/api/budgets?month=2026-10")).body.budgets).toHaveLength(1);
  });
});
