const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const dest = path.join(__dirname, 'recovery');
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest);
const scripts = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'));
for (let s of scripts) fs.copyFileSync(path.join(__dirname, s), path.join(dest, s));
execSync('node build_step1_2.js', { cwd: dest });
const ur = fs.readFileSync('ultimate_recovery.js', 'utf8');
const runScriptsStr = ur.substring(ur.indexOf('const runScripts = [') + 20, ur.indexOf('];'));
const runScripts = runScriptsStr.split(',').map(s => s.trim().replace(/'/g, '').replace(/"/g, ''));

for (let s of runScripts) {
    if (!s || s.startsWith('//')) continue;
    try {
        execSync('node ' + s, { cwd: dest, stdio: 'ignore' });
    } catch(e) {}
    
    if (fs.existsSync(path.join(dest, 'server.js'))) {
        let code = fs.readFileSync(path.join(dest, 'server.js'), 'utf8');
        if (!code.includes('require(')) {
            console.log(s + ' BROKE IT!');
            process.exit(0);
        }
    }
}
console.log('Done, no break found');
