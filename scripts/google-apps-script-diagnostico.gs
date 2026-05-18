/**
 * Google Apps Script — Diagnósticos Finzzia
 *
 * Planilha: https://docs.google.com/spreadsheets/d/1FF9d21qYL2niqEZiVMg8FoBWnig30hqFZKpt6rcaNc0/
 * Aba gid=1670473388 (colunas: Data/Hora, Nome, Email, Telefone, Segmento, Faturamento Mensal, Contexto)
 *
 * Deploy:
 * 1. Abra a planilha → Extensões → Apps Script
 * 2. Cole este código e salve
 * 3. Implantar → Nova implantação → Tipo: App da Web
 * 4. Executar como: Eu | Quem acessa: Qualquer pessoa
 * 5. Copie a URL /exec e coloque em api.config.ts → GOOGLE_SHEETS_WEB_APP_URL
 */

var SPREADSHEET_ID = '1FF9d21qYL2niqEZiVMg8FoBWnig30hqFZKpt6rcaNc0';
var SHEET_GID = 1670473388;

function getDiagnosticoSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === SHEET_GID) {
      return sheets[i];
    }
  }
  var byName = ss.getSheetByName('Diagnósticos');
  return byName || ss.getActiveSheet();
}

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var sheet = getDiagnosticoSheet_();
    sheet.appendRow([
      p.timestamp || new Date().toISOString(),
      p.nome || '',
      p.email || '',
      p.telefone || '',
      p.segmento || '',
      p.faturamento || '',
      p.contexto || p.origem || ''
    ]);
    return json_({ success: true });
  } catch (err) {
    return json_({ success: false, message: String(err) });
  }
}

function doGet(e) {
  return doPost(e);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
