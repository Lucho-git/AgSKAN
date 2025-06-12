import { getAllCategorySlugs } from '$lib/data/articleData.ts';

export const prerender = true;

export function entries() {
    const categorySlugs = getAllCategorySlugs();
    return categorySlugs.map(categorySlug => ({ categorySlug }));
}