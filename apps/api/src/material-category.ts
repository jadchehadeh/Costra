export function isMaterialCategory(category: { name: string; code?: string | null }) {
  const name = category.name.trim().toLowerCase().replace(/[^a-z]/g, "");
  return name === "material" || name === "materials" || category.code?.trim().toUpperCase() === "MAT";
}

export const materialCategoryWhere = {
  OR: [
    { code: { equals: "MAT", mode: "insensitive" as const } },
    { name: { equals: "Material", mode: "insensitive" as const } },
    { name: { equals: "Materials", mode: "insensitive" as const } },
  ],
};
