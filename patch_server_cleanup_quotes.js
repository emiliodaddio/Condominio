const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const oldElse = `        } else {
            // Anonimizzazione automatica
            let i = 1;
            const data = rows.map(r => {
                const isOwn = r.user_id === req.user.id;
                return {
                    ...r,
                    condomino_nome: isOwn ? r.condomino_nome + ' (Tu)' : 'Condòmino #' + (i++),
                    condomino_unita: isOwn ? r.condomino_unita : 'Riservato'
                };
            });
            res.json({ success: true, data });
        }
    });
});`;

server = server.replace(oldElse, "");

fs.writeFileSync('server.js', server);
console.log('Cleaned up quotes else block');
