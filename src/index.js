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

function getXmlReport (xml) {
  return '';
}

/******************************************************************************/

function handleFileSelect (evt) {
  evt.stopPropagation ();
  evt.preventDefault ();

  const files = evt.dataTransfer.files;
  const output = document.getElementById ('list');

  for (var i = 0; i < files.length; i++) {
    const xml = files[i];
    if (xml.type !== 'text/xml') {
      return;
    }
    const li = document.createElement ('li');
    output.insertBefore (li, null);
    const reader = new FileReader ();
    reader.onload = e => {
        li.innerHTML = '<strong>'.concat (
          escape (xml.name), '</strong>',
          ' (', xml.type || 'n/a', ') - ',
          xml.size, ' bytes',
          '<div>',
          getXmlReport (e.target.result),
          '</div>');
      };
    reader.readAsText (xml);
  }
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
