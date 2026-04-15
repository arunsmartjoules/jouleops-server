import type { SiteWithCoordinates } from "./repositories/attendanceRepository.ts";
import attendanceRepository from "./repositories/attendanceRepository.ts";

export type SiteDistanceRow = SiteWithCoordinates & {
  distance: number;
  distanceMeters: number;
  isWithinRange: boolean;
};

export function parseCoord(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export function computeSitesWithDistance(
  lat: number,
  lon: number,
  sites: SiteWithCoordinates[],
): SiteDistanceRow[] {
  return sites
    .map((s) => {
      if (!s.latitude || !s.longitude) return null;
      const slat = parseFloat(s.latitude);
      const slon = parseFloat(s.longitude);
      if (!Number.isFinite(slat) || !Number.isFinite(slon)) return null;
      const distance = attendanceRepository.calculateDistance(
        lat,
        lon,
        slat,
        slon,
      );
      const radius = s.radius || 200;
      return {
        ...s,
        distance,
        distanceMeters: Math.round(distance),
        isWithinRange: distance <= radius,
      } as SiteDistanceRow;
    })
    .filter((x): x is SiteDistanceRow => x !== null)
    .sort((a, b) => a.distance - b.distance);
}

export function pickResolvedInRangeSite(
  ranked: SiteDistanceRow[],
): SiteDistanceRow | null {
  const inRange = ranked.filter((s) => s.isWithinRange);
  return inRange[0] ?? null;
}

export function toNearestSitePayload(s: SiteDistanceRow | null | undefined) {
  if (!s) return null;
  return {
    site_code: s.site_code,
    name: s.name,
    address: s.address,
    city: s.city,
    state: s.state,
    latitude: s.latitude,
    longitude: s.longitude,
    radius: s.radius || 200,
    distance: s.distanceMeters,
    distanceMeters: s.distanceMeters,
    isWithinRange: s.isWithinRange,
  };
}
