import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";
import Transaction from "../src/models/transaction.model.js";

describe("money precision", () => {
  it("stores integer paise and returns rupees without floating point sum errors", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({
      username: "Money User", email: "money@example.com", password: "secret123",
    }).expect(201);
    const category = (await agent.post("/api/categories").send({
      name: "Money Meals", type: "expense",
    }).expect(201)).body.category;

    const response = await agent.post("/api/transactions").send({
      type: "expense", amount: 250.75, category: category._id,
      date: "2026-10-10T12:00:00.000Z",
    }).expect(201);
    expect(await Transaction.findById(response.body.transaction._id).lean()).toMatchObject({ amount: 25075 });
    expect(response.body.transaction.amount).toBe(250.75);

    for (const amount of [0.1, 0.2]) {
      await agent.post("/api/transactions").send({
        type: "expense", amount, category: category._id,
        date: "2026-10-11T12:00:00.000Z",
      }).expect(201);
    }
    const summary = await agent.get("/api/analytics/summary?month=2026-10").expect(200);
    expect(summary.body.expense).toBe(251.05);

    const centsAgent = request.agent(app);
    await centsAgent.post("/api/auth/register").send({
      username: "Cents User", email: "cents@example.com", password: "secret123",
    }).expect(201);
    const centsCategory = (await centsAgent.post("/api/categories").send({
      name: "Cents Meals", type: "expense",
    }).expect(201)).body.category;
    for (const amount of [0.1, 0.2]) {
      await centsAgent.post("/api/transactions").send({
        type: "expense", amount, category: centsCategory._id,
        date: "2026-10-11T12:00:00.000Z",
      }).expect(201);
    }
    const centsSummary = await centsAgent.get("/api/analytics/summary?month=2026-10").expect(200);
    expect(centsSummary.body.expense).toBe(0.3);
  });
});
