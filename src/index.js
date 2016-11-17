'use strict';

var parseString = require('xml2js').parseString;
/******************************************************************************/

function escapeXml (unsafe) {
  if (unsafe) {
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
}

function splitLongLine (text, length) {
  if (text && length) {
    let output = '';
    while (text.length > length) {
      output += text.substring (0, length);
      output += '<br/>';
      text = text.substring (40);
    }
    output += text;
    return output;
  }
}

function _(getElementAction) {
  try {
    return getElementAction ();
  }
  catch(err) {
    return null;
  }
}

/******************************************************************************/
const camtXsds = {
  '53V2': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02',
  '54V2': 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.02',
  '53V4': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04',
  '54V4': 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.04'
};


function formatDate (date) {
  if (date) {
    return `${date.substring (8, 10)}/${date.substring (5, 7)}/${date.substring (0, 4)}`;
  }
}
function formatTime (time) {
  return time;
}

function getDateTime (xml) {
  if (xml) {
    var pattern = `(....-..-..)T(..:..:..)`;
    const result = xml.match (pattern);
    const date = formatDate (result[1]);
    const time = formatTime (result[2]);
    return `${date}, ${time}`;
  }
}

function getDate (xml) {
  if (xml) {
    var pattern = `(....-..-..)`;
    const result = xml.match (pattern);
    return formatDate (result[1]);
  }
}

function getCreationDateTime (header) {
  // <CreDtTm>2016-05-06T23:01:15</CreDtTm>
  return getDateTime (_(() => header.CreDtTm[0])) || '-';
}

function formatIBAN (iban) {
  if (iban) {
    let out = '';
    for (let i = 0; i < iban.length; i++) {
      if ((i > 0) && ((i % 4) === 0)) {
        out += ' ';
      }
      out += iban[i];
    }
    return out;
  }
}

function getDetailsSummary (xml) {
  const amount = xml.match (/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*</);
  const charges = xml.match (/<TtlChrgsAndTaxAmt Ccy="(...)">\s*([\-0-9\.]+)\s*</);
  const credit = xml.match (/<CdtDbtInd>\s*([A-Z]+)\s*</);
  const financialInstitution = xml.match (/<FinInstnId>\s*(.+)\s*<\/FinInstnId>/);
  const debtorName = xml.match (/<RltdPties>\s*<Dbtr>\s*<Nm>\s*([^<]*)\s*<\/Nm>/);
  const remittanceInformation = xml.match (/<RmtInf>\s*(.+)\s*<\/RmtInf>/);
  const debtorFinName = financialInstitution && financialInstitution[1].match (/<Nm>\s*([a-zA-Z0-9_\-.:;+/ ]*)\s*</);
  const reference = remittanceInformation && remittanceInformation[1].match (/<Ref>\s*(.*)\s*<\/Ref>/);

  if ((!debtorName) && (!reference) && (!debtorFinName)) {
    return '';
  }

  const debtorAccount = xml.match (/<DbtrAcct>\s*<Id>\s*<IBAN>\s*([A-Z0-9]+)\s*</);
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
  const amount  = xml.match (/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/Amt/);
  const charges = xml.match (/<TtlChrgsAndTaxAmt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/TtlChrgsAndTaxAmt/);
  const infos   = xml.match (/<AddtlNtryInf>\s*(.+)\s*<\/AddtlNtryInf/);

  const bookingDate = getDate (xml, '<BookgDt>\\s*<Dt>\\s*');
  const valutaDate  = getDate (xml, '<ValDt>\\s*<Dt>\\s*');

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
  const cd = xml.match (/<Cd>\s*(\w+)\s*<\/Cd>/);
  const amount = xml.match (/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/Amt/);
  const date = getDate (xml, '<Dt>\\s*');
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
  //getEntriesSummaryNtry (xml, output);
  //getEntriesSummaryBal (xml, output);
}

function getCustomerAccount (xml) {
  /*const result = xml.match (/<Acct>\s*<Id>\s*<IBAN>\s*(CH\d+)/);
  return result && `IBAN ${formatIBAN (result[1])}` || `-`;*/
  return null;
}

/******************************************************************************/

function getXmlCamtReport (fileName, title, aLevel) {
  let output = {};
  let transactions = '';
  let bLevel = (aLevel.Ntfctn || aLevel.Stmt)[0];

  if (bLevel) {
    getEntriesSummary (bLevel, output);

    /*if (output.entries.length) {
      transactions += `<h2 class="">${T.transactions}</h2>`;
      output.entries.forEach (entry => transactions += entry + '\n');
    }*/

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
            <td>${getCreationDateTime (aLevel.GrpHdr[0])}</td>
          </tr>
          <tr>
            <td>${T.customerAccount}</td>
            <td>${getCustomerAccount (bLevel)}</td>
          </tr>
        </tbody>
      </table>

    ${output.open || ''}
    ${transactions}
    ${output.close || ''}`;
  }
}

function getXmlReport (title, xml, callback) {
  parseString(xml, function (err, result) {
    console.dir(result);

    if (err) {
      callback (err);
    }

    for (var schema of Object.keys (camtXsds)) {
      if (result.Document.$.xmlns === camtXsds[schema]) {
        try {
          var aLevel = result.Document.BkToCstmrStmt || result.Document.BkToCstmrDbtCdtNtfctn;
          var html = getXmlCamtReport (title, T['camt' + schema], aLevel[0]);
          callback (null, html);
        }
        catch (ex) {
          callback (ex, `<h1 class="error">${T.undefinedFormat}</h1>`);
        }
        finally {
          return;
        }
      }
    }

    callback (null, `<h1 class="error">${T.undefinedFormat}</h1>`);
  });
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
        getXmlReport (xml.name, e.target.result, (err, html) => {
          if (err) {
            console.dir (err);
          }
          article.innerHTML = html;
        });
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
