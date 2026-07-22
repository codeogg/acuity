// Admin districts dictionary — HK area options for clinic.district_id.

import { api } from "../client";

export interface DistrictOut {
  id: number;
  name_zh: string;
  name_en: string | null;
  region: string | null;
}

export interface DistrictCreate {
  name_zh: string;
  name_en?: string | null;
  region?: string | null;
}

export interface DistrictUpdate {
  name_zh?: string | null;
  name_en?: string | null;
  region?: string | null;
}

export function listDistricts(region?: string): Promise<DistrictOut[]> {
  return api.get<DistrictOut[]>("/admin/districts", {
    query: region ? { region } : undefined,
  });
}

export function getDistrict(districtId: number): Promise<DistrictOut> {
  return api.get<DistrictOut>(`/admin/districts/${districtId}`);
}

export function createDistrict(body: DistrictCreate): Promise<DistrictOut> {
  return api.post<DistrictOut>("/admin/districts", body);
}

export function updateDistrict(districtId: number, body: DistrictUpdate): Promise<DistrictOut> {
  return api.put<DistrictOut>(`/admin/districts/${districtId}`, body);
}

export function deleteDistrict(districtId: number): Promise<void> {
  return api.delete<void>(`/admin/districts/${districtId}`);
}
