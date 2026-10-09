const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

// Undo the broken injection
const brokenSnippet = `
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

code = code.replace(brokenSnippet, "");
code = code.replace(`
                    <td class="py-3.5 px-4 text-center">\${privacyBadge}</td>
                    <td class="py-3.5 px-4 text-center">\${roleBadge}</td>`, `<td class="py-3.5 px-4 text-center">\${roleBadge}</td>`);

// Now insert privacyBadge BEFORE the return `...`
const correctTarget = "              return `";
const correctReplacement = `
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
            
            return \`
`;

code = code.replace(correctTarget, correctReplacement);

// And inject the column in the string
code = code.replace(
    `<td class="py-3.5 px-4 text-center">\${roleBadge}</td>`,
    `<td class="py-3.5 px-4 text-center">\${privacyBadge}</td>\n                      <td class="py-3.5 px-4 text-center">\${roleBadge}</td>`
);

fs.writeFileSync('public/app_v4.js', code);
