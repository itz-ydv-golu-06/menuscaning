/* export.js — turn saved contacts into downloadable files.
   Everything is generated client-side; no data leaves the device. */

const CardExport = (() => {

  const COLUMNS = [
    ['companyName', 'Company Name'], ['personName', 'Name'], ['designation', 'Designation'],
    ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['telephone', 'Telephone'],
    ['email', 'Email'], ['website', 'Website'], ['address', 'Address'],
    ['city', 'City'], ['state', 'State'], ['country', 'Country'], ['pinCode', 'PIN/ZIP'],
    ['taxNumber', 'GST/VAT/Tax No.'], ['social', 'Social Media'], ['notes', 'Notes']
  ];

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function rowsFor(contacts) {
    return contacts.map(c => COLUMNS.map(([key]) => c[key] || ''));
  }

  function toCSV(contacts) {
    const header = COLUMNS.map(([, label]) => label);
    const rows = rowsFor(contacts);
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
    downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), 'cardscan-contacts.csv');
  }

  function toXLSX(contacts) {
    const header = COLUMNS.map(([, label]) => label);
    const rows = rowsFor(contacts);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = header.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    XLSX.writeFile(wb, 'cardscan-contacts.xlsx');
  }

  function toPDF(contacts) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('CardScan — Contacts', 14, 14);
    let y = 24;
    doc.setFontSize(9);
    contacts.forEach((c, i) => {
      if (y > 190) { doc.addPage(); y = 20; }
      const line1 = `${c.personName || '—'}  ·  ${c.companyName || '—'}  ·  ${c.designation || ''}`;
      const line2 = `${c.mobile || ''}   ${c.email || ''}   ${c.website || ''}`;
      const line3 = [c.address, c.city, c.state, c.pinCode].filter(Boolean).join(', ');
      doc.setFont(undefined, 'bold'); doc.text(line1, 14, y);
      doc.setFont(undefined, 'normal'); doc.text(line2, 14, y + 5);
      if (line3) doc.text(line3, 14, y + 10);
      y += line3 ? 18 : 13;
    });
    doc.save('cardscan-contacts.pdf');
  }

  function toDOC(contacts) {
    // Word opens well-formed HTML saved with a .doc extension.
    const rowsHtml = contacts.map(c => `
      <tr>${COLUMNS.map(([key]) => `<td style="padding:4px 8px;border:1px solid #ccc;">${(c[key] || '').toString()}</td>`).join('')}</tr>
    `).join('');
    const header = COLUMNS.map(([, label]) => `<th style="padding:4px 8px;border:1px solid #ccc;background:#eee;text-align:left;">${label}</th>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body>
      <h2>CardScan — Contacts</h2>
      <table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
        <thead><tr>${header}</tr></thead><tbody>${rowsHtml}</tbody>
      </table></body></html>`;
    downloadBlob(new Blob(['\ufeff', html], { type: 'application/msword' }), 'cardscan-contacts.doc');
  }

  function vcardEscape(v) {
    return String(v || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  }

  function toVCF(contacts) {
    const cards = contacts.map(c => {
      const name = c.personName || c.companyName || 'Unknown';
      const addressParts = [c.address, c.city, c.state, c.pinCode, c.country];
      let vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
      vcf += `FN:${vcardEscape(name)}\r\n`;
      vcf += `N:${vcardEscape(name)};;;;\r\n`;
      if (c.companyName) vcf += `ORG:${vcardEscape(c.companyName)}\r\n`;
      if (c.designation) vcf += `TITLE:${vcardEscape(c.designation)}\r\n`;
      if (c.mobile) vcf += `TEL;TYPE=CELL:${vcardEscape(c.mobile)}\r\n`;
      if (c.whatsapp) vcf += `TEL;TYPE=CELL,WHATSAPP:${vcardEscape(c.whatsapp)}\r\n`;
      if (c.telephone) vcf += `TEL;TYPE=WORK,VOICE:${vcardEscape(c.telephone)}\r\n`;
      if (c.email) vcf += `EMAIL:${vcardEscape(c.email)}\r\n`;
      if (c.website) vcf += `URL:${vcardEscape(c.website)}\r\n`;
      if (addressParts.some(Boolean)) {
        vcf += `ADR;TYPE=WORK:;;${vcardEscape(c.address)};${vcardEscape(c.city)};${vcardEscape(c.state)};${vcardEscape(c.pinCode)};${vcardEscape(c.country)}\r\n`;
      }
      if (c.notes) vcf += `NOTE:${vcardEscape(c.notes)}\r\n`;
      vcf += 'END:VCARD\r\n';
      return vcf;
    }).join('');
    downloadBlob(new Blob([cards], { type: 'text/vcard;charset=utf-8;' }), 'cardscan-contacts.vcf');
  }

  function exportContacts(format, contacts) {
    if (!contacts.length) return false;
    switch (format) {
      case 'csv': toCSV(contacts); break;
      case 'xlsx': toXLSX(contacts); break;
      case 'pdf': toPDF(contacts); break;
      case 'doc': toDOC(contacts); break;
      case 'vcf': toVCF(contacts); break;
      default: return false;
    }
    return true;
  }

  return { exportContacts };
})();
