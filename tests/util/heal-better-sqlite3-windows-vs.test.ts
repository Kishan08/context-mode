/**
 * heal-better-sqlite3.mjs — Windows VS 2026+ detection tests.
 *
 * node-gyp has a hardcoded internal-version→year map. VS 2026 (internal
 * major 18) was absent from older node-gyp builds, causing "unknown version"
 * failures on machines that only have VS 2026 installed.
 *
 * The fix queries vswhere's `displayName` property (e.g. "Visual Studio
 * Community 2026") and extracts the 4-digit year with a regex.
 * catalog_productLineVersion is NOT used because it returns the internal
 * major version ("18") on VS 2026 rather than the year string.
 *
 * detectWindowsVsYear() is dependency-injected so these tests run on any
 * host (macOS CI, Linux CI, Windows without VS) without spawning real processes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HEAL_SRC = readFileSync(
  resolve(import.meta.dirname, "../../scripts/heal-better-sqlite3.mjs"),
  "utf-8",
);

describe("heal-better-sqlite3.mjs — Windows VS year detection", () => {
  // ── Slice 1: detectWindowsVsYear() unit tests ──────────────────────

  it("exports detectWindowsVsYear() as a function", async () => {
    const mod = await import("../../scripts/heal-better-sqlite3.mjs");
    expect(typeof mod.detectWindowsVsYear).toBe("function");
  });

  it("returns null on non-Windows platforms", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    for (const platform of ["darwin", "linux", "freebsd"]) {
      expect(detectWindowsVsYear({ platform })).toBeNull();
    }
  });

  it("returns null when vswhere.exe is absent", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    const result = detectWindowsVsYear({
      platform: "win32",
      existsSync: () => false,
    });
    expect(result).toBeNull();
  });

  it("extracts year from vswhere displayName for VS 2026", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    const result = detectWindowsVsYear({
      platform: "win32",
      existsSync: () => true,
      exec: () => "Visual Studio Community 2026",
    });
    expect(result).toBe("2026");
  });

  it("works for all VS editions (Community, Professional, Enterprise)", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    for (const displayName of [
      "Visual Studio Community 2026",
      "Visual Studio Professional 2026",
      "Visual Studio Enterprise 2026",
    ]) {
      expect(detectWindowsVsYear({
        platform: "win32",
        existsSync: () => true,
        exec: () => displayName,
      })).toBe("2026");
    }
  });

  it("works for older VS versions (2017, 2019, 2022)", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    for (const [displayName, year] of [
      ["Visual Studio Community 2017", "2017"],
      ["Visual Studio Community 2019", "2019"],
      ["Visual Studio Community 2022", "2022"],
    ]) {
      expect(detectWindowsVsYear({
        platform: "win32",
        existsSync: () => true,
        exec: () => displayName,
      })).toBe(year);
    }
  });

  it("trims whitespace and CRLF from vswhere output before matching", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    const result = detectWindowsVsYear({
      platform: "win32",
      existsSync: () => true,
      exec: () => "  Visual Studio Community 2026\r\n",
    });
    expect(result).toBe("2026");
  });

  it("returns null when vswhere throws", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    const result = detectWindowsVsYear({
      platform: "win32",
      existsSync: () => true,
      exec: () => { throw new Error("vswhere failed"); },
    });
    expect(result).toBeNull();
  });

  it("returns null when vswhere returns a string with no 4-digit year", async () => {
    const { detectWindowsVsYear } = await import(
      "../../scripts/heal-better-sqlite3.mjs"
    );
    // e.g. catalog_productLineVersion returning "18" — the exact bug we fixed
    for (const bad of ["", "18", "unknown"]) {
      expect(detectWindowsVsYear({
        platform: "win32",
        existsSync: () => true,
        exec: () => bad,
      })).toBeNull();
    }
  });

  // ── Slice 2: source-code assertions on buildSafeEnv ───────────────

  it("uses displayName to get the year and extracts it with a regex", () => {
    // catalog_productLineVersion returns "18" on VS 2026 — not the year.
    // The implementation must use displayName and a /20\d{2}/ regex instead.
    expect(HEAL_SRC).toMatch(/-property displayName/);
    expect(HEAL_SRC).toMatch(/20\\d\{2\}/);
  });

  it("buildSafeEnv sets npm_config_msvs_version on Windows via vswhere", () => {
    expect(HEAL_SRC).toMatch(/npm_config_msvs_version/);
    expect(HEAL_SRC).toMatch(/vswhere/);
  });

  it("buildSafeEnv only sets npm_config_msvs_version when not already present", () => {
    // Respects user-set msvs_version in their npmrc.
    expect(HEAL_SRC).toMatch(/!\s*env\.npm_config_msvs_version/);
  });
});
