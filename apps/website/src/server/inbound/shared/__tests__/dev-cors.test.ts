import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";
import { applyDevCors } from "../dev-cors.js";

test("applyDevCors: adds headers for allowed localhost origin", () => {
  let middleware: ((req: Request, res: Response, next: () => void) => void) | undefined;
  const fakeApp = {
    use: (fn: (req: Request, res: Response, next: () => void) => void) => {
      middleware = fn;
    },
  } as unknown as Express;

  applyDevCors(fakeApp);
  assert.ok(middleware, "middleware was registered");

  const headers: Record<string, string> = {};
  const fakeRes = {
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    sendStatus: () => {
      assert.fail("sendStatus should not be called for non-OPTIONS");
    },
  } as unknown as Response;

  let nextCalled = false;
  const fakeReq = {
    method: "GET",
    headers: { origin: "http://localhost:3000" },
  } as unknown as Request;

  middleware!(fakeReq, fakeRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(headers["Vary"], "Origin");
  assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type");
  assert.equal(headers["Access-Control-Allow-Methods"], "GET,PUT,PATCH,OPTIONS");
});

test("applyDevCors: adds headers for allowed 127.0.0.1 origin", () => {
  let middleware: ((req: Request, res: Response, next: () => void) => void) | undefined;
  const fakeApp = {
    use: (fn: (req: Request, res: Response, next: () => void) => void) => {
      middleware = fn;
    },
  } as unknown as Express;

  applyDevCors(fakeApp);

  const headers: Record<string, string> = {};
  const fakeRes = {
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    sendStatus: () => {
      assert.fail("sendStatus should not be called for non-OPTIONS");
    },
  } as unknown as Response;

  let nextCalled = false;
  const fakeReq = {
    method: "POST",
    headers: { origin: "https://127.0.0.1:8080" },
  } as unknown as Request;

  middleware!(fakeReq, fakeRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(headers["Access-Control-Allow-Origin"], "https://127.0.0.1:8080");
});

test("applyDevCors: does not add headers for disallowed or missing origin", () => {
  let middleware: ((req: Request, res: Response, next: () => void) => void) | undefined;
  const fakeApp = {
    use: (fn: (req: Request, res: Response, next: () => void) => void) => {
      middleware = fn;
    },
  } as unknown as Express;

  applyDevCors(fakeApp);

  const disallowedOrigins = [
    undefined,
    "http://evil.com",
    "http://localhost",
    "http://not-localhost:3000",
  ];

  for (const origin of disallowedOrigins) {
    const headers: Record<string, string> = {};
    const fakeRes = {
      header: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;

    let nextCalled = false;
    const fakeReq = {
      method: "GET",
      headers: origin ? { origin } : {},
    } as unknown as Request;

    middleware!(fakeReq, fakeRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(Object.keys(headers).length, 0, `Headers should be empty for origin: ${origin}`);
  }
});

test("applyDevCors: handles OPTIONS preflight request with 204 status", () => {
  let middleware: ((req: Request, res: Response, next: () => void) => void) | undefined;
  const fakeApp = {
    use: (fn: (req: Request, res: Response, next: () => void) => void) => {
      middleware = fn;
    },
  } as unknown as Express;

  applyDevCors(fakeApp);

  let sentStatus: number | undefined;
  const fakeRes = {
    header: () => {},
    sendStatus: (code: number) => {
      sentStatus = code;
    },
  } as unknown as Response;

  let nextCalled = false;
  const fakeReq = {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173" },
  } as unknown as Request;

  middleware!(fakeReq, fakeRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() must not be called on OPTIONS");
  assert.equal(sentStatus, 204);
});
