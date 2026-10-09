const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let content = fs.readFileSync(indexFile, 'utf8');

// Add Speech UI to Assemblies Tab
const speechUI = `
            <!-- V2.0 SPEECH TO TEXT VERBALE -->
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs mt-8 no-print" id="speech-section">
                <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <i class="fa-solid fa-microphone text-rose-500"></i> Dettatura Verbale in Tempo Reale (Solo Admin)
                </h2>
                <textarea id="speech-output" rows="6" class="w-full border rounded-xl p-3 text-sm text-slate-700 bg-slate-50 mb-3" placeholder="Il testo dettato apparirà qui..."></textarea>
                <div class="flex space-x-2">
                    <button id="btn-speech" onclick="startSpeechToText()" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-sm font-bold flex items-center gap-2">
                        <i class="fa-solid fa-microphone"></i> Avvia Dettatura
                    </button>
                    <button onclick="downloadVerbale()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                        <i class="fa-solid fa-download"></i> Scarica TXT
                    </button>
                </div>
            </div>
`;

content = content.replace('<!-- Archivio Verbali Assemblee Passate -->', speechUI + '\n            <!-- Archivio Verbali Assemblee Passate -->');

fs.writeFileSync(indexFile, content, 'utf8');

const appFile = path.join(__dirname, 'public', 'app.js');
let appContent = fs.readFileSync(appFile, 'utf8');

const speechJs = `
// ============================================================================
// V2.0 SPEECH TO TEXT
// ============================================================================
let recognition;
let isRecording = false;
let transcriptText = "";

function startSpeechToText() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge.");
        return;
    }
    
    if (!recognition) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'it-IT';
        
        recognition.onresult = function(event) {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    transcriptText += event.results[i][0].transcript + " ";
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            document.getElementById('speech-output').value = transcriptText + interimTranscript;
        };
        
        recognition.onerror = function(event) {
            console.error("Speech error", event.error);
        };
    }
    
    const btn = document.getElementById('btn-speech');
    if (isRecording) {
        recognition.stop();
        isRecording = false;
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Avvia Dettatura';
    } else {
        recognition.start();
        isRecording = true;
        btn.innerHTML = '<i class="fa-solid fa-stop text-red-500"></i> Ferma Dettatura';
    }
}

function downloadVerbale() {
    const text = document.getElementById('speech-output').value;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verbale_assemblea.txt';
    a.click();
}

// Hide speech section for non-admins
const oldSetupUIForRole = setupUIForRole;
setupUIForRole = function() {
    oldSetupUIForRole();
    if (state.currentUser.role !== 'admin') {
        const speechSec = document.getElementById('speech-section');
        if (speechSec) speechSec.classList.add('hidden');
    }
}
`;

appContent += '\n' + speechJs;
fs.writeFileSync(appFile, appContent, 'utf8');

console.log('Speech feature added');
