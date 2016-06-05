'use strict';

/******************************************************************************/

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
    }
  });
}

function splitLongLine(text, length) {
  var output = '';
  while (text.length > length) {
    output += text.substring(0, length);
    output += '<br/>';
    text = text.substring(40);
  }
  output += text;
  return output;
}

/******************************************************************************/

var xsdCamt53V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04';
var xsdCamt54V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.04';

function formatDate(date) {
  return date.substring(8, 10) + '/' + date.substring(5, 7) + '/' + date.substring(0, 4);
}
function formatTime(time) {
  return time;
}

function getDateTime(xml, pattern) {
  pattern = pattern + '(....-..-..)T(..:..:..)<';
  var result = xml.match(pattern);
  var date = formatDate(result[1]);
  var time = formatTime(result[2]);
  return date + ', ' + time;
}

function getDate(xml, pattern) {
  pattern = pattern + '(....-..-..)<';
  var result = xml.match(pattern);
  return formatDate(result[1]);
}

function getCreationDateTime(xml) {
  // <CreDtTm>2016-05-06T23:01:15</CreDtTm>
  return getDateTime(xml, '<CreDtTm>');
}

function formatIBAN(iban) {
  var out = '';
  for (var i = 0; i < iban.length; i++) {
    if (i > 0 && i % 4 === 0) {
      out += ' ';
    }
    out += iban[i];
  }
  return out;
}

function getDetailsSummary(xml) {
  var amount = xml.match(/<Amt Ccy="(...)">(\d+\.\d+)</);
  var charges = xml.match(/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)</);
  var credit = xml.match(/<CdtDbtInd>([A-Z]+)</);
  var financialInstitution = xml.match(/<FinInstnId>(.+)<\/FinInstnId>/);
  var debtorName = xml.match(/<RltdPties><Dbtr><Nm>([^<]*)<\/Nm>/);
  var remittanceInformation = xml.match(/<RmtInf>(.+)<\/RmtInf>/);
  var debtorFinName = financialInstitution && financialInstitution[1].match(/<Nm>([a-zA-Z0-9_\-.:;+/ ]*)</);
  var reference = remittanceInformation && remittanceInformation[1].match(/<Ref>(.*)<\/Ref>/);

  if (!debtorName && !reference && !debtorFinName) {
    return '';
  }

  var debtorAccount = xml.match(/<DbtrAcct><Id><IBAN>([A-Z0-9]+)</);
  var debtorBank1 = debtorName ? escapeXml(debtorName[1]) : '';
  var debtorBank2 = debtorAccount ? debtorAccount[1] : '';
  var debtorDetails = debtorBank1.length ? debtorBank1 + (debtorBank2.length ? '<br/>' + formatIBAN(debtorBank2) : '') : debtorBank2.length ? formatIBAN(debtorBank2) : '-';

  return '\n  </tbody>\n</table>\n<table cellpadding="0" cellspacing="0" class="transaction details">\n  <tbody>\n    <tr class="first-detail">\n      <td>Mouvement:</td>\n      <td class="align-right">' + (credit ? credit[1] : '-') + '</td>\n    </tr>\n    <tr>\n      <td>Débiteur:</td>\n      <td class="align-right">' + debtorDetails + '</td>\n    </tr>\n    <tr>\n      <td>Institut financier:</td>\n      <td class="align-right">' + (debtorFinName ? escapeXml(debtorFinName[1]) : '-') + '</td>\n    </tr>\n    <tr>\n      <td>Référence:</td>\n      <td class="align-right">' + (reference ? escapeXml(reference[1]) : '-') + '</td>\n    </tr>\n    <tr>\n      <td>Frais:</td>\n      <td class="align-right">' + (charges ? charges[2] + ' ' + charges[1] : '-') + '</td>\n    </tr>\n    <tr>\n      <td>Montant:</td>\n      <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n    </tr>\n';
}

function getEntrySummary(xml) {
  var amount = xml.match(/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  var charges = xml.match(/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)<\/TtlChrgsAndTaxAmt/);
  var infos = xml.match(/<AddtlNtryInf>(.+)<\/AddtlNtryInf/);

  var bookingDate = getDate(xml, '<BookgDt><Dt>');
  var valutaDate = getDate(xml, '<ValDt><Dt>');

  var details = '';
  var start = 0;
  while (true) {
    start = xml.indexOf('<TxDtls>', start);
    if (start < 0) {
      break;
    }
    start += 8;
    var end = xml.indexOf('</TxDtls>', start);
    if (end < 0) {
      break;
    }
    details += getDetailsSummary(xml.substring(start, end));
  }

  var title = splitLongLine(infos ? infos[1] : '-', 40);

  var html = '\n<table cellpadding="0" cellspacing="0" class="transaction">\n  <caption>\n    <h3>' + title + '</h3>\n  </caption>\n  <tbody>\n    <tr>\n      <td>Total:</td>\n      <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n    </tr>';
  if (charges) {
    html += '\n    <tr>\n      <td>Total des frais:</td>\n      <td class="bold align-right">' + charges[2] + ' ' + charges[1] + '</td>\n    </tr>';
  };
  html += '\n    <tr>\n      <td>Date de comptabilisation:</td>\n      <td class="align-right">' + bookingDate + '</td>\n    </tr>\n    <tr>\n      <td>Date valeur:</td>\n      <td class="align-right">' + valutaDate + '</td>\n    </tr>';
  html += details;
  html += '\n  </tbody>\n</table>';

  return html;
}

