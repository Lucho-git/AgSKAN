import { getAllArticleSlugs } from '$lib/data/articleData.ts';

export const prerender = true;

export function entries() {
    const slugs = getAllArticleSlugs();
    return slugs.map(slug => ({ slug }));
}