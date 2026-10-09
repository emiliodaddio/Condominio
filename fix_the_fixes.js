const fs = require('fs');
for (let file of ['fix_server_log.js', 'fix_server_log2.js', 'fix_server_features.js', 'patch_server_send_docs_split.js', 'patch_server_safe_send_docs.js']) {
    let c = fs.readFileSync(file, 'utf8');
    c = c.replace(/code = code\.substring\(0, ([a-zA-Z]+)\)/g, 'if ( !== -1) code = code.substring(0, )');
    fs.writeFileSync(file, c);
}
