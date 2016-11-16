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

function trimStart(string, character) {
    var startIndex = 0;

    while (string[startIndex] === character) {
        startIndex++;
    }

    return string.substr(startIndex);
}


/******************************************************************************/

var xsdCamt53V2 = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02';
var xsdCamt54V2 = 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.02';
var xsdCamt53V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04';
var xsdCamt54V4 = 'urn:iso:std:iso:20022:tech:xsd:camt.054.001.04';

function formatDate(date) {
  return date.substring(8, 10) + '/' + date.substring(5, 7) + '/' + date.substring(0, 4);
}
function formatTime(time) {
  return time;
}

function getDateTime(xml, pattern) {
  pattern = pattern + '(....-..-..)T(..:..:..)';
  var result = xml.match(pattern);
  var date = formatDate(result[1]);
  var time = formatTime(result[2]);
  return date + ', ' + time;
}

function getDate(xml, pattern) {
  pattern = pattern + '(....-..-..)';
  var result = xml.match(pattern);
  return formatDate(result[1]);
}

function getCreationDateTime(xml) {
  // <CreDtTm>2016-05-06T23:01:15</CreDtTm>
  return getDateTime(xml, '<CreDtTm>');
}

function getTransactionsNo(xml) {
  // <Btch>...<NbOfTxs>5</NbOfTxs>...</Btch>
  var txs = xml.match(/<NbOfTxs>\s*([0-9]+)\s*</);
  var total = 0;

  for (var i = 1; i < txs.length; i++) {
    total += txs[i];
  }

  return trimStart (total.toString (), '0');
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
  var amount = xml.match(/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*</);
  var charges = xml.match(/<TtlChrgsAndTaxAmt Ccy="(...)">\s*([\-0-9\.]+)\s*</);
  var credit = xml.match(/<CdtDbtInd>\s*([A-Z]+)\s*</);
  var financialInstitution = xml.match(/<FinInstnId>\s*(.+)\s*<\/FinInstnId>/);
  var debtorName = xml.match(/<RltdPties>\s*<Dbtr>\s*<Nm>\s*([^<]*)\s*<\/Nm>/);
  var remittanceInformation = xml.match(/<RmtInf>\s*(.+)\s*<\/RmtInf>/);
  var debtorFinName = financialInstitution && financialInstitution[1].match(/<Nm>\s*([a-zA-Z0-9_\-.:;+/ ]*)\s*</);
  var reference = remittanceInformation && remittanceInformation[1].match(/<Ref>\s*(.*)\s*<\/Ref>/);

  if (!debtorName && !reference && !debtorFinName) {
    return '';
  }

  var debtorAccount = xml.match(/<DbtrAcct>\s*<Id>\s*<IBAN>\s*([A-Z0-9]+)\s*</);
  var debtorBank1 = debtorName ? escapeXml(debtorName[1]) : '';
  var debtorBank2 = debtorAccount ? debtorAccount[1] : '';
  var debtorDetails = debtorBank1.length ? debtorBank1 + (debtorBank2.length ? '<br/>' + formatIBAN(debtorBank2) : '') : debtorBank2.length ? formatIBAN(debtorBank2) : '-';

  return '\n  </tbody>\n</table>\n<table cellpadding="0" cellspacing="0" class="transaction details">\n  <tbody>\n    <tr class="first-detail">\n      <td>' + T.movement + '</td>\n      <td class="align-right">' + (credit ? credit[1] : '-') + '</td>\n    </tr>\n    <tr>\n      <td>' + T.debtor + '</td>\n      <td class="align-right">' + debtorDetails + '</td>\n    </tr>\n    <tr>\n      <td>' + T.finInstitute + '</td>\n      <td class="align-right">' + (debtorFinName ? escapeXml(debtorFinName[1]) : '-') + '</td>\n    </tr>\n    <tr>\n      <td>' + T.reference + '</td>\n      <td class="align-right">' + (reference ? escapeXml(reference[1]) : '-') + '</td>\n    </tr>\n    <tr>\n      <td>' + T.charges + '</td>\n      <td class="align-right">' + (charges ? charges[2] + ' ' + charges[1] : '-') + '</td>\n    </tr>\n    <tr>\n      <td>' + T.amount + '</td>\n      <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n    </tr>\n';
}

