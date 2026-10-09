const fs = require('fs');
let html = fs.readFileSync('public/login.html', 'utf8');

const targetBtn = `<button type="submit" id="btn-submit"`;
const linkHtml = `<div class="text-right mt-1 mb-4">
                    <a href="#" onclick="showForgotPassword()" class="text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition-colors">Hai dimenticato la password?</a>
                </div>
                <button type="submit" id="btn-submit"`;

if (html.includes(targetBtn) && !html.includes('Hai dimenticato la password?')) {
    html = html.replace(targetBtn, linkHtml);
    fs.writeFileSync('public/login.html', html);
    console.log('Link added to login.html');
} else {
    console.log('Failed to add link');
}
