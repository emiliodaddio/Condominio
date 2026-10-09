const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const anchor = `const roleBadge = isAdmin`;

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
            
            const roleBadge = isAdmin`;

code = code.replace(anchor, replacement); // This will replace the FIRST occurrence.
// Wait, the first occurrence is `const roleBadge = document.getElementById('role-badge');`. I need to replace the SECOND occurrence, or use a more specific anchor.

const specificAnchor = `const roleBadge = isAdmin
                ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Amministratore</span>'`;

if (code.includes(specificAnchor)) {
    code = code.replace(specificAnchor, replacement.replace('const roleBadge = isAdmin', specificAnchor));
    fs.writeFileSync('public/app_v4.js', code);
    console.log("Success");
} else {
    console.log("Not found specific anchor");
}
