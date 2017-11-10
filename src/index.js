/* global require T console document window setTimeout FileReader */
/* eslint no-console: 0 */

require ('babel-polyfill');

var parseString = require ('xml2js').parseString;
var escapeXml = require ('./utils.js').escapeXml;
var splitLongLine = require ('./utils.js').splitLongLine;
var readStorageValue = require ('./utils.js').readStorageValue;
var writeStorageValue = require ('./utils.js').writeStorageValue;
var _ = require ('./utils.js')._;
var getDateTime = require ('./utils.js').getDateTime;
var formatAmount = require ('./utils.js').formatAmount;
var base64toBlob = require ('./utils.js').base64toBlob;
var getDate = require ('./utils.js').getDate;
var generateV11 = require ('./v11.js').generateV11;
var JSZip = require ('jszip');

const camtXsds = {
  '53V2': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02',
  '54V2': 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.02',
  '53V4': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04',
  '54V4': 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.04',
};

let v11Xmls = [];

function readV11Type () {
  return readStorageValue ('v11Type', '4');
}

function writeV11Type (value) {
  writeStorageValue ('v11Type', value);
}

function readV11CrLf () {
  return readStorageValue ('v11CrLf', 'on');
}

function writeV11CrLf (value) {
  writeStorageValue ('v11CrLf', value);
}

function getCreationDateTime (header) {
  // <CreDtTm>2016-05-06T23:01:15</CreDtTm>
  return getDateTime (_ (() => header.CreDtTm[0])) || '-';
}

function getTransactionsNo (bLevel) {
  let transactions = 0;

  for (var entry of bLevel.Ntry || []) {
    for (var entryDetails of entry.NtryDtls || []) {
      transactions += parseInt (
        _ (() => entryDetails.Btch[0].NbOfTxs[0]) ||
          _ (() => entryDetails.TxDtls.length) ||
          0
      );
    }
  }

  return transactions;
}

function formatBankTransactionType (bankTransactionCode) {
  if (bankTransactionCode) {
    switch (bankTransactionCode) {
      case 'CDPT':
        return T.cdpt;
      case 'DMCT':
        return T.dmct;
      case 'AUTT':
        return T.autt;
      case 'ATXN':
        return T.atxn;
      case 'VCOM':
        return T.vcom;
      case 'CAJT':
        return T.cajt;
      default:
        return bankTransactionCode;
    }
  }
}

function formatIBAN (iban) {
  if (iban) {
    let out = '';
    for (let i = 0; i < iban.length; i++) {
      if (i > 0 && i % 4 === 0) {
        out += ' ';
      }
      out += iban[i];
    }
    return out;
  }
}

function formatCredit (credit) {
  if (credit) {
    switch (credit) {
      case 'CRDT':
        return T.credit;
      case 'DBIT':
        return T.debt;
    }
  }
}

