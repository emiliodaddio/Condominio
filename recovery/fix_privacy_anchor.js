const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const anchor = "                  : '<span class=\"px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800\">condomino</span>';";

const replacement = `
            let privacyBadge = '<span class="text-xs text-slate-400 italic">N/D</span>';
            if (!isAdmin) {
                if (u.privacy_accepted) {
                    privacyBadge = \`<span title="Accettata il \${formatDate(u.privacy_accepted_at)}" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-check mr-1"></i> Accettata</span>\`;
                } else {
                    privacyBadge = \`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"><i class="fa-solid fa-clock mr-1"></i> In attesa</span>\`;
                }
            } else {
                privacyBadge = '<span class="text-[10px] text-slate-400">Admin</span>';
            }
`;

const idx = code.indexOf(anchor);
if (idx !== -1) {
    code = code.substring(0, idx + anchor.length) + '\n' + replacement + code.substring(idx + anchor.length);
    fs.writeFileSync('public/app_v4.js', code);
    console.log('Fixed correctly via exact anchor match!');
} else {
    console.log('ANCHOR NOT FOUND');
}
