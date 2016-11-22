'use strict';

function padLeft(value, length, char) {
    return (value.toString ().length < length) ? padLeft (char + value, length, char) : value.toString ();
}

function padRight(value, length, char) {
    return (value.toString ().length < length) ? padRight (value + char, length, char) : value.toString ();
}


function _formatDate (date) {
  if (date) {
    return `${date.substring (8, 10)}/${date.substring (5, 7)}/${date.substring (0, 4)}`;
  }
}


function _formatTime (time) {
  return time;
}



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





function getDateTime (xml) {
  if (xml) {
    var pattern = `(....-..-..)T(..:..:..)`;
    const result = xml.match (pattern);
    const date = _formatDate (result[1]);
    const time = _formatTime (result[2]);
    return `${date}, ${time}`;
  }
}

function getDate (xml) {
  if (xml) {
    var pattern = `(....-..-..)`;
    const result = xml.match (pattern);
    return _formatDate (result[1]);
  }
}



module.exports.escapeXml = escapeXml;
module.exports.splitLongLine = splitLongLine;
module.exports._ = _;
module.exports.getDateTime = getDateTime;
module.exports.getDate = getDate;
module.exports.padLeft = padLeft;
module.exports.padRight = padRight;
