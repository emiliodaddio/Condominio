const fs = require('fs');
let login = fs.readFileSync('public/login.html', 'utf8');

// Modifica label Email
login = login.replace('<label class="block text-xs font-bold text-slate-700 mb-1">Indirizzo Email</label>', '<label class="block text-xs font-bold text-slate-700 mb-1">Username (indirizzo e-mail)</label>');

// Modifica slot password per aggiungere l'icona
const oldPasswordSlot = `<input type="password" id="password" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••">`;

const newPasswordSlot = `<div class="relative">
                                <input type="password" id="password" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all pr-12" placeholder="••••••••">
                                <button type="button" onclick="togglePasswordVisibility()" class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-600 transition-colors focus:outline-none">
                                    <i id="eye-icon" class="fa-solid fa-eye"></i>
                                </button>
                            </div>`;

login = login.replace(oldPasswordSlot, newPasswordSlot);

// Aggiungi la funzione JS per il toggle della visibilità
const toggleScript = `
        function togglePasswordVisibility() {
            const pwdInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eye-icon');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash');
            } else {
                pwdInput.type = 'password';
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye');
            }
        }
        
        async function handleVerifyOTP(e) {`;

login = login.replace(`async function handleVerifyOTP(e) {`, toggleScript);

fs.writeFileSync('public/login.html', login);
console.log('Login HTML updated with password toggle and new label');