function getDetailsSummary (details, bvrsInfo) {
  const amount = formatAmount (_ (() => details.Amt[0]._));
  const currency = _ (() => details.Amt[0].$.Ccy);
  const chargesAmount = formatAmount (
    _ (() => details.Chrgs[0].TtlChrgsAndTaxAmt[0]._) ||
      _ (() => details.Chrgs[0].Rcrd[0].Amt[0]._)
  );
  const chargesCurrency =
    _ (() => details.Chrgs[0].TtlChrgsAndTaxAmt[0].$.Ccy) ||
    _ (() => details.Chrgs[0].Rcrd[0].Amt[0].$.Ccy);
  const credit = _ (() => details.CdtDbtInd[0]);
  const debtorName = _ (() => details.RltdPties[0].Dbtr[0].Nm[0]);
  const debtorFinName = _ (
    () => details.RltdAgts[0].DbtrAgt[0].FinInstnId[0].Nm[0]
  );
  const reference = _ (() => details.RmtInf[0].Strd[0].CdtrRefInf[0].Ref[0]);
  const paymentMode = formatBankTransactionType (
    _ (() => details.BkTxCd[0].Domn[0].Fmly[0].SubFmlyCd[0])
  );

  if (!debtorName && !reference && !debtorFinName) {
    return '';
  }

  const debtorAccount = _ (
    () => details.RltdPties[0].DbtrAcct[0].Id[0].IBAN[0]
  );
  const debtorBank1 = escapeXml (debtorName) || '';
  const debtorBank2 = debtorAccount || '';
  const debtorDetails = debtorBank1.length
    ? debtorBank1 +
        (debtorBank2.length ? '<br/>' + formatIBAN (debtorBank2) : '')
    : debtorBank2.length ? formatIBAN (debtorBank2) : '-';

  if (reference) {
    bvrsInfo.count = bvrsInfo.count + 1; // It is an ESR transaction
  }

  return `
  </tbody>
</table>
<table cellpadding="0" cellspacing="0" class="transaction details">
  <tbody>
    <tr class="first-detail">
      <td>${T.movement}</td>
      <td class="align-right">${formatCredit (credit) || '-'}</td>
    </tr>
    <tr>
      <td>${T.debtor}</td>
      <td class="align-right">${debtorDetails}</td>
    </tr>
    <tr>
      <td>${T.finInstitute}</td>
      <td class="align-right">${escapeXml (debtorFinName) || '-'}</td>
    </tr>
    <tr>
      <td>${T.reference}</td>
      <td class="align-right">${escapeXml (reference) || '-'}</td>
    </tr>
    <tr>
      <td>${T.charges}</td>
      <td class="align-right">${`${chargesAmount || '-'} ${chargesCurrency || ''}`}</td>
    </tr>
    <tr>
      <td>${T.paymentMode}</td>
      <td class="align-right">${escapeXml (paymentMode) || '-'}</td>
    </tr>
    <tr>
      <td>${T.amount}</td>
      <td class="bold align-right">${amount || '-'} ${currency || ''}</td>
    </tr>
`;
}

function getEntrySummary (entry, bvrsInfo) {
  const amount = formatAmount (_ (() => entry.Amt[0]._));
  const currency = _ (() => entry.Amt[0].$.Ccy);
  const chargesAmount = formatAmount (
    _ (() => entry.Chrgs[0].TtlChrgsAndTaxAmt[0]._) ||
      _ (() => entry.Chrgs[0].Rcrd[0].Amt[0]._)
  );
  const chargesCurrency =
    _ (() => entry.Chrgs[0].TtlChrgsAndTaxAmt[0].$.Ccy) ||
    _ (() => entry.Chrgs[0].Rcrd[0].Amt[0].$.Ccy);
  const infos = _ (() => entry.AddtlNtryInf[0]);

  const bookingDate = getDate (_ (() => entry.BookgDt[0].Dt[0]));
  const valutaDate = getDate (_ (() => entry.ValDt[0].Dt[0]));

  const origAmount = _ (() => entry.AmtDtls[0].TxAmt[0].Amt[0]._);
  const origCurrency = _ (() => entry.AmtDtls[0].TxAmt[0].Amt[0].$.Ccy);
  const exchangeRate = _ (
    () => entry.AmtDtls[0].TxAmt[0].CcyXchg[0].XchgRate[0]
  );

  let details = '';

  for (var entryDetails of entry.NtryDtls || []) {
    for (var txDetails of entryDetails.TxDtls || []) {
      details += getDetailsSummary (txDetails, bvrsInfo);
    }
  }

  const title = splitLongLine (infos || '-', 40);

  let html = `
<table cellpadding="0" cellspacing="0" class="transaction">
  <caption>
    <h3>${title}</h3>
  </caption>
  <tbody>
    <tr>
      <td>${T.total}</td>
      <td class="bold align-right">${amount || '-'} ${currency || ''}</td>
    </tr>`;

  if (chargesAmount && chargesCurrency) {
    html += `
    <tr>
      <td>${T.totalCharge}</td>
      <td class="bold align-right">${chargesAmount || '-'} ${chargesCurrency || ''}</td>
    </tr>`;
  }

  if (origAmount && origCurrency && exchangeRate) {
    html += `
    <tr>
      <td>${T.origAmount}</td>
      <td class="bold align-right">${origAmount || '-'} ${origCurrency || ''}</td>
    </tr>
    <tr>
      <td>${T.exchangeRate}</td>
      <td class="bold align-right">${exchangeRate || '-'}</td>
    </tr>`;
  }

  html += `
    <tr>
      <td>${T.dateBooking}</td>
      <td class="align-right">${bookingDate || '-'}</td>
    </tr>
    <tr>
      <td>${T.dateValuta}</td>
      <td class="align-right">${valutaDate || '-'}</td>
    </tr>`;
  html += details;
  html += `
  </tbody>
</table>`;

  return html;
}

