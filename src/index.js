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
  return `
<tr>
  <td>Mouvement:</td>
  <td>${credit ? credit[1] : '-'}</td>
</tr>
<tr>
  <td>Débiteur:</td>
  <td>${debtorName ? escapeXml (debtorName[1]) : '-'}</td>
</tr>
<tr>
  <td>Référence:</td>
  <td>${reference ? escapeXml (reference[1]) : '-'}</td>
</tr>
<tr>
  <td>Frais:</td>
  <td class="align-right">${charges ? `${charges[2]} ${charges[1]}` : '-'}</td>
</tr>
<tr>
  <td>Montant:</td>
  <td class="bold align-right">${amount[2]} ${amount[1]}</td>
</tr>
`;
}

function getEntrySummary (xml) {
  const amount  = xml.match (/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  const charges = xml.match (/<TtlChrgsAndTaxAmt Ccy="(...)">(\d+\.\d+)<\/TtlChrgsAndTaxAmt/);
  const infos   = xml.match (/<AddtlNtryInf>(.+)<\/AddtlNtryInf/);
  
  const bookingDate = getDate (xml, '<BookgDt><Dt>');
  const valutaDate  = getDate (xml, '<ValDt><Dt>');
  
  let details = '';
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
  
  const title = infos ? infos[1] : '-';
  
  let html = `
<table cellpadding="0" cellspacing="0" class="transaction">
  <caption style="text-align: left;">
    <h3>${title}</h3>
  </caption>
  <tbody>
    <tr>
      <td>Total:</td>
      <td class="bold align-right">${amount[2]} ${amount[1]}</td>
    </tr>`;
  if (charges) {
    html += `
    <tr>
      <td>Total des frais:</td>
      <td class="bold align-right">${charges[2]} ${charges[1]}</td>
    </tr>`
  };
  html += `
    <tr>
      <td>Date de comptabilisation:</td>
      <td class="align-right">${bookingDate}</td>
    </tr>
    <tr>
      <td>Date valeur:</td>
      <td class="align-right">${valutaDate}</td>
    </tr>`;
 html += details;
 html += `
  </tbody>
</table>`;

   return html;
}

/******************************************************************************/

function getBalanceSummary (xml, output) {
  const cd = xml.match (/<Cd>(\w+)<\/Cd>/);
  const amount = xml.match (/<Amt Ccy="(...)">(\d+\.\d+)<\/Amt/);
  const date = getDate (xml, '<Dt>');
  if (cd) {
    switch (cd[1]) {
      case 'OPBD':
        output.open = `
<table cellpadding="0" cellspacing="0" class="solde_ouverture" style="font-size: 1.5em;">
  <tr>
    <td>Solde d'ouverture (${date})</td>
    <td class="bold align-right">${amount[2]} ${amount[1]}</td>
  </tr>
</table>`;
        break;
      case 'CLBD':
        output.close = `
<table cellpadding="0" cellspacing="0" class="solde_fermeture" style="font-size: 1.5em;">
<tr>
  <td>Solde de clôture (${date})</td>
  <td class="bold align-right">${amount[2]} ${amount[1]}</td>
</tr>
</table>`;
        break;
    }
  }
}

function getEntriesSummaryNtry (xml, output) {
  let start = 0;
  
  output.entries = [];
  
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
    const html  = getEntrySummary (entry);
    if (html) {
      output.entries.push (html);
    }
  }
}

function getEntriesSummaryBal (xml, output) {
  let start = 0;
  while (true) {
    start = xml.indexOf ('<Bal>', start);
    if (start < 0) {
      break;
    }
    start += 5;
    let end = xml.indexOf ('</Bal>', start);
    getBalanceSummary (xml.substring (start, end), output);
  }
}

function getEntriesSummary (xml, output) {
  getEntriesSummaryNtry (xml, output);
  getEntriesSummaryBal (xml, output);
}

function getCustomerAccount (xml) {
  const result = xml.match (/<Acct><Id><IBAN>(CH\d+)/);
  return result && `IBAN ${formatIBAN (result[1])}` || `-`;
}

/******************************************************************************/

function getXmlCamtReport (fileName, title, xml) {
  let output = {};
  let transactions = '';
  
  getEntriesSummary (xml, output);
  
  if (output.entries.length) {
    transactions += `<h2 class="">Transactions</h2>`;
    output.entries.forEach (entry => transactions += entry + '\n');
  }
  
  return `
<table cellpadding="0" cellspacing="0">
  <caption>
    <h1>${title}</h1>
  </caption>
  <tbody>
    <tr>
      <td>Fichier:</td>
      <td>${escapeXml (fileName)}</td>
    </tr>
    <tr>
      <td>Date de création:</td>
      <td>${getCreationDateTime (xml)}</td>
    </tr>
    <tr>
      <td>Compte client:</td>
      <td>${getCustomerAccount (xml)}</td>
    </tr>
  </tbody>
</table>
${output.open || ''}
${transactions}
${output.close || ''}`;
}

function getXmlReport (title, xml) {
  if (xml.indexOf (`<Document xmlns="${xsdCamt53V4}" `) > 0) {
    return getXmlCamtReport (title, 'Fichier camt.053 (V4)', xml);
  }
  if (xml.indexOf (`<Document xmlns="${xsdCamt54V4}" `) > 0) {
    return getXmlCamtReport (title, 'Fichier camt.054 (V4)', xml);
  }
  return `<h1 class="error">Ce fichier possède un format non reconnu.</h1>`;
}

/******************************************************************************/

function handleFileSelect (evt) {
  evt.stopPropagation ();
  evt.preventDefault ();

  const files = evt.dataTransfer.files;
  const output = document.getElementById ('output');

  while (output.firstChild) {
    output.removeChild (output.firstChild);
  }

  for (var i = 0; i < files.length; i++) {
    const xml     = files[i];
    const article = document.createElement ('article');
    const reader  = new FileReader ();
    reader.onload = e => {
        article.innerHTML = getXmlReport (xml.name, e.target.result);
      };
    reader.readAsText (xml);
    output.insertBefore (article, null);
    
    $('html, body').animate ({scrollTop: 650}, 1000);
  }
  
  output.style.display = "block";
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
