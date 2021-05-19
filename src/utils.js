"use strict";

function padLeft(value, length, char) {
  return value.toString().length < length ? padLeft(char + value, length, char) : value.toString();
}

function padRight(value, length, char) {
  return value.toString().length < length ? padRight(value + char, length, char) : value.toString();
}

function _formatDate(date) {
  if (date) {
    return `${date.substring(8, 10)}/${date.substring(5, 7)}/${date.substring(0, 4)}`;
  }
}

function _formatTime(time) {
  return time;
}

function formatAmount(amount) {
  if (amount == undefined) {
    return null;
  }

  if (amount.startsWith(".")) {
    return "0" + amount;
  } else {
    return amount;
  }
}

function escapeXml(unsafe) {
  if (unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "'":
          return "&apos;";
        case '"':
          return "&quot;";
      }
    });
  }
}

function splitLongLine(text, length) {
  if (text && length) {
    let output = "";
    while (text.length > length) {
      output += text.substring(0, length);
      output += "<br/>";
      text = text.substring(40);
    }
    output += text;
    return output;
  }
}

function _(getElementAction) {
  try {
    return getElementAction();
  } catch (err) {
    return null;
  }
}

function getDateTime(xml) {
  if (xml) {
    var pattern = `(....-..-..)T(..:..:..)`;
    const result = xml.match(pattern);
    const date = _formatDate(result[1]);
    const time = _formatTime(result[2]);
    return `${date}, ${time}`;
  }
}

function getDate(xml) {
  if (xml) {
    var pattern = `(....-..-..)`;
    const result = xml.match(pattern);
    return _formatDate(result[1]);
  }
}

function base64toBlob(data) {
  var byteString = atob(data);

  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  // write the ArrayBuffer to a blob, and you're done
  var bb = new Blob([ab], { type: "application/octet-stream" });
  return bb;
}

function readStorageValue(name, defaultValue) {
  if (typeof window.localStorage === "undefined") {
    console.log("Local storage unsupported");
    return defaultValue;
  }

  return window.localStorage.getItem("camtli_" + name) || defaultValue;
}

function writeStorageValue(name, value) {
  if (typeof window.localStorage === "undefined") {
    console.log("Local storage unsupported");
    return;
  }

  window.localStorage.setItem ('camtli_' + name, value);
}

module.exports.escapeXml = escapeXml;
module.exports.base64toBlob = base64toBlob;
module.exports.splitLongLine = splitLongLine;
module.exports._ = _;

module.exports.readStorageValue = readStorageValue;
module.exports.writeStorageValue = writeStorageValue;

module.exports.getDateTime = getDateTime;
module.exports.getDate = getDate;
module.exports.formatAmount = formatAmount;
module.exports.padLeft = padLeft;
module.exports.padRight = padRight;
