const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const fixes = {
    'unitàist': 'unita-list',
    'unitàser-id': 'unita-user-id',
    'unitàd': 'unita-id',
    'unitàdentificativo': 'unita-identificativo',
    'unitàipo': 'unita-tipo',
    'unitàcala': 'unita-scala',
    'unitàiano': 'unita-piano',
    'unitàill-prop': 'unita-mill-prop',
    'unitàill-scale': 'unita-mill-scale',
    'unitàill-asc': 'unita-mill-asc',
    'Unitàà': 'Unità',
    
    // Just in case they are without accent:
    'unitaist': 'unita-list',
    'unitaser-id': 'unita-user-id',
    'unitad': 'unita-id',
    'unitadentificativo': 'unita-identificativo',
    'unitaipo': 'unita-tipo',
    'unitacala': 'unita-scala',
    'unitaiano': 'unita-piano',
    'unitaill-prop': 'unita-mill-prop',
    'unitaill-scale': 'unita-mill-scale',
    'unitaill-asc': 'unita-mill-asc'
};

for (const [bad, good] of Object.entries(fixes)) {
    code = code.split(bad).join(good);
}

fs.writeFileSync('public/app_v4.js', code);
console.log('Fixed unit ids in app_v4.js');
