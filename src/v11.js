'use strict';

var _ = require ('./utils.js')._;
var padLeft = require ('./utils.js').padLeft;
var padRight = require ('./utils.js').padRight;
var ld_ = require ('lodash');

// error codes: Unknown, MissingBvrNumber, MissingRefs


const transactionCodesTable = {
  // camt.54, v11
  '01': '01',
  '03': '02',
  '04': '11',
  '11': '03',
  '14': '13',
  '21': '21',
  '23': '23',
  '31': '31',
  '06': '06',
  '46': '46',
};

function _generateOrigin (bankTransactionCode) {
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

function _padRightSpaces (input, length) {
  if (!input) {
    return padRight ('', length, ' ');
  }

  if (input.length > length) {
    throw 'length greater than maximum allowed for element ' + input;
  }

  return padRight (input, length, ' '); //	"xx" => "xx   "
}

function _padLeftZeroes (input, length) {
  if (!input) {
    return padLeft ('', length, '0');
  }

  if (input.length > length) {
    throw 'length greater than maximum allowed for element ' + input;
  }

  return padLeft (input, length, '0'); //	"xx" => "000xx"
}

function _padWithoutDot (value, length) {
  if (!value) {
    return padRight ('', length, '0');
  }

  try {
    //	123.45 => "00012345"
    return _padLeftZeroes (
      parseFloat (value).toFixed (2).replace ('.', ''),
      length
    );
  } catch (e) {
    console.log ('warning (in padWithoutDot): ' + JSON.stringify (e));
    return padRight ('', length, '0');
  }
}

function _formatDateV4 (dateStr) {
  if (!dateStr) {
    return '00000000';
  }

  try {
    var date = new Date (dateStr);

    var month = _padLeftZeroes ((date.getMonth () + 1).toString (), 2);
    var day = _padLeftZeroes (date.getDate ().toString (), 2);

    return date.getFullYear ().toString () + month + day;
  } catch (e) {
    console.log ('warning (in formatDate): ' + JSON.stringify (e));
    return '00000000';
  }
}

function _formatDateV3 (dateStr) {
  if (!dateStr) {
    return '000000';
  }

  try {
    var date = new Date (dateStr);

    var month = _padLeftZeroes ((date.getMonth () + 1).toString (), 2);
    var day = _padLeftZeroes (date.getDate ().toString (), 2);

    return date.getFullYear ().toString ().substr (2) + month + day;
  } catch (e) {
    console.log ('warning (in formatDate): ' + JSON.stringify (e));
    return '000000';
  }
}

function _extractTransactionCode (code) {
  if (code) {
    if (Object.keys (transactionCodesTable).includes (code)) {
      return transactionCodesTable[code];
    }
  }

  return '01';
}

function _generateTransactionTypeCodeV4 (
  transactionCode,
  isCredit,
  reversalIndicator
) {
  if (!transactionCode || !reversalIndicator) {
    return '1';
  }

  var isBvr = !(transactionCode === '06' || transactionCode === '46');

  if (reversalIndicator) {
    if (isBvr === isCredit) {
      return '3'; // Rectification (correction)
    } else {
      return '2'; // Contre-écriture (contre-passation)
    }
  }

  return '1'; // Normal transaction
}

function _isPositive (transaction) {
  switch (_generateTransactionTypeCodeV4 (
    transaction.transactionCode,
    transaction.isCredit,
    transaction.reversalIndicator
  )) {
    case '1':
      return true;
    case '2':
      return false;
    case '3':
      return true;
    default:
      return true;
  }
}

function _generateTransactionTypeCodeV3 (transaction) {
  const codeConversionTable = {
    '0': '0',
    '2': '0',
    '1': '1',
    '3': '1',
  };
  const originConversionTable = {
    '01': '1',
    '02': '3',
    '03': '0',
    '04': '0',
  };
  const typesConversionTable = {
    '1': '2',
    '2': '5',
    '3': '8',
  };

  const code = codeConversionTable[transaction.transactionCode.substr (0, 1)];

  const origin = transaction.transactionCode === '02' // Remboursement
    ? '2'
    : originConversionTable[_generateOrigin (transaction.bankTransactionCode)];

  const type =
    typesConversionTable[
      _generateTransactionTypeCodeV4 (
        transaction.transactionCode,
        transaction.isCredit,
        transaction.reversalIndicator
      )
    ];

  const result = code + origin + type;
  return result !== '105' ? result : '104'; // Exception with 105
}

function _generateTransactionObject (
  details,
  clientBvrNumber,
  reversalIndicator,
  accountingDate,
  processingDate
) {
  const transactionCode = _extractTransactionCode (
    _ (() => details.Refs[0].Prtry[0].Tp[0])
  );
  const bankTransactionCode = _ (
    () => details.BkTxCd[0].Domn[0].Fmly[0].SubFmlyCd[0]
  );
  const isCredit = _ (() => details.CdtDbtInd[0]) === 'CRDT' ? true : false;
  const bvrReferenceNumber = _ (
    () => details.RmtInf[0].Strd[0].CdtrRefInf[0].Ref[0]
  );
  const currency = _ (() => details.Amt[0].$.Ccy);
  const amount = _ (() => parseFloat (details.Amt[0]._));
  const submissionDate = _ (() => details.RltdDts[0].AccptncDtTm[0]);
  const taxAmount = _ (() =>
    parseFloat (details.Chrgs[0].TtlChrgsAndTaxAmt[0]._)
  );
  const taxCurrency = _ (() => details.Chrgs[0].TtlChrgsAndTaxAmt[0].$.Ccy);

  if (!clientBvrNumber) {
    return {
      error: 'MissingBvrNumber'
    };
  }

  if (bvrReferenceNumber) {
    return {
      transactionCode: transactionCode,
      bankTransactionCode: bankTransactionCode,
      isCredit: isCredit,
      reversalIndicator: reversalIndicator,
      clientBvrNumber: clientBvrNumber,
      bvrReferenceNumber: bvrReferenceNumber,
      currency: currency,
      amount: amount,
      submissionDate: submissionDate,
      processingDate: processingDate,
      accountingDate: accountingDate,
      taxCurrency: taxCurrency,
      taxAmount: taxAmount,
    };
  }
}

function _generateTransactions (bLevel) {
  var transactions = [];

  for (var entry of bLevel.Ntry || []) {
    const bookingDate = _ (() => entry.BookgDt[0].Dt[0]);
    const valutaDate = _ (() => entry.ValDt[0].Dt[0]);
    const clientBvrNumber = _ (() => entry.NtryRef[0]);
    const reversalIndicator = _ (() => entry.RvslInd[0]) === 'true'
      ? true
      : false;

    for (var entryDetails of entry.NtryDtls || []) {
      for (var txDetails of entryDetails.TxDtls || []) {
        if (txDetails.Refs) {
           var tx = _generateTransactionObject (
            txDetails,
            clientBvrNumber,
            reversalIndicator,
            valutaDate,
            bookingDate
          );

          if (tx) {
            transactions.push (tx);
          }
        }
        else {
          transactions.push ({
            error: 'MissingRefs'
          });
        }
      }
    }
  }

  return transactions;
}


function _generateTotalRecordV3 (transactions) {
  const transaction = transactions[0];
  const type = _generateTransactionTypeCodeV3 (transaction).substr (2);

  return (
    _padLeftZeroes (type === '2' || type === '8' ? '999' : '995', 3) +
    _padLeftZeroes (transaction.clientBvrNumber, 9) +
    '999999999999999999999999999' + // Clé de tri
    _padWithoutDot (
      ld_ (transactions).map (trans => trans.amount || 0.0).sum (),
      12
    ) +
    _padLeftZeroes (transactions.length, 12) +
    _formatDateV3 (transaction.submissionDate) +
    _padWithoutDot (
      ld_ (transactions).map (trans => trans.taxAmount || 0.0).sum (),
      9
    ) +
    _padLeftZeroes ('', 9) +
    _padRightSpaces ('', 13)
  );
}

function _generateTotalRecordV4 (transactions) {
  const transaction = transactions[0];
  const code = _generateTransactionTypeCodeV4 (
    transaction.transactionCode,
    transaction.isCredit,
    transaction.reversalIndicator
  ) === '2'
    ? '2'
    : '1';

  return (
    _padLeftZeroes (transaction.currency === 'CHF' ? '99' : '98', 2) +
    code +
    '99' +
    '1' +
    _padLeftZeroes (transaction.clientBvrNumber, 9) +
    '999999999999999999999999999' + // Clé de tri
    _padRightSpaces (transaction.currency, 3) +
    _padWithoutDot (
      ld_ (transactions).map (trans => trans.amount || 0.0).sum (),
      12
    ) +
    _padLeftZeroes (transactions.length, 12) +
    _formatDateV4 (transaction.submissionDate) +
    _padRightSpaces (transaction.taxCurrency || transaction.currency, 3) +
    _padWithoutDot (
      ld_ (transactions).map (trans => trans.taxAmount || 0.0).sum (),
      11
    ) +
    _padRightSpaces ('', 109)
  );
}

function _generateTotalRecord (transactions, type) {
  switch (type) {
    case '3':
      return _generateTotalRecordV3 (transactions);
    case '4':
      return _generateTotalRecordV4 (transactions);
    default:
      return _generateTotalRecordV4 (transactions);
  }
}

function _translateToType3V11 (transaction) {
  return (
    _padLeftZeroes (_generateTransactionTypeCodeV3 (transaction), 3) +
    _padLeftZeroes (transaction.clientBvrNumber, 9) +
    _padLeftZeroes (transaction.bvrReferenceNumber, 27) +
    _padWithoutDot (transaction.amount, 10) +
    '0000  0000' + // Depot reference
    _formatDateV3 (transaction.submissionDate) +
    _formatDateV3 (transaction.processingDate) +
    _formatDateV3 (transaction.accountingDate) +
    _padLeftZeroes ('', 9) + // N° microfilm
    '0' + // rejection code
    _padLeftZeroes ('', 9) +
    _padWithoutDot (transaction.taxAmount, 4)
  );
}

function _translateToType4V11 (transaction) {
  return (
    _padLeftZeroes (transaction.transactionCode, 2) +
    _generateTransactionTypeCodeV4 (
      transaction.transactionCode,
      transaction.isCredit,
      transaction.reversalIndicator
    ) +
    _generateOrigin (transaction.bankTransactionCode) +
    '1' +
    _padLeftZeroes (transaction.clientBvrNumber, 9) +
    _padLeftZeroes (transaction.bvrReferenceNumber, 27) +
    _padRightSpaces (transaction.currency, 3) +
    '00' +
    _padWithoutDot (transaction.amount, 10) +
    _padRightSpaces ('', 35) +
    _formatDateV4 (transaction.submissionDate) +
    _formatDateV4 (transaction.processingDate) +
    _formatDateV4 (transaction.accountingDate) +
    '0' +
    _padRightSpaces (transaction.taxCurrency || transaction.currency, 3) +
    '00' +
    _padWithoutDot (transaction.taxAmount, 4) +
    _padRightSpaces ('', 74)
  );
}

function _translateToV11 (transaction, type) {
  if (transaction.error) { // faulted transaction
    return transaction;
  }

  try {
    switch (type) {
      case '3':
        return _translateToType3V11 (transaction);
      case '4':
        return _translateToType4V11 (transaction);
      default:
        return _translateToType4V11 (transaction);
    }
  }
  catch (err) {
    console.error ('error generating v11 for transaction:');
    console.dir (transaction);
    console.dir (err);

    return {
      error: 'Unknown'
    };
  }
}

function generateV11 (document, type, separator) {
  var aLevel = (document.BkToCstmrStmt || document.BkToCstmrDbtCdtNtfctn)[0];

  if (aLevel) {
    var bLevel = (aLevel.Ntfctn || aLevel.Stmt)[0];

    if (bLevel) {
      var transactions = _generateTransactions (bLevel);

      var errors = ld_ (transactions)
        .filter (transaction => transaction.error)
        .value ();

      var content = ld_ (transactions)
        .filter (transaction => !transaction.error)
        .groupBy (
          transaction =>
            transaction.clientBvrNumber + _isPositive (transaction).toString ()
        )
        .map (
          group =>
            group
              .map (transaction => _translateToV11 (transaction, type))
              .join (separator) +
            separator +
            _generateTotalRecord (group, type)
        )
        .join (separator);

      return {
        content: content,
        errors: errors
      };
    }
  }
}

module.exports.generateV11 = generateV11;
