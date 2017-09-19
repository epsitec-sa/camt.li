'use strict';

require ('babel-polyfill');
var parseString = require ('xml2js').parseString;
var escapeXml = require ('./utils.js').escapeXml;
var splitLongLine = require ('./utils.js').splitLongLine;
var _ = require ('./utils.js')._;
var getDateTime = require ('./utils.js').getDateTime;
var formatAmount = require ('./utils.js').formatAmount;
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
      case 'DEBT':
        return t.debt;
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

  if (credit === 'CRDT' && reference) {
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
    callback (
      null,
      `data:text/plain;charset=utf-8,${encodeURIComponent (v11Files[0].content)}`,
      v11Files[0].name
    );
  } else {
    var zip = new JSZip ();

    for (var file of v11Files) {
      zip.file (file.name, file.content);
    }

    zip.generateAsync ({type: 'base64'}).then (content => {
      callback (
        null,
        `data:application/octet-stream;base64,${content}`,
        'files.zip'
      );
    });
  }

  return;
}

function generateFiles () {
  const type = '4';
  const v11Files = v11Xmls.map (xml => {
    return {
      name: xml.name + '.v11',
      content: generateV11 (xml.content, type),
    };
  });

  getDownloadLinkProperties (v11Files, (err, href, name) => {
    if (err) {
      console.log (err);
    } else {
      const dlink = document.createElement ('a');
      document.body.appendChild (dlink);
      dlink.download = name;
      dlink.href = href;
      dlink.onclick = function (e) {
        // revokeObjectURL needs a delay to work properly
        var that = this;
        setTimeout (function () {
          window.URL.revokeObjectURL (that.href);
        }, 1500);
      };

      dlink.click ();
      dlink.remove ();
      document.body.removeChild (dlink);
    }
  });
}

function getDownloadLinkHtml () {
  if (v11Xmls.length === 0) {
    return '';
  } else {
    return `
      <div id="downloadV11Container">
        <div id="v11-type">
          <form>
            <table>
              <tr>
                <td style="width: 40%;"></td>
                <td class="typeButton">
                    <input type="radio" name="type" value="type-3" id="type-3" checked>
                    <label for="type-3">${T.type3}</label>
                </td>
                <td class="typeButton">
                    <input type="radio" name="type" value="type-4" id="type-4">
                    <label for="type-4">${T.type4}</label>
                </td>
                <td style="width: 40%;"></td>
              </tr>
            </table>
          </form>
        </div>
        <div id="downloadV11Wrapper"><div id="downloadV11"'>${T.downloadV11}</div></div>
      </div>
    `;
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
          const downloadV11 = document.getElementById ('downloadV11');
          downloadV11.addEventListener ('click', generateFiles, false);
        } catch (e) {
          console.log (e);
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
