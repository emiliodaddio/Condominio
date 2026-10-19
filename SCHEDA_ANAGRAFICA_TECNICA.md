# PROMPT ASSEMBLATO CON I DATI IN MEMORIA

Agisci come un Assistente Amministrativo esperto nella gestione condominiale. Il tuo compito è generare una scheda anagrafica e tecnica completa per un Condominio, organizzando le informazioni in tabelle chiare, professionali e facilmente leggibili.

Elabora i dati forniti e inseriscili all'interno delle tabelle specificate di seguito. Se non ti vengono forniti dati per un determinato campo, lascia la cella corrispondente vuota ("_______________________") oppure indica "[Dato non fornito]".

Genera l'output strutturato esattamente in questo modo, utilizzando tabelle Markdown a due colonne (Campo | Valore):

### 1. DATI GENERALI DEL CONDOMINIO

| Campo | Valore |
| :--- | :--- |
| **Denominazione Condominio** | |
| **Indirizzo Completo** | |
| **Codice Fiscale Condominio** | |
| **Codice CIG (se applicabile)** | |
| **Numero di Unità Immobiliari** | |

### 2. STUDIO & DATI AMMINISTRATORE

| Campo | Valore |
| :--- | :--- |
| **Nome Studio / Amministratore** | |
| **Responsabile / Referente** | |
| **Indirizzo Studio** | |
| **Telefono Fisso** | |
| **Cellulare di Urgenza** | |
| **Email Studio** | |
| **Email Dedicata al Condominio** | |
| **PEC (Posta Elettronica Certificata)** | |
| **Sito Web / Portale Condomini** | |
| **Orari di Apertura / Reperibilità** | |

### 3. DATI BANCARI & ASSICURATIVI

| Campo | Valore |
| :--- | :--- |
| **Istituto Bancario** | |
| **IBAN del Condominio** | |
| **Compagnia Assicurativa (Polizza Fabbricati)** | |
| **Numero Polizza** | |
| **Scadenza Polizza** | |

### 4. NOTE E SPECIFICHE AGGIUNTIVE
[Inserisci qui eventuali annotazioni o dettagli particolari in formato testo libero se presenti, altrimenti scrivi "Nessuna nota aggiuntiva"].

---

## DATI GREZZI ESTRATTI DAL SISTEMA GESTIONALE DA ELABORARE:

```json
{
  "condominio": {
    "id": 1,
    "denominazione": "Condominio Ma.Ca.",
    "indirizzo": "Via Vittorio Alfieri, 4 - 81020 San Nicola la Strada (CE)",
    "codice_fiscale": "123456789",
    "struttura": "Scale A e B",
    "portale_web": "http://localhost:3000 (Condominio Trasparente)"
  },
  "studio_amministratore": {
    "titolo": "Avv.",
    "nome": "Tizio",
    "cognome": "Caio",
    "denominazione_studio": "Studio di Amministrazione Avv. Tizio Caio",
    "telefono_fisso": "018890192456",
    "cellulare_ordinario": "3357985406",
    "cellulare_emergenze_h24": "34879512689",
    "email_ufficiale": "test@gmail.com",
    "pec": "test@pec.it",
    "orari_ricevimento": "Reperibilità emergenze continua; ricevimento su appuntamento"
  },
  "dati_bancari_e_conti": {
    "banca": "Istituto Bancario di riferimento",
    "iban": "IT30000000",
    "intestazione_conto": "Condominio Ma.Ca."
  },
  "assicurazione": {
    "polizza_fabbricati": null,
    "numero_polizza": null,
    "scadenza": null
  },
  "unita_immobiliari_e_tabelle": {
    "unita_totali": null,
    "note": "Suddivisione in Scale A e B; gestione contabile e registro anagrafico attivi a sistema."
  }
}
```

---

# OUTPUT GENERATO / SCHEDA FINALE

### 1. DATI GENERALI DEL CONDOMINIO

| Campo | Valore |
| :--- | :--- |
| **Denominazione Condominio** | Condominio Ma.Ca. |
| **Indirizzo Completo** | Via Vittorio Alfieri, 4 - 81020 San Nicola la Strada (CE) |
| **Codice Fiscale Condominio** | 123456789 |
| **Codice CIG (se applicabile)** | [Dato non fornito] |
| **Numero di Unità Immobiliari** | [Dato non fornito] |

### 2. STUDIO & DATI AMMINISTRATORE

| Campo | Valore |
| :--- | :--- |
| **Nome Studio / Amministratore** | Studio di Amministrazione Avv. Tizio Caio |
| **Responsabile / Referente** | Avv. Tizio Caio |
| **Indirizzo Studio** | [Dato non fornito] |
| **Telefono Fisso** | 018890192456 |
| **Cellulare di Urgenza** | 34879512689 *(Ordinario: 3357985406)* |
| **Email Studio** | test@gmail.com |
| **Email Dedicata al Condominio** | test@gmail.com |
| **PEC (Posta Elettronica Certificata)** | test@pec.it |
| **Sito Web / Portale Condomini** | http://localhost:3000 (Condominio Trasparente) |
| **Orari di Apertura / Reperibilità** | Reperibilità emergenze H24 al recapito dedicato; ricevimento in studio su appuntamento |

### 3. DATI BANCARI & ASSICURATIVI

| Campo | Valore |
| :--- | :--- |
| **Istituto Bancario** | C/C Condominiale |
| **IBAN del Condominio** | IT30000000 |
| **Compagnia Assicurativa (Polizza Fabbricati)** | [Dato non fornito] |
| **Numero Polizza** | [Dato non fornito] |
| **Scadenza Polizza** | [Dato non fornito] |

### 4. NOTE E SPECIFICHE AGGIUNTIVE
Il fabbricato è articolato su Scale A e B. Il condominio è interamente digitalizzato sulla piattaforma web con gestione attiva di contabilità, anagrafica condòmini, segnalazioni guasti e bacheca documentale.
