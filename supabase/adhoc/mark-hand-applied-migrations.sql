-- Record the hand-applied migrations in the project's migration history.
--
-- These 68 migrations were run by hand in the SQL editor, so prod has
-- their changes but supabase_migrations.schema_migrations has no row for them.
-- Without these rows `supabase db push` would try to apply them again.
--
-- Same effect as `supabase migration repair --status applied <versions>`.
-- Run once against prod (SQL editor or scripts/supabase-sql-runner.ps1).
-- Safe to re-run: existing rows are left alone.

insert into supabase_migrations.schema_migrations (version, name, statements)
select v.version, v.name, '{}'::text[]
from (values
    ('20260325160534', 'add_farm_name_to_fields'),
    ('20260414000000', 'add_gps_settings'),
    ('20260414134943', 'add_gps_interval_and_split_popups'),
    ('20260529000000', 'add_layer_visibility_settings'),
    ('20260530000000', 'add_marker_note_visibility_setting'),
    ('20260603000000', 'add_join_code_to_maps'),
    ('20260608000000', 'add_profile_activity'),
    ('20260616000000', 'add_short_urls'),
    ('20260617000000', 'add_auto_confirm_markers'),
    ('20260618000000', 'add_map_settings'),
    ('20260618000001', 'disable_zoom_on_quickdrop'),
    ('20260624000000', 'admin_user_settings_rls'),
    ('20260716060055', 'add_trails_indexes_and_cleanup'),
    ('20260716060056', 'optimize_spray_records_spatial'),
    ('20260723093015', 'add_operator_and_vehicle_to_trails'),
    ('20260723093016', 'add_vehicle_marker_to_records'),
    ('20260723093017', 'fix_backfill_trail_as_master'),
    ('20260723093018', 'generate_agworld_records'),
    ('20260812000000', 'add_show_bins_always'),
    ('20260812000001', 'add_show_vehicles_always'),
    ('20260812000002', 'show_vehicles_always_default_on'),
    ('20260812085753', 'add_marker_photo_storage_policies'),
    ('20260812085754', 'add_overlay_marker_menu_setting'),
    ('20260812094920', 'add_marker_drawings_realtime'),
    ('20260813000000', 'add_marker_style_setting'),
    ('20260813000001', 'add_style_default_border_colors'),
    ('20260813000002', 'add_style_default_colors'),
    ('20260814000000', 'add_selection_ring_color'),
    ('20260817000000', 'add_icon_glass_opacity'),
    ('20260817000001', 'add_marker_default_colors'),
    ('20260817000002', 'add_selection_animation'),
    ('20260817000003', 'make_custom_default_colour_mode'),
    ('20260820000000', 'default_on_map_panels_and_no_touchhold_zoom'),
    ('20260820000001', 'marker_onboarding_done'),
    ('20260820000002', 'marker_onboarding_skips'),
    ('20260820000003', 'single_base_default_colour'),
    ('20260828000000', 'default_circle_fill_black'),
    ('20260828000001', 'marker_usage_tracking'),
    ('20260911082148', 'add_map_invites_and_viewer_role'),
    ('20260911082149', 'add_invite_viewer_role_link'),
    ('20260911082150', 'add_guest_rejoin_finalize'),
    ('20260911082151', 'add_map_log_paging_index'),
    ('20260914042648', 'add_invite_retain_on_signup'),
    ('20260918045425', 'add_admin_member_role'),
    ('20260918045426', 'add_profiles_realtime_and_retire_self'),
    ('20260918045427', 'fix_redeem_invite_accounts_and_guest_scope'),
    ('20260921073021', 'add_upgrade_guest_account'),
    ('20260922000000', 'auto_trail'),
    ('20260922000001', 'camera_find_off_by_default'),
    ('20260922000002', 'drop_overlay_menu_style_settings'),
    ('20260922000003', 'map_broadcasts'),
    ('20260922000004', 'marker_archive'),
    ('20260922041852', 'add_team_log_vehicle_details'),
    ('20260925000000', 'add_is_admin'),
    ('20260925014409', 'add_admin_map_content_stats'),
    ('20260930072858', 'add_trail_pauses'),
    ('20260930072859', 'alter_trails_path_multiline'),
    ('20260930072900', 'update_close_stale_trails_pauses'),
    ('20260930075911', 'add_trail_pause_paths'),
    ('20260930075912', 'update_close_trail_fast_pause_geometry'),
    ('20260930075913', 'update_get_trail_path_as_geojson'),
    ('20260930075914', 'update_close_stale_trails_pause_geometry'),
    ('20261020015402', 'fix_close_stale_trails_zero_points'),
    ('20261020061531', 'rebuild_null_path_trails'),
    ('20261028012736', 'fix_trail_close_timeouts'),
    ('20261110042557', 'add_chaser_loads'),
    ('20261110042558', 'add_grain_log'),
    ('20261110042559', 'add_chaser_rail_prefs')
) as v(version, name)
on conflict (version) do nothing;
