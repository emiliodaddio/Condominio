const fs = require('fs');
let js = fs.readFileSync('public/app.js', 'utf8');

const debugCode = `
    try {
        tbody.innerHTML = state.users.map(u => {
            const isAdmin = u.role === 'admin';
            const roleBadge = isAdmin
                ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Amministratore</span>'
                : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Condòmino</span>';
    
            return \`
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-900">\${u.nome || 'Sconosciuto'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-600 font-mono">\${u.email || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">\${u.telefono || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">\${u.unita || '-'}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-700">\${u.dati_catastali || '-'}</td>
                    <td class="py-3.5 px-4 text-center">\${roleBadge}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-400">\${formatDate(u.created_at)}
            \${state.currentUser.role === 'admin' ? \`<button onclick="editUser(\${u.id})" class="ml-2 text-amber-500 no-print"><i class="fa-solid fa-pen"></i></button> <button onclick="deleteUser(\${u.id})" class="ml-1 text-rose-500 no-print"><i class="fa-solid fa-trash"></i></button>\` : ''}
        </td>
                </tr>
            \`;
        }).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-rose-500 p-4">Errore rendering JS: ' + e.message + '</td></tr>';
        console.error(e);
    }
`;

js = js.replace(/tbody\.innerHTML = state\.users\.map\(u => \{[\s\S]*?\}\)\.join\(''\);/, debugCode);

fs.writeFileSync('public/app.js', js);
console.log('Injected rendering try-catch');
