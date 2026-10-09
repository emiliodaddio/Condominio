const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

const btnHtml = `
<button id="btn-return-dashboard" onclick="returnToAgencyDashboard()" class="hidden no-print px-3.5 py-1.5 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors flex items-center mr-2">
    <i class="fa-solid fa-layer-group mr-1.5 text-indigo-500"></i> I Miei Condomìni
</button>
`;

c = c.replace('<button onclick="window.location.href=\'/\'" class="no-print', btnHtml + '<button onclick="window.location.href=\'/\'" class="no-print');
fs.writeFileSync('public/index.html', c);
