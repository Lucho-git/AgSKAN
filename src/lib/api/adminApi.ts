import { supabase } from '$lib/supabaseClient';

export interface AdminMapEntry {
    owner_id: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    company_name: string | null;
    owner_last_sign_in: string | null;
    owner_created_at: string | null;

    master_map_id: string;
    map_name: string | null;
    map_created_at: string;

    subscription: string;
    subscription_status: string;
    allowed_seats: number;
    payment_interval: string | null;
    next_billing_date: string | null;
    founder: boolean;

    connected_vehicles: number;
    total_members: number;
    seats_over_limit: number;
    seat_status: 'EXCEEDING' | 'AT_LIMIT' | 'OK';

    latest_vehicle_update: string | null;
    vehicles_active_24h: number;
    vehicles_active_7d: number;
    vehicles_active_30d: number;

    latest_member_sign_in: string | null;
    members_active_7d: number;
    members_active_30d: number;

    members: {
        id: string;
        full_name: string | null;
        email: string | null;
        last_sign_in: string | null;
        last_location_update: string | null;
        is_owner: boolean;
    }[];
}

export const adminApi = {
    async fetchDashboardData(): Promise<{ success: boolean; data: AdminMapEntry[]; error?: string }> {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session) {
                return { success: false, data: [], error: 'Not logged in' };
            }

            const { data, error } = await supabase.rpc('admin_dashboard_query');

            if (error) {
                console.error('Admin dashboard RPC error:', error);
                return { success: false, data: [], error: error.message };
            }

            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Admin dashboard fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },
};
