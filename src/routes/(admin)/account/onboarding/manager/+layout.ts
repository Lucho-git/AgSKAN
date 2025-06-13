// src/routes/(admin)/account/onboarding/manager/+layout.ts
import type { LayoutLoad } from './$types'

export const load: LayoutLoad = async ({ parent }) => {
    // Temporarily disable auth guards for testing
    // const { session, profile } = await parent()

    // if (!session) {
    //   throw redirect(302, '/login')
    // }

    return {
        steps: [
            { id: 'profile', label: 'Farm Details' },
            { id: 'survey', label: 'Survey' },
            { id: 'map-setup', label: 'Map Setup' }
        ]
    }
}