/******************************************************************************/

function getBalanceSummary (balance, output) {
  if (balance) {
    const cd = _ (() => balance.Tp[0].CdOrPrtry[0].Cd[0]);
    const amount = formatAmount (_ (() => balance.Amt[0]._));
    const currency = _ (() => balance.Amt[0].$.Ccy);
    const date = getDate (_ (() => balance.Dt[0].Dt[0]));
    if (cd) {
      switch (cd) {
        case 'OPBD':
          output.open = `
  <table cellpadding="0" cellspacing="0" class="balance-open">
    <tr>
      <td>${T.openBalance} (${date || '-'})</td>
      <td class="bold align-right">${amount || '-'} ${currency || ''}</td>
    </tr>
  </table>`;
          break;
        case 'CLBD':
          output.close = `
  <table cellpadding="0" cellspacing="0" class="balance-close">
  <tr>
    <td>${T.closeBalance} (${date || '-'})</td>
    <td class="bold align-right">${amount || '-'} ${currency || ''}</td>
  </tr>
  </table>`;
          break;
      }
    }
  }
}

function getEntriesSummaryNtry (bLevel, output) {
  output.entries = [];
  output.bvrsInfo = {count: 0};

  for (var entry of bLevel.Ntry || []) {
    const html = getEntrySummary (entry, output.bvrsInfo);
    if (html) {
      output.entries.push (html);
    }
  }
}

function getEntriesSummaryBal (bLevel, output) {
  getBalanceSummary (_ (() => bLevel.Bal[0]), output);
  getBalanceSummary (_ (() => bLevel.Bal[1]), output);
}

function getEntriesSummary (bLevel, output) {
  getEntriesSummaryNtry (bLevel, output);
  getEntriesSummaryBal (bLevel, output);
}

function getCustomerAccount (bLevel) {
  const iban = formatIBAN (_ (() => bLevel.Acct[0].Id[0].IBAN[0]));
  return iban ? `IBAN ${iban}` : '-';
}

/******************************************************************************/

