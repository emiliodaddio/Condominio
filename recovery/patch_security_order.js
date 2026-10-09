const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

const routeBlockStart = server.indexOf('// --- SECURITY LOGS ---');
const routeBlockEnd = server.indexOf('app.listen(PORT', routeBlockStart);

if (routeBlockStart !== -1 && routeBlockEnd !== -1) {
    const extractedRoutes = server.slice(routeBlockStart, routeBlockEnd).trim();
    
    // Remove it from its current position
    server = server.slice(0, routeBlockStart) + server.slice(routeBlockEnd);
    
    // Insert it before Fallback Frontend SPA
    const fallbackIdx = server.indexOf('// Fallback Frontend SPA');
    server = server.slice(0, fallbackIdx) + extractedRoutes + '\n\n' + server.slice(fallbackIdx);
    
    fs.writeFileSync('server.js', server);
    console.log('Security logs route moved successfully');
} else {
    console.log('Could not find route block');
}
