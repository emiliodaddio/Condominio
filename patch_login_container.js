const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

if (!login.includes('id="login-form-container"')) {
    login = login.replace(`<form id="login-form" onsubmit="handleLogin(event)" class="space-y-4">`, `<div id="login-form-container">\n                    <form id="login-form" onsubmit="handleLogin(event)" class="space-y-4">`);
    login = login.replace(`<span>Non hai un account? <a href="#" class="text-blue-600 font-bold hover:underline">Registrati</a></span>\n                    </div>`, `<span>Non hai un account? <a href="#" class="text-blue-600 font-bold hover:underline">Registrati</a></span>\n                    </div>\n                    </div>`);
    fs.writeFileSync('public/login.html', login);
    console.log('Fixed login-form-container');
} else {
    console.log('Already fixed');
}
