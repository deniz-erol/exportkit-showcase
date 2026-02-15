/**
 * Graceful Shutdown Unit Tests (OBS-05)
 *
 * Tests the shutdown orchestration logic:
 * - Successful cleanup exits with code 0
 * - Timeout expiry triggers force-close and exits with code 1
 * - Double-shutdown prevention (second call is ignored)
 * - Cleanup errors exit with code 1
 * - onForceClose callback is invoked on timeout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the logger to avoid side effects
vi.mock("../logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { createShutdownHandler } from "../graceful-shutdown.js";

describe("createShutdownHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exits with code 0 when cleanup succeeds", async () => {
    const exitMock = vi.fn();
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 5000,
      cleanup,
      exit: exitMock,
    });

    await shutdown("SIGTERM");

    expect(cleanup).toHaveBeenCalledOnce();
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it("exits with code 1 when cleanup throws", async () => {
    const exitMock = vi.fn();
    const cleanup = vi.fn().mockRejectedValue(new Error("cleanup failed"));

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 5000,
      cleanup,
      exit: exitMock,
    });

    await shutdown("SIGTERM");

    expect(cleanup).toHaveBeenCalledOnce();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("exits with code 1 and calls onForceClose when timeout expires", async () => {
    const exitMock = vi.fn();
    const onForceClose = vi.fn();

    // Cleanup that never resolves — simulates a hung process
    const cleanup = vi.fn().mockReturnValue(new Promise(() => {}));

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 5000,
      cleanup,
      onForceClose,
      exit: exitMock,
    });

    // Start shutdown but don't await (it will never resolve)
    const shutdownPromise = shutdown("SIGTERM");

    // Cleanup was called but hasn't resolved
    expect(cleanup).toHaveBeenCalledOnce();
    expect(exitMock).not.toHaveBeenCalled();

    // Advance past the timeout
    vi.advanceTimersByTime(5001);

    expect(onForceClose).toHaveBeenCalledOnce();
    expect(exitMock).toHaveBeenCalledWith(1);

    // Clean up the dangling promise to avoid unhandled rejection
    shutdownPromise.catch(() => {});
  });

  it("does not call onForceClose when cleanup succeeds before timeout", async () => {
    const exitMock = vi.fn();
    const onForceClose = vi.fn();
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 5000,
      cleanup,
      onForceClose,
      exit: exitMock,
    });

    await shutdown("SIGTERM");

    // Advance timers to ensure the force timer was cleared
    vi.advanceTimersByTime(10000);

    expect(onForceClose).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledOnce();
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it("prevents double-shutdown — second call is ignored", async () => {
    const exitMock = vi.fn();
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 5000,
      cleanup,
      exit: exitMock,
    });

    await shutdown("SIGTERM");
    await shutdown("SIGINT");

    // Cleanup should only be called once
    expect(cleanup).toHaveBeenCalledOnce();
    expect(exitMock).toHaveBeenCalledOnce();
  });

  it("works without onForceClose callback", async () => {
    const exitMock = vi.fn();

    // Cleanup that never resolves
    const cleanup = vi.fn().mockReturnValue(new Promise(() => {}));

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 3000,
      cleanup,
      exit: exitMock,
    });

    const shutdownPromise = shutdown("SIGTERM");

    vi.advanceTimersByTime(3001);

    // Should still force-exit even without onForceClose
    expect(exitMock).toHaveBeenCalledWith(1);

    shutdownPromise.catch(() => {});
  });

  it("uses the correct timeout duration", async () => {
    const exitMock = vi.fn();
    const cleanup = vi.fn().mockReturnValue(new Promise(() => {}));

    const shutdown = createShutdownHandler({
      processName: "Test",
      timeoutMs: 10000,
      cleanup,
      exit: exitMock,
    });

    const shutdownPromise = shutdown("SIGTERM");

    // Should NOT have exited at 9999ms
    vi.advanceTimersByTime(9999);
    expect(exitMock).not.toHaveBeenCalled();

    // Should exit at 10000ms
    vi.advanceTimersByTime(2);
    expect(exitMock).toHaveBeenCalledWith(1);

    shutdownPromise.catch(() => {});
  });
});