function getEntrySummary(xml) {
  var amount = xml.match(/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/Amt/);
  var charges = xml.match(/<TtlChrgsAndTaxAmt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/TtlChrgsAndTaxAmt/);
  var infos = xml.match(/<AddtlNtryInf>\s*(.+)\s*<\/AddtlNtryInf/);

  var bookingDate = getDate(xml, '<BookgDt>\\s*<Dt>\\s*');
  var valutaDate = getDate(xml, '<ValDt>\\s*<Dt>\\s*');

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

  var html = '\n<table cellpadding="0" cellspacing="0" class="transaction">\n  <caption>\n    <h3>' + title + '</h3>\n  </caption>\n  <tbody>\n    <tr>\n      <td>' + T.total + '</td>\n      <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n    </tr>';
  if (charges) {
    html += '\n    <tr>\n      <td>' + T.totalCharge + '</td>\n      <td class="bold align-right">' + charges[2] + ' ' + charges[1] + '</td>\n    </tr>';
  };
  html += '\n    <tr>\n      <td>' + T.dateBooking + '</td>\n      <td class="align-right">' + bookingDate + '</td>\n    </tr>\n    <tr>\n      <td>' + T.dateValuta + '</td>\n      <td class="align-right">' + valutaDate + '</td>\n    </tr>';
  html += details;
  html += '\n  </tbody>\n</table>';

  return html;
}

/******************************************************************************/

function getBalanceSummary(xml, output) {
  var cd = xml.match(/<Cd>\s*(\w+)\s*<\/Cd>/);
  var amount = xml.match(/<Amt Ccy="(...)">\s*([\-0-9\.]+)\s*<\/Amt/);
  var date = getDate(xml, '<Dt>\\s*');
  if (cd) {
    switch (cd[1]) {
      case 'OPBD':
        output.open = '\n<table cellpadding="0" cellspacing="0" class="balance-open">\n  <tr>\n    <td>' + T.openBalance + ' (' + date + ')</td>\n    <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n  </tr>\n</table>';
        break;
      case 'CLBD':
        output.close = '\n<table cellpadding="0" cellspacing="0" class="balance-close">\n<tr>\n  <td>' + T.closeBalance + ' (' + date + ')</td>\n  <td class="bold align-right">' + amount[2] + ' ' + amount[1] + '</td>\n</tr>\n</table>';
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
  var result = xml.match(/<Acct>\s*<Id>\s*<IBAN>\s*(CH\d+)/);
  return result && 'IBAN ' + formatIBAN(result[1]) || '-';
}

/******************************************************************************/

function getXmlCamtReport(fileName, title, xml) {
  var output = {};
  var transactions = '';

  getEntriesSummary(xml, output);

  if (output.entries.length) {
    transactions += '<h2 class="">' + T.transactions + '</h2>';
    output.entries.forEach(function (entry) {
      return transactions += entry + '\n';
    });
  }

  return '\n<table cellpadding="0" cellspacing="0">\n  <caption>\n    <h1>' + title + '</h1>\n  </caption>\n  <tbody>\n    <tr>\n      <td>' + T.fileName + '</td>\n      <td>' + escapeXml(fileName) + '</td>\n    </tr>\n    <tr>\n      <td>' + T.creationDate + '</td>\n      <td>' + getCreationDateTime(xml) + '</td>\n    </tr>\n    <tr>\n      <td>' + T.customerAccount + '</td>\n      <td>' + getCustomerAccount(xml) + '</td>\n    </tr>\n   <tr>\n      <td>' + T.transactionsNo + '</td>\n      <td>' + getTransactionsNo(xml) + '</td>\n    </tr>\n   </tbody>\n</table>\n' + (output.open || '') + '\n' + transactions + '\n' + (output.close || '');
}

function getXmlReport(title, xml) {
  if (xml.indexOf('<Document xmlns="' + xsdCamt53V2 + '" ') > 0) {
    return getXmlCamtReport(title, T.camt53V2, xml);
  }
  if (xml.indexOf('<Document xmlns="' + xsdCamt53V4 + '" ') > 0) {
    return getXmlCamtReport(title, T.camt53V4, xml);
  }
  if (xml.indexOf('<Document xmlns="' + xsdCamt54V2 + '" ') > 0) {
    return getXmlCamtReport(title, T.camt54V2, xml);
  }
  if (xml.indexOf('<Document xmlns="' + xsdCamt54V4 + '" ') > 0) {
    return getXmlCamtReport(title, T.camt54V4, xml);
  }
  return '<h1 class="error">' + T.undefinedFormat + '</h1>';
}

/******************************************************************************/

function scrollTo(to, duration) {
  var doc = document.documentElement;
  var body = document.body;
  var start = doc.scrollTop;
  var change = to - start;
  var increment = 20;

  //t = current time
  //b = start value
  //c = change in value
  //d = duration
  function easeInOutQuad(t, b, c, d) {
    t = t / (d / 2);
    if (t < 1) {
      return c / 2 * t * t + b;
    }
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  }

  var currentTime = 0;

  function animateScroll() {
    currentTime += increment;
    var val = easeInOutQuad(currentTime, start, change, duration);
    doc.scrollTop = val; // for IE
    body.scrollTop = val; // for Chrome
    if (currentTime < duration) {
      setTimeout(animateScroll, increment);
    }
  }
  animateScroll();
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
    scrollTo(650, 800);
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