/******************************************************************************/

function getBalanceSummary(xml, output) {
  var cd = xml.match(/<Cd>(\w+)<\/Cd>/);
  var amount = xml.match(/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  var date = getDate(xml, '<Dt>');
  if (cd) {
    switch (cd[1]) {
      case 'OPBD':
        output.open = '\n<table cellpadding="0" cellspacing="0" class="balance-open">\n  <tr>\n    <td>Solde d\'ouverture (' + date + ')</td>\n    <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n  </tr>\n</table>';
        break;
      case 'CLBD':
        output.close = '\n<table cellpadding="0" cellspacing="0" class="balance-close">\n<tr>\n  <td>Solde de clôture (' + date + ')</td>\n  <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n</tr>\n</table>';
        break;
    }
  }
}

function getEntriesSummaryNtry(xml, output) {
  var start = 0;

  output.entries = [];

  while (true) {
    start = xml.indexOf('<Ntry>', start);
    if (start < 0) {
      break;
    }
    start += 6;
    var end = xml.indexOf('</Ntry>', start);
    if (end < 0) {
      break;
    }
    var entry = xml.substring(start, end);
    var html = getEntrySummary(entry);
    if (html) {
      output.entries.push(html);
    }
  }
}

function getEntriesSummaryBal(xml, output) {
  var start = 0;
  while (true) {
    start = xml.indexOf('<Bal>', start);
    if (start < 0) {
      break;
    }
    start += 5;
    var end = xml.indexOf('</Bal>', start);
    getBalanceSummary(xml.substring(start, end), output);
  }
}

function getEntriesSummary(xml, output) {
  getEntriesSummaryNtry(xml, output);
  getEntriesSummaryBal(xml, output);
}

function getCustomerAccount(xml) {
  var result = xml.match(/<Acct><Id><IBAN>(CH\d+)/);
  return result && 'IBAN ' + formatIBAN(result[1]) || '-';
}

/******************************************************************************/

function getXmlCamtReport(fileName, title, xml) {
  var output = {};
  var transactions = '';

  getEntriesSummary(xml, output);

  if (output.entries.length) {
    transactions += '<h2 class="">Transactions</h2>';
    output.entries.forEach(function (entry) {
      return transactions += entry + '\n';
    });
  }

  return '\n<table cellpadding="0" cellspacing="0">\n  <caption>\n    <h1>' + title + '</h1>\n  </caption>\n  <tbody>\n    <tr>\n      <td>Fichier:</td>\n      <td>' + escapeXml(fileName) + '</td>\n    </tr>\n    <tr>\n      <td>Date de création:</td>\n      <td>' + getCreationDateTime(xml) + '</td>\n    </tr>\n    <tr>\n      <td>Compte client:</td>\n      <td>' + getCustomerAccount(xml) + '</td>\n    </tr>\n  </tbody>\n</table>\n' + (output.open || '') + '\n' + transactions + '\n' + (output.close || '');
}

function getXmlReport(title, xml) {
  if (xml.indexOf('<Document xmlns="' + xsdCamt53V4 + '" ') > 0) {
    return getXmlCamtReport(title, 'Fichier camt.053 (V4)', xml);
  }
  if (xml.indexOf('<Document xmlns="' + xsdCamt54V4 + '" ') > 0) {
    return getXmlCamtReport(title, 'Fichier camt.054 (V4)', xml);
  }
  return '<h1 class="error">Ce fichier possède un format non reconnu.</h1>';
}

/******************************************************************************/

function handleFileSelect(evt) {
  evt.stopPropagation();
  evt.preventDefault();

  var files = evt.dataTransfer.files;
  var output = document.getElementById('output');

  while (output.firstChild) {
    output.removeChild(output.firstChild);
  }

  var _loop = function _loop() {
    var xml = files[i];
    var article = document.createElement('article');
    var reader = new FileReader();
    reader.onload = function (e) {
      article.innerHTML = getXmlReport(xml.name, e.target.result);
    };
    reader.readAsText(xml);
    output.insertBefore(article, null);

    $('html, body').animate({ scrollTop: 650 }, 1000);
  };

  for (var i = 0; i < files.length; i++) {
    _loop();
  }

  output.style.display = "block";
}

function handleDragOver(evt) {
  evt.stopPropagation();
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'copy';
}

/******************************************************************************/

var dropZone = document.getElementById('drop');

dropZone.addEventListener('dragover', handleDragOver, false);
dropZone.addEventListener('drop', handleFileSelect, false);

/******************************************************************************/