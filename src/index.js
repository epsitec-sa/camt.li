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

function splitLongLine (text, length) {
  let output = '';
  while (text.length > length) {
    output += text.substring (0, length);
    output += '<br/>';
    text = text.substring (40); 
  }
  output += text;
  return output;
}

/******************************************************************************/

const xsdCamt53V2 = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02';
const xsdCamt54V2 = 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.02';
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
  const debtorName = xml.match (/<RltdPties><Dbtr><Nm>([^<]*)<\/Nm>/);
  const remittanceInformation = xml.match (/<RmtInf>(.+)<\/RmtInf>/);
  const debtorFinName = financialInstitution && financialInstitution[1].match (/<Nm>([a-zA-Z0-9_\-.:;+/ ]*)</);
  const reference = remittanceInformation && remittanceInformation[1].match (/<Ref>(.*)<\/Ref>/);
  
  if ((!debtorName) && (!reference) && (!debtorFinName)) {
    return '';
  }

  const debtorAccount = xml.match (/<DbtrAcct><Id><IBAN>([A-Z0-9]+)</);
  const debtorBank1 = debtorName ? escapeXml (debtorName[1]) : '';
  const debtorBank2 = debtorAccount ? debtorAccount[1] : '';
  const debtorDetails = debtorBank1.length ? (debtorBank1 + (debtorBank2.length ? '<br/>' + formatIBAN (debtorBank2) : ''))
                                           : (debtorBank2.length ? formatIBAN (debtorBank2) : '-');

  return `
  </tbody>
</table>
<table cellpadding="0" cellspacing="0" class="transaction details">
  <tbody>
    <tr class="first-detail">
      <td>${T.movement}</td>
      <td class="align-right">${credit ? credit[1] : '-'}</td>
    </tr>
    <tr>
      <td>${T.debtor}</td>
      <td class="align-right">${debtorDetails}</td>
    </tr>
    <tr>
      <td>${T.finInstitute}</td>
      <td class="align-right">${debtorFinName ? escapeXml (debtorFinName[1]) : '-'}</td>
    </tr>
    <tr>
      <td>${T.reference}</td>
      <td class="align-right">${reference ? escapeXml (reference[1]) : '-'}</td>
    </tr>
    <tr>
      <td>${T.charges}</td>
      <td class="align-right">${charges ? `${charges[2]} ${charges[1]}` : '-'}</td>
    </tr>
    <tr>
      <td>${T.amount}</td>
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
  
  const title = splitLongLine (infos ? infos[1] : '-', 40);
  
  let html = `
<table cellpadding="0" cellspacing="0" class="transaction">
  <caption>
    <h3>${title}</h3>
  </caption>
  <tbody>
    <tr>
      <td>${T.total}</td>
      <td class="bold align-right">${amount[2]} ${amount[1]}</td>
    </tr>`;
  if (charges) {
    html += `
    <tr>
      <td>${T.totalCharge}</td>
      <td class="bold align-right">${charges[2]} ${charges[1]}</td>
    </tr>`
  };
  html += `
    <tr>
      <td>${T.dateBooking}</td>
      <td class="align-right">${bookingDate}</td>
    </tr>
    <tr>
      <td>${T.dateValuta}</td>
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
<table cellpadding="0" cellspacing="0" class="balance-open">
  <tr>
    <td>${T.openBalance} (${date})</td>
    <td class="bold align-right">${amount[2]} ${amount[1]}</td>
  </tr>
</table>`;
        break;
      case 'CLBD':
        output.close = `
<table cellpadding="0" cellspacing="0" class="balance-close">
<tr>
  <td>${T.closeBalance} (${date})</td>
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
    transactions += `<h2 class="">${T.transactions}</h2>`;
    output.entries.forEach (entry => transactions += entry + '\n');
  }
  
  return `
<table cellpadding="0" cellspacing="0">
  <caption>
    <h1>${title}</h1>
  </caption>
  <tbody>
    <tr>
      <td>${T.fileName}</td>
      <td>${escapeXml (fileName)}</td>
    </tr>
    <tr>
      <td>${T.creationDate}</td>
      <td>${getCreationDateTime (xml)}</td>
    </tr>
    <tr>
      <td>${T.customerAccount}</td>
      <td>${getCustomerAccount (xml)}</td>
    </tr>
  </tbody>
</table>
${output.open || ''}
${transactions}
${output.close || ''}`;
}

function getXmlReport (title, xml) {
  if (xml.indexOf (`<Document xmlns="${xsdCamt53V2}" `) > 0) {
    return getXmlCamtReport (title, T.camt53V2, xml);
  }
  if (xml.indexOf (`<Document xmlns="${xsdCamt53V4}" `) > 0) {
    return getXmlCamtReport (title, T.camt53V4, xml);
  }
  if (xml.indexOf (`<Document xmlns="${xsdCamt54V2}" `) > 0) {
    return getXmlCamtReport (title, T.camt54V2, xml);
  }
  if (xml.indexOf (`<Document xmlns="${xsdCamt54V4}" `) > 0) {
    return getXmlCamtReport (title, T.camt54V4, xml);
  }
  return `<h1 class="error">${T.undefinedFormat}</h1>`;
}

/******************************************************************************/

function scrollTo (to, duration) {
  const doc       = document.documentElement;
  const body      = document.body;
  const start     = doc.scrollTop;
  const change    = to - start;
  const increment = 20;

  //t = current time
  //b = start value
  //c = change in value
  //d = duration
  function easeInOutQuad (t, b, c, d) {
    t = t / (d / 2);
    if (t < 1) {
      return c / 2 * t * t + b;
    }
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  }

  let currentTime = 0;

  function animateScroll () {
    currentTime += increment;
    const val = easeInOutQuad (currentTime, start, change, duration);
    doc.scrollTop  = val; // for IE
    body.scrollTop = val; // for Chrome
    if (currentTime < duration) {
      setTimeout (animateScroll, increment);
    }
  }
  animateScroll ();
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
    scrollTo (650, 800);
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
