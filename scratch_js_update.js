const fs = require('fs');

let js = fs.readFileSync('public/app_v4.js', 'utf8');

const targetStr = `            const dashBox = document.getElementById('dash-condo-details-box');
            if(dashBox && (data.data.indirizzo || data.data.cf)) {
                dashBox.classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
            }`;

const newStr = `            const dashBox = document.getElementById('dash-condo-details-box');
            if(dashBox && (data.data.indirizzo || data.data.cf)) {
                dashBox.classList.remove('hidden');
                document.getElementById('dash-condo-indirizzo').textContent = data.data.indirizzo || 'N/D';
                document.getElementById('dash-condo-cf').textContent = data.data.cf || 'N/D';
                document.getElementById('dash-condo-scala').textContent = data.data.scala || 'Unica';
                
                if (data.data.admin_nome || data.data.admin_cognome) {
                    const adminDetails = document.getElementById('dash-admin-details');
                    if (adminDetails) {
                        adminDetails.classList.remove('hidden');
                        document.getElementById('dash-admin-nome').textContent = (data.data.admin_titolo ? data.data.admin_titolo + ' ' : '') + (data.data.admin_nome || '') + ' ' + (data.data.admin_cognome || '');
                        document.getElementById('dash-admin-tel').textContent = data.data.admin_telefono || data.data.admin_cellulare || 'N/D';
                        document.getElementById('dash-admin-email').textContent = data.data.admin_email || 'N/D';
                    }
                }
            }`;

if (js.includes(targetStr)) {
    js = js.replace(targetStr, newStr);
    fs.writeFileSync('public/app_v4.js', js);
    console.log("JS Updated!");
} else {
    console.log("Could not find target string in app_v4.js");
}
