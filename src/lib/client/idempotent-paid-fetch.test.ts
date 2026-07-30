import { beforeEach, describe, expect, it, vi } from "vitest";

import { acknowledgePaidResponse, idempotentPaidFetch } from "./idempotent-paid-fetch";

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("idempotentPaidFetch", () => {
  it("reuses one caller key after an ambiguous transport failure", async () => {
    const headers: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.reject(new Error("connection reset"));
        })
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.resolve(new Response("{}", { status: 200 }));
        }),
    );

    await expect(
      idempotentPaidFetch("/api/paid", { method: "POST", body: '{"same":true}' }),
    ).rejects.toThrow("connection reset");
    const response = await idempotentPaidFetch("/api/paid", {
      method: "POST",
      body: '{"same":true}',
    });
    acknowledgePaidResponse(response);

    expect(headers[0]).toBe(headers[1]);
  });

  it("keeps the same key until a successful response is explicitly acknowledged", async () => {
    const headers: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        headers.push(new Headers(init.headers).get("Idempotency-Key")!);
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );

    const first = await idempotentPaidFetch("/api/paid", { method: "POST" });
    await idempotentPaidFetch("/api/paid", { method: "POST" });
    expect(headers[0]).toBe(headers[1]);

    acknowledgePaidResponse(first);
    await idempotentPaidFetch("/api/paid", { method: "POST" });
    expect(headers[2]).not.toBe(headers[1]);
  });

  it("retains an ambiguous operation key across a module reload", async () => {
    let firstKey = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        firstKey = new Headers(init.headers).get("Idempotency-Key")!;
        return Promise.reject(new Error("connection reset"));
      }),
    );
    await expect(idempotentPaidFetch("/api/reload", { method: "POST" })).rejects.toThrow();

    vi.resetModules();
    const reloaded = await import("./idempotent-paid-fetch");
    let secondKey = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init: RequestInit) => {
        secondKey = new Headers(init.headers).get("Idempotency-Key")!;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );
    const response = await reloaded.idempotentPaidFetch("/api/reload", { method: "POST" });
    reloaded.acknowledgePaidResponse(response);

    expect(secondKey).toBe(firstKey);
  });

  it("retains the key when a proxy returns an ambiguous 503", async () => {
    const headers: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.resolve(new Response("upstream unavailable", { status: 503 }));
        })
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.resolve(new Response("{}", { status: 200 }));
        }),
    );

    await idempotentPaidFetch("/api/proxy", { method: "POST" });
    const recovered = await idempotentPaidFetch("/api/proxy", { method: "POST" });
    acknowledgePaidResponse(recovered);

    expect(headers[1]).toBe(headers[0]);
  });

  it("retains the original key through a retry-time 429 after transport ambiguity", async () => {
    const headers: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.reject(new Error("connection reset"));
        })
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.resolve(new Response("rate limited", { status: 429 }));
        })
        .mockImplementationOnce((_url, init: RequestInit) => {
          headers.push(new Headers(init.headers).get("Idempotency-Key")!);
          return Promise.resolve(new Response("{}", { status: 200 }));
        }),
    );

    await expect(idempotentPaidFetch("/api/retry", { method: "POST" })).rejects.toThrow();
    await idempotentPaidFetch("/api/retry", { method: "POST" });
    const recovered = await idempotentPaidFetch("/api/retry", { method: "POST" });
    acknowledgePaidResponse(recovered);

    expect(new Set(headers).size).toBe(1);
  });
});
