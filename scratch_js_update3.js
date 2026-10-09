const fs = require('fs');
let js = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `                        document.getElementById('dash-admin-nome').textContent = (data.data.admin_titolo ? data.data.admin_titolo + ' ' : '') + (data.data.admin_nome || '') + ' ' + (data.data.admin_cognome || '');
                        document.getElementById('dash-admin-tel').textContent = data.data.admin_telefono || data.data.admin_cellulare || 'N/D';
                        document.getElementById('dash-admin-email').textContent = data.data.admin_email || 'N/D';`;

const newStr = `                        document.getElementById('dash-admin-nome').textContent = (data.data.admin_titolo ? data.data.admin_titolo + ' ' : '') + (data.data.admin_nome || '') + ' ' + (data.data.admin_cognome || '');
                        document.getElementById('dash-admin-tel').textContent = data.data.admin_telefono || 'N/D';
                        document.getElementById('dash-admin-cell').textContent = data.data.admin_cellulare || 'N/D';
                        document.getElementById('dash-admin-emg').textContent = data.data.admin_emergenze || 'N/D';
                        document.getElementById('dash-admin-email').textContent = data.data.admin_email || 'N/D';`;

js = js.replace(targetStr, newStr);
fs.writeFileSync('public/app_v4.js', js);
console.log("Updated app_v4.js!");
