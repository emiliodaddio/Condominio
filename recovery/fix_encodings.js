const fs = require('fs');

const replacements = [
    [/Unit\ufffd/g, 'Unità'],
    [/unit\ufffd/g, 'unità'],
    [/Cond\ufffdmino/g, 'Condòmino'],
    [/cond\ufffdmino/g, 'condòmino'],
    [/Cond\ufffdmini/g, 'Condòmini'],
    [/cond\ufffdmini/g, 'condòmini'],
    [/Propriet\ufffd/g, 'Proprietà'],
    [/propriet\ufffd/g, 'proprietà'],
    [/Elettricit\ufffd/g, 'Elettricità'],
    [/Finalit\ufffd/g, 'Finalità'],
    [/Priorit\ufffd/g, 'Priorità'],
    [/Contabilit\ufffd/g, 'Contabilità'],
    [/verr\ufffd/g, 'verrà'],
    [/apparir\ufffd/g, 'apparirà'],
    [/prender\ufffd/g, 'prenderà'],
    [/impaginer\ufffd/g, 'impaginerà'],
    [/conterr\ufffd/g, 'conterrà'],
    [/ \ufffd /g, ' è '],
    [/gi\ufffd/g, 'già']
];

['public/index.html', 'public/login.html', 'public/app_v4.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    replacements.forEach(([regex, repl]) => {
        code = code.replace(regex, repl);
    });
    // Replace any remaining isolated \ufffd with 'à' (heuristic)
    code = code.replace(/\ufffd/g, 'à');
    fs.writeFileSync(file, code);
});
console.log('Fixed encodings in all files');
