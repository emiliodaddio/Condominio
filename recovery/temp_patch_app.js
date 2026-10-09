const fs = require('fs');
let code = fs.readFileSync('public/app_v4.js', 'utf8');

const regex = /    if \(user\.condomini && user\.condomini\.length > 1\) \{[\s\S]*?\} else if \(currentCondo\) \{/m;

if (regex.test(code)) {
    code = code.replace(regex, '    if (currentCondo) {');
    fs.writeFileSync('public/app_v4.js', code);
    console.log('Replaced successfully');
} else {
    console.log('Could not find block');
}
