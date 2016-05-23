'use strict';

/******************************************************************************/

function escapeXml (unsafe) {
  return unsafe.replace (/[<>&'"]/g, function (c) {
      switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    });
}

/******************************************************************************/

const xsdCamt53V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04';
const xsdCamt54V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.04';

function formatDate (date) {
  return `${date.substring (8, 10)}/${date.substring (5, 7)}/${date.substring (0, 4)}`;
}
function formatTime (time) {
  return time;
}

function getDateTime (xml, pattern) {
  pattern = `${pattern}(....-..-..)T(..:..:..)<`;
  const result = xml.match (pattern);
  const date = formatDate (result[1]);
  const time = formatTime (result[2]);
  return `${date}, ${time}`;
}

function getDate (xml, pattern) {
  pattern = `${pattern}(....-..-..)<`;
  const result = xml.match (pattern);
  return formatDate (result[1]);
}

function getCreationDateTime (xml) {
  // <CreDtTm>2016-05-06T23:01:15</CreDtTm>
  return getDateTime (xml, '<CreDtTm>');
}

function formatIBAN (iban) {
  let out = '';
  for (let i = 0; i < iban.length; i++) {
    if ((i > 0) && ((i % 4) === 0)) {
      out += ' ';
    }
    out += iban[i];
  }
  return out;
}

function getDetailsSummary (xml) {
  const amount = xml.match (/<Amt Ccy="(...)">(\d+\.\d+)</);
  const charges = xml.match (/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)</);
  const credit = xml.match (/<CdtDbtInd>([A-Z]+)</);
  const financialInstitution = xml.match (/<FinInstnId>(.+)<\/FinInstnId>/);
  const remittanceInformation = xml.match (/<RmtInf>(.+)<\/RmtInf>/);
  const debtorName = financialInstitution && financialInstitution[1].match (/<Nm>([a-zA-Z0-9_\-.:;+/ ]*)</);
  const reference = remittanceInformation && remittanceInformation[1].match (/<Ref>(.*)<\/Ref>/);
  return `<li>
<div>Montant: <strong>${amount[2]} ${amount[1]}</strong></div>
<div>Mouvement: ${credit ? credit[1] : '-'}</div>
<div>Débiteur: ${debtorName ? escapeXml (debtorName[1]) : '-'}</div>
<div>Référence: ${reference ? escapeXml (reference[1]) : '-'}</div>
<div>Frais: ${charges ? `${charges[2]} ${charges[1]}` : '-'}</div>
</li>`;
}

function getEntrySummary (xml) {
  const amount = xml.match (/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  const charges = xml.match (/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)<\/TtlChrgsAndTaxAmt/);
  const infos = xml.match (/<AddtlNtryInf>(.+)<\/AddtlNtryInf/);
  const bookingDate = getDate (xml, '<BookgDt><Dt>');
  const valutaDate = getDate (xml, '<ValDt><Dt>');
  let details = '<ul>';
  let start = 0;
  while (true) {
    start = xml.indexOf ('<TxDtls>', start);
    if (start < 0) {
      break;
    }
    start += 8;
    let end = xml.indexOf ('</TxDtls>', start);
    if (end < 0) {
      break;
    }
    details += getDetailsSummary (xml.substring (start, end));
  }
  details += '</ul>';
  return `<li>
<h2>${infos ? infos[1] : '-'}</h2>
<div>Total: <strong>${amount[2]} ${amount[1]}</strong></div>
<div>Total des frais: ${charges ? `${charges[2]} ${charges[1]}` : '-'}</div>
<div>Date de comptabilisation: ${bookingDate}</div>
<div>Date valeur: ${valutaDate}</div>
${details}
</li>`;
}

function getBalanceSummary (xml) {
  let output = '';
  const cd = xml.match (/<Cd>(\w+)<\/Cd>/);
  const amount = xml.match (/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  const date = getDate (xml, '<Dt>');
  if (cd) {
    switch (cd[1]) {
      case 'OPBD':
        output += `<div>Solde d'ouverture: ${amount[2]} ${amount[1]} (${date})</div>`;
        break;
      case 'CLBD':
        output += `<div>Solde de clôture: ${amount[2]} ${amount[1]} (${date})</div>`;
        break;
    }
  }
  return output;
}

function getEntriesSummary (xml) {
  let count = 0;
  let output = '<ul>';
  let start = 0;
  while (true) {
    start = xml.indexOf ('<Ntry>', start);
    if (start < 0) {
      break;
    }
    start += 6;
    let end = xml.indexOf ('</Ntry>', start);
    if (end < 0) {
      break;
    }
    const entry = xml.substring (start, end);
    output += getEntrySummary (entry);
    count++;
  }
  start = 0;
  while (true) {
    start = xml.indexOf ('<Bal>', start);
    if (start < 0) {
      break;
    }
    start += 5;
    let end = xml.indexOf ('</Bal>', start);
    const balance = getBalanceSummary (xml.substring (start, end));
    if (balance && balance.length > 0) {
      output += balance;
      count++;
    }
  }
  output += '</ul>';
  return count && output;
}

function getCustomerAccount (xml) {
  const result = xml.match (/<Acct><Id><IBAN>(CH\d+)/);
  return result && `IBAN ${formatIBAN (result[1])}` || `-`;
}

function getXmlCamt53V4Report (title, xml) {
  const transactions = getEntriesSummary (xml);
  let output = `
<h1>Fichier camt.053 (V4)</h1>
<div>Fichier: ${escapeXml (title)}</div>
<div>Date de création: ${getCreationDateTime (xml)}</div>
<div>Compte client: ${getCustomerAccount (xml)}</div>`;
  if (transactions) {
    output += `
<div>Transactions: ${transactions}</div>`;
  }
  return output;
}

function getXmlCamt54V4Report (title, xml) {
  const transactions = getEntriesSummary (xml);
  let output = `
<h1>Fichier camt.054 (V4)</h1>
<div>Fichier: ${escapeXml (title)}</div>
<div>Date de création: ${getCreationDateTime (xml)}</div>
<div>Compte client: ${getCustomerAccount (xml)}</div>`;
  if (transactions) {
    output += `
<div>Transactions: ${transactions}</div>`;
  }
  return output;
}

function getXmlReport (title, xml) {
  if (xml.indexOf (`<Document xmlns="${xsdCamt53V4}" `) > 0) {
    return getXmlCamt53V4Report (title, xml);
  }
  if (xml.indexOf (`<Document xmlns="${xsdCamt54V4}" `) > 0) {
    return getXmlCamt54V4Report (title, xml);
  }
  return 'Ce fichier possède un format non reconnu.';
}

/******************************************************************************/

function handleFileSelect (evt) {
  evt.stopPropagation ();
  evt.preventDefault ();

  const files = evt.dataTransfer.files;
  const output = document.getElementById ('list');

  while (output.firstChild) {
    output.removeChild (output.firstChild);
  }

  for (var i = 0; i < files.length; i++) {
    const xml = files[i];
    const li = document.createElement ('li');
    output.insertBefore (li, null);
    const reader = new FileReader ();
    reader.onload = e => {
        li.innerHTML = `<div>${getXmlReport (xml.name, e.target.result)}</div>`;
      };
    reader.readAsText (xml);
  }
}

function handleDragOver (evt) {
  evt.stopPropagation ();
  evt.preventDefault ();
  evt.dataTransfer.dropEffect = 'copy';
}

/******************************************************************************/

var dropZone = document.getElementById ('drop');

dropZone.addEventListener ('dragover', handleDragOver, false);
dropZone.addEventListener ('drop', handleFileSelect, false);

/******************************************************************************/
