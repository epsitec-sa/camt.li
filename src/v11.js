'use strict';

var _ = require ('./utils.js')._;
var padLeft = require ('./utils.js').padLeft;
var padRight = require ('./utils.js').padRight;




function _generateOrigin(bankTransactionCode) {
    if (!bankTransactionCode) {
        return '03';
    }

    switch (bankTransactionCode) {
        case 'CDPT':
            return '01';
        case 'DMCT':
            return '02';
        case 'AUTT':
            return '03';
        case 'ATXN':
            return '04';

        default:
            return '03';
    }
}


function _padRightSpaces(input, length) {
    if (!input) {
        return padRight ('', length, ' ');
    }

    if (input.length > length) {
        throw 'length greater than maximum allowed for element ' + input;
    }


    return padRight (input, length, ' ');    //	"xx" => "xx   "
}

function _padLeftZeroes(input, length) {
    if (!input) {
        return padLeft ('', length, '0');
    }

    if (input.length > length) {
        throw 'length greater than maximum allowed for element '+ input;
    }

    return padLeft (input, length, '0');     //	"xx" => "000xx"
}

function _padWithoutDot(value, length) {
    if (!value) {
        return padRight ('', length, '0');
    }

    //	123.45 => "00012345"
    return _padLeftZeroes (parseFloat (value).toFixed (2).replace ('.', ''), length);
}


function _formatDate(dateStr) {
  if (!dateStr) {
    return '00000000';
  }
  var date = new Date (dateStr);

  var month = _padLeftZeroes ((date.getMonth () + 1).toString (), 2);
  var day = _padLeftZeroes (date.getDate ().toString (), 2);

  return date.getFullYear ().toString () + month + day;
}




function _generateTransactionObject(details, clientBvrNumber, reversalIndicator, comptabilisationDate, processingDate) {
  const bankTransactionCode = _(() => details.BkTxCd[0].Domn[0].Fmly[0].SubFmlyCd[0]);
  const isCredit = details.CdtDbtInd[0] === 'CRDT' ? true : false;
  const bvrReferenceNumber = _(() => details.RmtInf[0].Strd[0].CdtrRefInf[0].Ref[0]);
  const currency = _(() => details.Amt[0].$.Ccy);
  const amount = _(() => details.Amt[0]._);
  const submissionDate = _(() => details.RltdDts[0].AccptncDtTm[0]);
  const taxAmount = _(() => details.Chrgs[0].TtlChrgsAndTaxAmt[0]._);
  const taxCurrency = _(() => details.Chrgs[0].TtlChrgsAndTaxAmt[0].$.Ccy);


  if (isCredit || (clientBvrNumber && bvrReferenceNumber)) {
    return {
      bankTransactionCode: bankTransactionCode,
      isCredit: isCredit,
      reversalIndicator: reversalIndicator,
      clientBvrNumber: clientBvrNumber,
      bvrReferenceNumber: bvrReferenceNumber,
      currency: currency,
      amount: amount,
      submissionDate: submissionDate,
      processingDate: processingDate,
      comptabilisationDate: comptabilisationDate,
      taxCurrency: taxCurrency,
      taxAmount: taxAmount
    };
  }
}



function _generateTransactions(bLevel) {
  var transactions = [];

  for (var entry of (bLevel.Ntry || [])) {
    const bookingDate = _(() => entry.BookgDt[0].Dt[0]);
    const valutaDate = _(() => entry.ValDt[0].Dt[0]);
    const clientBvrNumber = _(() => entry.NtryRef[0]);
    const reversalIndicator = _(() => entry.RvslInd[0]) === 'true' ? true : false;

    for (var entryDetails of (entry.NtryDtls || [])) {
      for (var txDetails of (entryDetails.TxDtls || [])) {
        if (txDetails.Refs) {
          var tx = _generateTransactionObject (txDetails, clientBvrNumber, reversalIndicator, valutaDate, bookingDate);
          if (tx) {
            transactions.push (tx);
          }
        }
      }
    }
  }

  return transactions;
}




function _translateToV11(transaction) {
  return '00' +
    '2' +
    _generateOrigin (transaction.bankTransactionCode) +
    '1' +
    _padLeftZeroes (transaction.clientBvrNumber, 9) +
    _padLeftZeroes (transaction.bvrReferenceNumber, 27) +
    _padRightSpaces (transaction.currency, 3) +
    '00' +
    _padWithoutDot (transaction.amount, 10) +
    _padRightSpaces ('', 35) +
    _formatDate (transaction.submissionDate) +
    _formatDate (transaction.processingDate) +
    _formatDate (transaction.accountingDate) +
    '0' +
    _padRightSpaces (transaction.taxCurrency, 3) +
    '00' +
    _padWithoutDot (transaction.taxAmount, 4) +
    _padRightSpaces ('', 74);
}






function generateV11(document) {
  var aLevel = (document.BkToCstmrStmt || document.BkToCstmrDbtCdtNtfctn)[0];

  if (aLevel) {
    var bLevel = (aLevel.Ntfctn || aLevel.Stmt)[0];

    if (bLevel) {
      var transactions = _generateTransactions (bLevel);

      return transactions.map ((transaction) => _translateToV11 (transaction)).join ('\r\n');
    }
  }
}


module.exports.generateV11 = generateV11;
