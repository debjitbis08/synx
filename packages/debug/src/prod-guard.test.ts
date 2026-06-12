import { describe, it, expect, vi, afterEach } from "vitest";
import { warnIfProduction } from "./prod-guard";

describe("warnIfProduction", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete (globalThis as { __SYNX_DEBUG_ALLOW_PROD__?: boolean })
      .__SYNX_DEBUG_ALLOW_PROD__;
    vi.restoreAllMocks();
  });

  it("warns when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfProduction();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("dev/test-only");
  });

  it("does not warn outside production", () => {
    process.env.NODE_ENV = "test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfProduction();
    expect(warn).not.toHaveBeenCalled();
  });

  it("can be silenced with __SYNX_DEBUG_ALLOW_PROD__", () => {
    process.env.NODE_ENV = "production";
    (globalThis as { __SYNX_DEBUG_ALLOW_PROD__?: boolean })
      .__SYNX_DEBUG_ALLOW_PROD__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfProduction();
    expect(warn).not.toHaveBeenCalled();
  });
});
