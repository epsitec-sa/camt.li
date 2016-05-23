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
  var remittanceInformation = xml.match(/<RmtInf>(.+)<\/RmtInf>/);
  var debtorName = financialInstitution && financialInstitution[1].match(/<Nm>([a-zA-Z0-9_\-.:;+/ ]*)</);
  var reference = remittanceInformation && remittanceInformation[1].match(/<Ref>(.*)<\/Ref>/);
  return '<li>\n<div>Montant: <strong>' + amount[2] + ' ' + amount[1] + '</strong></div>\n<div>Mouvement: ' + (credit ? credit[1] : '-') + '</div>\n<div>Débiteur: ' + (debtorName ? debtorName[1] : '-') + '</div>\n<div>Référence: ' + (reference ? reference[1] : '-') + '</div>\n<div>Frais: ' + (charges ? charges[2] + ' ' + charges[1] : '-') + '</div>\n</li>';
}

function getEntrySummary(xml) {
  var amount = xml.match(/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  var charges = xml.match(/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)<\/TtlChrgsAndTaxAmt/);
  var infos = xml.match(/<AddtlNtryInf>(.+)<\/AddtlNtryInf/);
  var bookingDate = getDate(xml, '<BookgDt><Dt>');
  var valutaDate = getDate(xml, '<ValDt><Dt>');
  var details = '<ul>';
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
  details += '</ul>';
  return '<li>\n<h2>' + (infos ? infos[1] : '-') + '</h2>\n<div>Total: <strong>' + amount[2] + ' ' + amount[1] + '</strong></div>\n<div>Total des frais: ' + (charges ? charges[2] + ' ' + charges[1] : '-') + '</div>\n<div>Date de comptabilisation: ' + bookingDate + '</div>\n<div>Date valeur: ' + valutaDate + '</div>\n' + details + '\n</li>';
}

function getEntriesSummary(xml) {
  var count = 0;
  var start = 0;
  var output = '<ul>';
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
    output += getEntrySummary(entry);
    count++;
  }
  output += '</ul>';
  return count && output;
}

function getCustomerAccount(xml) {
  var result = xml.match(/<Acct><Id><IBAN>(CH\d+)/);
  return result && 'IBAN ' + formatIBAN(result[1]) || '-';
}

function getXmlCamt53V4Report(title, xml) {
  var transactions = getEntriesSummary(xml);
  var output = '\n<h1>Fichier camt.053 (V4)</h1>\n<div>Fichier: ' + title + '</div>\n<div>Date de création: ' + getCreationDateTime(xml) + '</div>\n<div>Compte client: ' + getCustomerAccount(xml) + '</div>';
  if (transactions) {
    output += '\n<div>Transactions: ' + transactions + '</div>';
  }
  return output;
}

function getXmlCamt54V4Report(title, xml) {
  var transactions = getEntriesSummary(xml);
  var output = '\n<h1>Fichier camt.054 (V4)</h1>\n<div>Fichier: ' + title + '</div>\n<div>Date de création: ' + getCreationDateTime(xml) + '</div>\n<div>Compte client: ' + getCustomerAccount(xml) + '</div>';
  if (transactions) {
    output += '\n<div>Transactions: ' + transactions + '</div>';
  }
  return output;
}

function getXmlReport(title, xml) {
  if (xml.indexOf('<Document xmlns="' + xsdCamt53V4 + '" ') > 0) {
    return getXmlCamt53V4Report(title, xml);
  }
  if (xml.indexOf('<Document xmlns="' + xsdCamt54V4 + '" ') > 0) {
    return getXmlCamt54V4Report(title, xml);
  }
  return 'Ce fichier possède un format non reconnu.';
}

/******************************************************************************/

function handleFileSelect(evt) {
  evt.stopPropagation();
  evt.preventDefault();

  var files = evt.dataTransfer.files;
  var output = document.getElementById('list');

  while (output.firstChild) {
    output.removeChild(output.firstChild);
  }

  var _loop = function _loop() {
    var xml = files[i];
    var li = document.createElement('li');
    output.insertBefore(li, null);
    var reader = new FileReader();
    reader.onload = function (e) {
      li.innerHTML = '<div>' + getXmlReport(xml.name, e.target.result) + '</div>';
    };
    reader.readAsText(xml);
  };

  for (var i = 0; i < files.length; i++) {
    _loop();
  }
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