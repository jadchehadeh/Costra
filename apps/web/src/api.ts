export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  permissions: string[];
};
export type Project = {
  id: string;
  name: string;
  number: string;
  client: string;
  projectType?: string;
  location?: string;
  contractValue?: string;
  currency: string;
  startDate?: string;
  plannedCompletionDate?: string;
  status: string;
  description?: string;
  packages?: Array<{
    id?: string;
    name: string;
    active: boolean;
    displayOrder?: number;
  }>;
  trades?: Array<{
    id: string;
    name: string;
    active: boolean;
    displayOrder: number;
  }>;
};
const base = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
export const token = () => localStorage.getItem("costra_token");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token()
        ? { Authorization: `Bearer ${token()}` }
        : { ...options.headers }),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data?.error?.message || "Unable to complete this request.");
  return data;
}
