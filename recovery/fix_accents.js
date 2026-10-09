const fs = require('fs');

function fixFile(file) {
    if (!fs.existsSync(file)) return;
    let text = fs.readFileSync(file, 'utf8');
    
    text = text.replace(/Unit√ /g, 'Unit‡ ');
    text = text.replace(/Unit√</g, 'Unit‡<');
    text = text.replace(/unit√ /g, 'unit‡ ');
    
    text = text.replace(/cond√≤mini/g, 'condÚmini');
    text = text.replace(/Cond√≤mino/g, 'CondÚmino');
    text = text.replace(/cond√≤mino/g, 'condÚmino');
    
    text = text.replace(/VISIBILIT√Ä/g, 'VISIBILIT¿');
    text = text.replace(/CONTABILIT√Ä/g, 'CONTABILIT¿');
    text = text.replace(/Contabilit√ /g, 'Contabilit‡ ');
    
    text = text.replace(/apparir√ /g, 'apparir‡ ');
    text = text.replace(/Priorit√ /g, 'Priorit‡ ');
    text = text.replace(/Priorit√</g, 'Priorit‡<');
    text = text.replace(/Propriet√ /g, 'Propriet‡ ');
    text = text.replace(/Propriet√</g, 'Propriet‡<');
    text = text.replace(/Elettricit√ /g, 'Elettricit‡ ');
    text = text.replace(/Elettricit√</g, 'Elettricit‡<');
    
    // Catch-all per √ rimasti seguiti da spazio o <
    text = text.replace(/√ /g, '‡ ');
    text = text.replace(/√</g, '‡<');
    text = text.replace(/√Ä/g, '¿');
    
    fs.writeFileSync(file, text, 'utf8');
}

['public/index.html', 'public/app_v4.js', 'server.js', 'public/login.html'].forEach(fixFile);
