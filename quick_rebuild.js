const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dest = path.join(__dirname, 'recovery');
if(fs.existsSync(dest)) fs.rmSync(dest, {recursive: true, force: true});
fs.mkdirSync(dest);

const scripts = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'));
for(let s of scripts) fs.copyFileSync(path.join(__dirname, s), path.join(dest, s));

execSync('node build_step1_2.js', {cwd: dest});

const mutators = [
"add_2fa.js", "add_api_users.js", "add_journal_endpoints.js", "add_logs.js", "add_millesimi.js", 
"add_put_users.js", "add_put_users_fix.js", "fix_accents_server.js", "fix_accents_server2.js", 
"fix_creator_unita.js", "fix_regex_disaster.js", "fix_server.js", "fix_server_features.js", 
"fix_server_log.js", "fix_server_log2.js", "fix_server_privacy.js", "fix_server_privacy_list.js", 
"fix_users_api.js", "fix_users_join.js", "patch_comm_log.js", "patch_otp.js", "patch_otp2.js", 
"patch_otp3.js", "patch_password_policy.js", "patch_put_condo.js", "patch_put_supplier.js", 
"patch_queries.js", "patch_routes_order.js", "patch_security_backend.js", "patch_security_endpoint.js", 
"patch_security_forgot.js", "patch_security_order.js", "patch_server_auth.js", "patch_server_auth2.js", 
"patch_server_cellulare.js", "patch_server_cleanup.js", "patch_server_cleanup_quotes.js", "patch_server_put.js", 
"patch_server_quotes.js", "patch_server_quotes_get.js", "patch_server_quotes_put.js", "patch_server_quotes_schema.js", 
"patch_server_rubrica.js", "patch_server_safe_send_docs.js", "patch_server_send_docs.js", 
"patch_server_send_docs_global.js", "patch_server_send_docs_line.js", "patch_server_send_docs_regex.js", 
"patch_server_send_docs_split.js", "patch_server_syntax.js", "patch_summary.js", "patch_ticket_updates.js", 
"patch_unita_routes.js", "restore_auth_me.js", "restore_endpoints.js", "update_users_backend.js"
];

const ur = fs.readFileSync('ultimate_recovery.js', 'utf8');
const runScriptsStr = ur.substring(ur.indexOf('const runScripts = [')+20, ur.indexOf('];'));
const runScripts = runScriptsStr.split(',').map(s => s.trim().replace(/'/g, '').replace(/"/g, ''));

for (let s of runScripts) {
    if(mutators.includes(s)) {
        try { execSync('node ' + s, {cwd: dest, stdio: 'ignore'}); } catch(e) {}
    }
}
