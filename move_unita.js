const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

// The section to extract
const startMarker = '<!-- SEZIONE ANAGRAFICA & MILLESIMI -->';
const endMarker = '</section>';

const startIndex = html.indexOf(startMarker);
if (startIndex !== -1) {
    // find the end of the section
    let searchIndex = startIndex;
    // Because there might be nested sections? No, it's just one <section> for tab-unita
    const nextSectionEnd = html.indexOf(endMarker, searchIndex) + endMarker.length;
    
    const sectionContent = html.substring(startIndex, nextSectionEnd);
    
    // Remove it from the current position
    html = html.substring(0, startIndex) + html.substring(nextSectionEnd);
    
    // Append it before </main>
    html = html.replace('</main>', sectionContent + '\n    </main>');
    
    fs.writeFileSync('public/index.html', html);
    console.log('Spostata la sezione unita dentro il main!');
} else {
    console.log('Sezione non trovata!');
}