function getXmlCamtReport (fileName, title, aLevel) {
  let output = {};
  let transactions = '';
  let bLevel = (aLevel.Ntfctn || aLevel.Stmt)[0];

  if (bLevel) {
    getEntriesSummary (bLevel, output);

    if (output.entries.length) {
      transactions += `<h2 class="">${T.transactions}</h2>`;
      output.entries.forEach (entry => (transactions += entry + '\n'));
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
            <td>${getCreationDateTime (aLevel.GrpHdr[0])}</td>
          </tr>
          <tr>
            <td>${T.customerAccount}</td>
            <td>${getCustomerAccount (bLevel)}</td>
          </tr>
          <tr>
            <td>${T.transactionsNo}</td>
            <td>${getTransactionsNo (bLevel)}</td>
          </tr>
          <tr>
            <td>${T.incomesNo}</td>
            <td>${output.bvrsInfo.count}</td>
          </tr>
        </tbody>
      </table>

    ${output.open || ''}
    ${transactions}
    ${output.close || ''}`;
  }
}

function getXmlReport (title, xml, callback) {
  parseString (xml, function (err, result) {
    if (err) {
      callback (err);
    }

    for (var schema of Object.keys (camtXsds)) {
      if (result.Document.$.xmlns === camtXsds[schema]) {
        try {
          var aLevel =
            result.Document.BkToCstmrStmt ||
            result.Document.BkToCstmrDbtCdtNtfctn;
          var html = getXmlCamtReport (title, T['camt' + schema], aLevel[0]);

          callback (null, html, result.Document);
        } catch (ex) {
          callback (ex, `<h1 class="error">${T.undefinedFormat}</h1>`);
        } finally {
          /* eslint no-unsafe-finally: 0 */
          return;
        }
      }
    }

    console.log (
      'Warning: namespace of document is ' + result.Document.$.xmlns
    );
    callback (null, `<h1 class="error">${T.undefinedFormat}</h1>`);
  });
}

/******************************************************************************/

function scrollTo (to, duration) {
  const doc = document.documentElement;
  const body = document.body;
  const start = doc.scrollTop;
  const change = to - start;
  const increment = 20;

  // t = current time
  // b = start value
  // c = change in value
  // d = duration
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
    doc.scrollTop = val; // for IE
    body.scrollTop = val; // for Chrome
    if (currentTime < duration) {
      setTimeout (animateScroll, increment);
    }
  }
  animateScroll ();
}

/******************************************************************************/
function getDownloadLinkProperties (v11Files, callback) {
  if (v11Files.length === 1) {
    var blob = new Blob ([v11Files[0].content], {type: 'text/plain'});
    callback (null, blob, v11Files[0].name);
  } else {
    var zip = new JSZip ();

    for (var file of v11Files) {
      zip.file (file.name, file.content);
    }

    zip.generateAsync ({type: 'base64'}).then (content => {
      var blob = base64toBlob (content);
      callback (null, blob, 'files.zip');
    });
  }

  return;
}

function showErrorBox (errors) {
  document.getElementById ('errorMessage').style.display = 'inline';

  for (var error of errors) {
    document.getElementById ('message' + error.error).style.display = 'inline';
  }
}

function hideErrorBox () {
  document.getElementById ('errorMessage').style.display = 'none';

  document.getElementById ('messageUnknown').style.display = 'none';
  document.getElementById ('messageMissingBvrNumber').style.display = 'none';
  document.getElementById ('messageMissingRefs').style.display = 'none';
}

function generateFiles () {
  hideErrorBox ();

  const type = readV11Type ();
  const separator = readV11CrLf () === 'on' ? '\r\n' : '';
  var errors = [];

  const v11Files = v11Xmls.map (xml => {
    var result = generateV11 (xml.content, type, separator);
    errors = errors.concat (result.errors);

    return {
      name: xml.name + '.v11',
      content: result.content,
    };
  });

  if (errors.length > 0) {
    showErrorBox (errors);
  }

  getDownloadLinkProperties (v11Files, (err, blob, name) => {
    if (err) {
      console.log (err);
    } else {
      if (window.navigator.msSaveBlob) {
        window.navigator.msSaveBlob (blob, name);
      } else {
        const href = window.URL.createObjectURL (blob);
        const dlink = document.createElement ('a');
        document.body.appendChild (dlink);
        dlink.download = name;
        dlink.href = href;
        dlink.onclick = function () {
          // revokeObjectURL needs a delay to work properly
          setTimeout (() => window.URL.revokeObjectURL (this.href), 1500);
        };

        dlink.click ();
        document.body.removeChild (dlink);
        dlink.remove ();
      }
    }
  });
}

function getDownloadLinkHtml () {
  if (v11Xmls.length === 0) {
    return '';
  } else {
    var typeChoice = readV11Type ();
    var crLfChoice = readV11CrLf ();
    console.log ('crlf: ' + crLfChoice);

    return `
      <div id="downloadV11Container">
        <div id="v11-type">
          <button class="accordion">${T.parameters}</button>
          <div class="panel">
            <form>
              <table>
                <tr>
                  <td class="typeButton" style="width: 20%;">
                      <input type="radio" name="type" value="3-100" id="type-3-100" ${typeChoice === '3-100' ? 'checked' : ''}>
                      <label for="type-3-100">${T.type3} / 100</label>
                  </td>
                  <td class="typeButton" style="width: 20%;">
                      <input type="radio" name="type" value="3-128" id="type-3-128" ${typeChoice === '3-128' ? 'checked' : ''}>
                      <label for="type-3-128">${T.type3} / 128</label>
                  </td>
                  <td class="typeButton" style="width: 10%;">
                      <input type="radio" name="type" value="4" id="type-4" ${typeChoice === '4' ? 'checked' : ''}>
                      <label for="type-4">${T.type4}</label>
                  </td>
                  <td style="width: 10%; border-right: 1px solid #ddd;"></td>
                  <td style="width: 10%;"></td>
                  <td class="typeButton" style="width: 10%;">
                      <input type="radio" name="crlf" value="on" id="crlf-on" ${crLfChoice === 'on' ? 'checked' : ''}>
                      <label for="crlf-on">${T.withCrLf}</label>
                  </td>
                  <td class="typeButton" style="width: 20%;">
                      <input type="radio" name="crlf" value="off" id="crlf-off" ${crLfChoice === 'off' ? 'checked' : ''}>
                      <label for="crlf-off">${T.withoutCrLf}</label>
                  </td>
                </tr>
              </table>
            </form>
          </div>
        </div>
        <div id="downloadV11Wrapper"><div id="downloadV11">${T.downloadV11}</div></div>
        <div id="errorMessage">
          <div class="wrap">
            <h3 id="messageTitle" >${T.errorMessageTitle}</h3>
            <p id="messageUnknown" >${T.errorMessageUnknown}</p><br />
            <p id="messageMissingBvrNumber" >${T.errorMessageMissingBvrNumber}</p><br />
            <p id="messageMissingRefs" >${T.errorMessageMissingRefs}</p>
          </div>
        </div>
      </div>
    `;
  }
}

function accordion () {
  var acc = document.getElementsByClassName ('accordion');
  var i;

  for (i = 0; i < acc.length; i++) {
    acc[i].onclick = function () {
      this.classList.toggle ('active');
      var panel = this.nextElementSibling;
      if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    };
  }
}

function handleFileSelect (evt) {
  evt.stopPropagation ();
  evt.preventDefault ();

  console.log ('Starting processing');

  v11Xmls = [];
  const files = evt.dataTransfer.files;
  const output = document.getElementById ('output');

  while (output.firstChild) {
    output.removeChild (output.firstChild);
  }

  const v11DownloadLink = document.createElement ('v11downloadlink');
  output.insertBefore (v11DownloadLink, null);

  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    const article = document.createElement ('article');
    const reader = new FileReader ();
    reader.onload = e => {
      getXmlReport (file.name, e.target.result, (err, html, xml) => {
        if (err) {
          console.log (err);
        }

        if (xml && xml !== '') {
          v11Xmls.push ({
            name: file.name,
            content: xml,
          });
        }

        article.innerHTML = html;
        v11DownloadLink.innerHTML = getDownloadLinkHtml ();

        try {
          accordion ();

          const downloadV11 = document.getElementById ('downloadV11');
          downloadV11.addEventListener ('click', generateFiles, false);

          const typeChoices = Array.from (document.getElementsByName ('type'));

          typeChoices.forEach (choice => {
            choice.addEventListener (
              'click',
              () => writeV11Type (choice.value),
              false
            );
          });

          const crLfChoices = Array.from (document.getElementsByName ('crlf'));
          crLfChoices.forEach (choice => {
            choice.addEventListener (
              'click',
              () => writeV11CrLf (choice.value),
              false
            );
          });
        } catch (ex) {
          console.log (ex);
        }
      });
    };
    reader.readAsText (file);
    output.insertBefore (article, null);
    scrollTo (650, 800);
  }

  output.style.display = 'block';
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
