import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";

describe("authentication and validation", () => {
  it("rejects protected requests without a session", async () => {
    const response = await request(app).get("/api/transactions");
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("sets an httpOnly cookie on login and never returns a password", async () => {
    const agent = request.agent(app);
    const registration = await agent.post("/api/auth/register").send({
      username: "Auth User", email: "auth@example.com", password: "secret123",
    });
    expect(registration.status).toBe(201);
    const login = await agent.post("/api/auth/login").send({ email: "auth@example.com", password: "secret123" });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"].join(";")).toMatch(/(?:^|;\s*)token=/);
    expect(login.headers["set-cookie"].join(";")).toMatch(/HttpOnly/i);
    const me = await agent.get("/api/auth/me");
    for (const response of [registration, login, me]) {
      expect(JSON.stringify(response.body)).not.toMatch(/"password"\s*:/i);
    }
  });

  it("returns Zod validation errors for invalid bodies", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: "x", email: "bad", password: "1",
    });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });
});
