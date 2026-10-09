const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'public', 'index.html');
let content = fs.readFileSync(indexFile, 'utf8');

// 1. PWA Tags
const pwaTags = `
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#1e3a8a">
    <link rel="apple-touch-icon" href="icon-192.png">
    <style>
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .tab-pane { display: block !important; page-break-inside: avoid; }
            header, footer { display: none !important; }
        }
    </style>
`;
content = content.replace('</head>', pwaTags + '</head>');

// 2. Add Print button and global actions to header
const printButton = `
                    <button onclick="window.print()" class="no-print px-3.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors flex items-center">
                        <i class="fa-solid fa-print mr-1.5 text-slate-400"></i> Stampa
                    </button>
`;
content = content.replace('<button onclick="logout()"', printButton + '\n                    <button onclick="logout()"');

// 3. New Tabs
const newTabs = `
                <!-- TABS ADMIN V2.0 -->
                <button id="tab-btn-anagrafica" onclick="switchTab('anagrafica')" class="tab-btn hidden no-print flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-building text-base"></i><span>Anagrafica</span>
                </button>
                <button id="tab-btn-banca" onclick="switchTab('banca')" class="tab-btn hidden no-print flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-building-columns text-base"></i><span>Banca</span>
                </button>
                <button id="tab-btn-giornale" onclick="switchTab('giornale')" class="tab-btn hidden no-print flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-book text-base"></i><span>Giornale</span>
                </button>
                <button id="tab-btn-audit" onclick="switchTab('audit')" class="tab-btn hidden no-print flex items-center space-x-2 py-3 px-3 border-b-2 border-transparent font-medium text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors">
                    <i class="fa-solid fa-clock-rotate-left text-base"></i><span>Registro Log</span>
                </button>
`;
content = content.replace('<!-- TAB RISERVATA ESCLUSIVAMENTE ALL\'AMMINISTRATORE -->', newTabs + '\n                <!-- TAB RISERVATA ESCLUSIVAMENTE ALL\'AMMINISTRATORE -->');

// 4. New Sections
const newSections = `
        <!-- V2.0 ANAGRAFICA -->
        <section id="tab-anagrafica" class="tab-pane hidden space-y-8">
            <h2 class="text-2xl font-bold">Anagrafica Condominio</h2>
            <div class="bg-white p-5 rounded-2xl shadow-xs border">
                <form id="form-condominio" onsubmit="handleSaveCondominio(event)" class="grid grid-cols-2 gap-4">
                    <input type="text" id="condominio-nome" placeholder="Nome Condominio" class="border p-2 rounded">
                    <input type="text" id="condominio-indirizzo" placeholder="Indirizzo" class="border p-2 rounded">
                    <input type="text" id="condominio-cf" placeholder="Codice Fiscale" class="border p-2 rounded">
                    <input type="text" id="condominio-scala" placeholder="Scale (es. A, B)" class="border p-2 rounded">
                    <button type="submit" class="col-span-2 bg-blue-600 text-white p-2 rounded font-bold">Salva Dati Condominio</button>
                </form>
            </div>
        </section>

        <!-- V2.0 BANCA -->
        <section id="tab-banca" class="tab-pane hidden space-y-8">
            <div class="flex justify-between items-center">
                <h2 class="text-2xl font-bold">Conti e Movimenti</h2>
                <button onclick="addBankTransaction()" class="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-bold no-print">+ Nuovo Movimento</button>
            </div>
            <div id="banca-container" class="bg-white p-4 border rounded-2xl shadow-xs"></div>
        </section>

        <!-- V2.0 GIORNALE -->
        <section id="tab-giornale" class="tab-pane hidden space-y-8">
            <div class="flex justify-between items-center">
                <h2 class="text-2xl font-bold">Libro Giornale</h2>
                <button onclick="addJournalEntry()" class="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-bold no-print">+ Nuova Registrazione</button>
            </div>
            <div id="giornale-container" class="bg-white p-4 border rounded-2xl shadow-xs"></div>
        </section>

        <!-- V2.0 AUDIT LOG -->
        <section id="tab-audit" class="tab-pane hidden space-y-8">
            <h2 class="text-2xl font-bold">Registro Accessi e Modifiche</h2>
            <div id="audit-container" class="bg-white p-4 border rounded-2xl shadow-xs text-sm"></div>
        </section>
`;

content = content.replace('</main>', newSections + '\n    </main>');

fs.writeFileSync(indexFile, content, 'utf8');
console.log('index.html updated');
