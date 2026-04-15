/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  parseCoord,
  computeSitesWithDistance,
  pickResolvedInRangeSite,
} from "./geofenceUtils.ts";

describe("parseCoord", () => {
  test("accepts zero latitude", () => {
    expect(parseCoord(0)).toBe(0);
  });
  test("rejects empty string", () => {
    expect(parseCoord("")).toBe(null);
  });
  test("parses string number", () => {
    expect(parseCoord("12.5")).toBe(12.5);
  });
});

describe("computeSitesWithDistance", () => {
  test("marks same coordinates as in range", () => {
    const lat = 12.9716;
    const lon = 77.5946;
    const sites = [
      {
        site_code: "S1",
        name: "On point",
        latitude: String(lat),
        longitude: String(lon),
        radius: 50,
      },
    ];
    const ranked = computeSitesWithDistance(lat, lon, sites);
    expect(ranked.length).toBe(1);
    expect(ranked[0]!.isWithinRange).toBe(true);
    expect(pickResolvedInRangeSite(ranked)?.site_code).toBe("S1");
  });

  test("picks closest among multiple in-range sites", () => {
    const lat = 12.9716;
    const lon = 77.5946;
    const sites = [
      {
        site_code: "FAR",
        name: "Far",
        latitude: String(lat + 0.002),
        longitude: String(lon),
        radius: 500,
      },
      {
        site_code: "NEAR",
        name: "Near",
        latitude: String(lat + 0.0001),
        longitude: String(lon),
        radius: 500,
      },
    ];
    const ranked = computeSitesWithDistance(lat, lon, sites);
    const picked = pickResolvedInRangeSite(ranked);
    expect(picked?.site_code).toBe("NEAR");
  });
});
