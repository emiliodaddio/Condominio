const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dest = path.join(__dirname, 'recovery');
if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
}
fs.mkdirSync(dest);

// Copy scripts
const scripts = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'));
for (let s of scripts) {
    fs.copyFileSync(path.join(__dirname, s), path.join(dest, s));
}

// Generate base server
console.log("Generating base server...");
execSync('node build_step1_2.js', { cwd: dest, stdio: 'inherit' });

// Get scripts to run
const runScripts = [
    'build_frontend.js', 'restore_auth_me.js', 'add_millesimi.js', 'patch_frontend_millesimi.js', 'unita_app.js', 'apply_millesimi.js', 'fix_visibility.js', 'fix_unita_tab.js', 'move_unita.js', 'fix_unita_form.js', 'fix_tab_users.js', 'fix_tab_btn.js', 'add_api_users.js', 'fix_users_api.js', 'fix_users_join.js', 'restore_endpoints.js', 'fix_app_cid.js', 'add_journal_endpoints.js', 'update_journal_frontend.js', 'fix_journal_submit.js', 'inject_journal_modal.js', 'update_journal_js.js', 'update_journal_js_2.js', 'update_journal_table.js', 'update_users_backend.js', 'add_put_users.js', 'update_users_html.js', 'update_users_js.js', 'update_users_html_fix.js', 'update_users_js_fix.js', 'final_html_fix.js', 'final_html_buttons_fix.js', 'debug_users_rendering.js', 'debug_loadusers.js', 'fix_role_state.js', 'bump_v4.js', 'add_put_users_fix.js', 'enlarge_layout.js', 'patch_export.js', 'temp_append.js', 'test_ui.js', 'fix_app.js', 'do_fix.js', 'test_ui2.js', 'fix_server.js', 'test_email.js', 'fix_server_log.js', 'fix_server_log2.js', 'fix_payload.js', 'fix_log.js', 'fix_html.js', 'test_log.js', 'fix_server_features.js', 'fix_app_quotes.js', 'fix_quotes_ui.js', 'fix_html_comm.js', 'fix_app_comm.js', 'fix_app_comm2.js', 'fix_html_comm3.js', 'test_comm.js', 'fix_accents.js', 'fix_privacy.js', 'fix_server_privacy.js', 'fix_html_privacy.js', 'fix_app_privacy.js', 'test_privacy.js', 'fix_privacy_admin.js', 'fix_modal_privacy_accents.js', 'fix_server_privacy_list.js', 'fix_html_privacy_th.js', 'fix_app_privacy_td.js', 'fix_app_privacy_td2.js', 'fix_app_privacy_final.js', 'fix_privacy_def.js', 'fix_privacy_anchor.js', 'fix_privacy_anchor2.js', 'fix_privacy_regex.js', 'cache_bust.js', 'temp_patch_app.js', 'patch_index.js', 'patch_app_dashboard.js', 'patch_index_btn.js', 'patch_app_btn.js', 'patch_privacy.js', 'fix_encodings.js', 'fix_unita_ids.js', 'patch_user_form.js', 'patch_index_final.js', 'patch_app_catasto.js', 'patch_password_policy.js', 'patch_placeholder.js', 'patch_server_put.js', 'patch_app_edit_user.js', 'patch_buttons.js', 'patch_no_print.js', 'patch_server_auth.js', 'patch_login_recovery.js', 'patch_login_link.js', 'patch_login_js.js', 'patch_server_auth2.js', 'patch_routes_order.js', 'patch_comm_log.js', 'patch_security_backend.js', 'patch_security_ui.js', 'patch_security_forgot.js', 'patch_security_endpoint.js', 'patch_security_order.js', 'patch_quotes_buttons.js', 'patch_quotes_buttons2.js', 'patch_comm_logs.js', 'patch_comm_html.js', 'patch_comm_html_rx.js', 'patch_comm_logs_rx.js', 'fix_accents_server.js', 'fix_accents_server2.js', 'fix_regex_disaster.js', 'patch_ticket_updates.js', 'fix_creator_unita.js', 'patch_2fa_html.js', 'patch_2fa_js.js', 'patch_qr.js', 'patch_otp.js', 'patch_login_otp.js', 'patch_login_container.js', 'patch_otp2.js', 'patch_otp3.js', 'patch_login_urls.js', 'patch_login_script.js', 'rebuild_login.js', 'test_login.js', 'bust_cache.js', 'add_logs.js', 'patch_login_ui.js', 'patch_savecondo.js', 'patch_loadcondo.js', 'patch_put_condo.js', 'patch_toast.js', 'patch_dashboard_banner.js', 'patch_dashboard_js.js', 'patch_dashboard_js_2.js', 'patch_banner_robust.js', 'patch_dashboard_js_robust.js', 'print_context.js', 'patch_dashboard_call.js', 'patch_switchtab.js', 'patch_banner_visible.js', 'temp.js', 'patch_queries.js', 'patch_agency_cards.js', 'patch_typo.js', 'patch_encoding.js', 'patch_extra_th.js', 'patch_invoice_modal.js', 'patch_populate_supplier.js', 'patch_populate_supplier_regex.js', 'patch_summary.js', 'patch_put_supplier.js', 'patch_html_encoding.js', 'patch_html_revert.js', 'patch_double_accents.js', 'patch_loadunita.js', 'patch_server_rubrica.js', 'patch_unita_routes.js', 'patch_html_rubrica.js', 'patch_js_rubrica.js', 'patch_html_unita_select.js', 'patch_js_unita_rubrica.js', 'patch_js_unita_rubrica_safe.js', 'patch_server_syntax.js', 'patch_syntax_error.js', 'patch_rename_tabs.js', 'patch_html_rubrica_fix.js', 'patch_html_force.js', 'patch_html_force_2.js', 'patch_server_cellulare.js', 'patch_html_cellulare.js', 'patch_js_cellulare.js', 'patch_edit_persona.js', 'patch_server_quotes.js', 'patch_html_quotes.js', 'patch_js_quotes.js', 'patch_js_quotes_render.js', 'patch_js_unita_render.js', 'patch_html_quote_user.js', 'patch_js_quote_populate.js', 'patch_js_quote_open.js', 'patch_populate_force.js', 'patch_create_force.js', 'patch_server_quotes_schema.js', 'patch_server_quotes_get.js', 'patch_server_cleanup.js', 'patch_server_cleanup_quotes.js', 'patch_server_quotes_put.js', 'patch_server_send_docs.js'
];

for (let s of runScripts) {
    if (s.includes('server') || s.includes('fix_order') || s.includes('patch_security_backend') || s.includes('patch_routes_order') || s.includes('patch_security_order') || s.includes('fix_regex_disaster') || s.includes('patch_ticket_updates')) {
        console.log("Running " + s + "...");
        try {
            execSync('node ' + s, { cwd: dest, stdio: 'inherit' });
        } catch(e) {
            console.error("Failed on " + s);
        }
    }
}
