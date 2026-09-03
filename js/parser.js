/* parser.js — turns raw OCR text into categorized visiting-card fields.
   Pure heuristics: no data leaves the device. Anything the rules can't
   confidently place is left blank and flagged, never guessed. */

const CardParser = (() => {

  const DESIGNATION_WORDS = [
    'manager', 'director', 'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder',
    'president', 'vice president', 'vp', 'executive', 'officer', 'head',
    'proprietor', 'owner', 'partner', 'consultant', 'engineer', 'architect',
    'designer', 'developer', 'sales', 'marketing', 'front office', 'general manager',
    'gm', 'chairman', 'supervisor', 'associate', 'analyst', 'accountant',
    'chef', 'administrator', 'coordinator', 'representative', 'agent', 'attorney',
    'advocate', 'doctor', 'dr.', 'professor', 'lead', 'specialist'
  ];

  const ADDRESS_WORDS = [
    'road', 'street', 'st.', 'nagar', 'colony', 'sector', 'floor', 'building',
    'complex', 'marg', 'chowk', 'lane', 'avenue', 'plot', 'near', 'opp', 'opposite',
    'behind', 'india', 'circle', 'square', 'apartment', 'block'
  ];

  const INDIAN_STATES = [
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa',
    'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
    'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
    'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura',
    'uttar pradesh', 'uttarakhand', 'west bengal', 'delhi', 'jammu and kashmir'
  ];

  const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const RE_URL = /\b((https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.(com|in|net|org|co|io|biz|info)(\.[a-z]{2})?(\/[^\s]*)?)\b/i;
  const RE_GST = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/;
  const RE_PIN = /\b\d{6}\b/;
  const RE_PHONE = /(\+?\d{1,3}[\s-]?)?\d{5}[\s-]?\d{5}\b|\b\d{10}\b|\b\d{3,4}[\s-]\d{6,8}\b/g;
  const RE_WHATSAPP_HINT = /whats\s?app/i;
  const RE_TEL_HINT = /\b(tel|telephone|landline|off\.?|office)\b/i;
  const RE_MOBILE_HINT = /\b(mob|mobile|cell|m\.)\b/i;

  function clean(line) {
    return line.replace(/\s+/g, ' ').trim();
  }

  function looksLikeDesignation(line) {
    const l = line.toLowerCase();
    return DESIGNATION_WORDS.some(w => l.includes(w)) && line.length < 60;
  }

  function looksLikeAddress(line) {
    const l = line.toLowerCase();
    return ADDRESS_WORDS.some(w => l.includes(w)) || /\d{1,4}[,\s].{0,40}(road|street|nagar)/i.test(line);
  }

  function findState(lines) {
    for (const line of lines) {
      const l = line.toLowerCase();
      const hit = INDIAN_STATES.find(s => l.includes(s));
      if (hit) return hit.replace(/\b\w/g, c => c.toUpperCase());
    }
    return '';
  }

  /**
   * @param {string} rawText - raw OCR output
   * @returns {object} fields + a `flags` object noting anything left blank
   */
  function parse(rawText) {
    const lines = rawText
      .split('\n')
      .map(clean)
      .filter(l => l.length > 1);

    const fields = {
      companyName: '', personName: '', designation: '', mobile: '',
      whatsapp: '', telephone: '', email: '', website: '', address: '',
      city: '', state: '', country: '', pinCode: '', taxNumber: '',
      social: '', notes: '', other: ''
    };

    const usedLines = new Set();
    const leftover = [];

    // Email
    const emailMatch = rawText.match(RE_EMAIL);
    if (emailMatch) fields.email = emailMatch[0];

    // Website (skip if it's actually the email domain being re-matched)
    const urlMatches = rawText.match(new RegExp(RE_URL, 'gi')) || [];
    const websiteCandidate = urlMatches.find(u => !fields.email.includes(u));
    if (websiteCandidate) {
      fields.website = /^https?:\/\//i.test(websiteCandidate) ? websiteCandidate : 'www.' + websiteCandidate.replace(/^www\./i, '');
    }

    // GST / Tax number
    const gstMatch = rawText.match(RE_GST);
    if (gstMatch) fields.taxNumber = gstMatch[0];

    // PIN code
    const pinMatch = rawText.match(RE_PIN);
    if (pinMatch) fields.pinCode = pinMatch[0];

    // State
    fields.state = findState(lines);
    if (fields.state) fields.country = 'India';

    // Phone numbers — collect all candidates, then assign by nearby keywords
    const phoneNumbers = [];
    lines.forEach(line => {
      const matches = line.match(RE_PHONE);
      if (matches) {
        matches.forEach(m => {
          const digits = m.replace(/\D/g, '');
          if (digits.length >= 8) phoneNumbers.push({ raw: m.trim(), line, digits });
        });
      }
    });

    phoneNumbers.forEach(p => {
      if (RE_WHATSAPP_HINT.test(p.line) && !fields.whatsapp) {
        fields.whatsapp = p.raw;
      } else if (RE_TEL_HINT.test(p.line) && !fields.telephone) {
        fields.telephone = p.raw;
      } else if (RE_MOBILE_HINT.test(p.line) && !fields.mobile) {
        fields.mobile = p.raw;
      }
    });
    // Fill mobile/telephone from whatever's left, mobile numbers (10 digit, often starting 6-9) preferred
    phoneNumbers.forEach(p => {
      if (fields.mobile === p.raw || fields.whatsapp === p.raw || fields.telephone === p.raw) return;
      const last10 = p.digits.slice(-10);
      const isMobileLike = /^[6-9]/.test(last10) && last10.length === 10;
      if (isMobileLike && !fields.mobile) fields.mobile = p.raw;
      else if (!fields.telephone) fields.telephone = p.raw;
    });

    // Walk remaining lines for name / designation / company / address
    lines.forEach(line => {
      if (fields.email && line.includes(fields.email)) { usedLines.add(line); return; }
      if (fields.website && line.toLowerCase().includes(fields.website.replace(/^www\./, '').toLowerCase())) { usedLines.add(line); return; }
      if (fields.taxNumber && line.includes(fields.taxNumber)) { usedLines.add(line); return; }
      const isPhoneLine = phoneNumbers.some(p => p.line === line);
      if (isPhoneLine) { usedLines.add(line); return; }

      if (!fields.designation && looksLikeDesignation(line)) {
        fields.designation = line;
        usedLines.add(line);
        return;
      }
      if (looksLikeAddress(line) || RE_PIN.test(line)) {
        leftover.push(line);
        usedLines.add(line);
        return;
      }
    });

    // Remaining unused, short lines: first is usually the person's name,
    // an ALL-CAPS or larger one is usually the company. We can't detect
    // font size from text, so: first unused line -> name, next -> company.
    const remaining = lines.filter(l => !usedLines.has(l) && !leftover.includes(l));
    if (remaining.length) {
      // Heuristic: a line that is ALL CAPS or contains Ltd/Pvt/Inc/Group/Hotel etc → company
      const companyHint = /(pvt|ltd|llp|inc|group|hotel|resort|enterprises|industries|company|co\.|corp|solutions|services|technologies|traders)/i;
      const companyIdx = remaining.findIndex(l => companyHint.test(l));
      if (companyIdx !== -1) {
        fields.companyName = remaining[companyIdx];
        remaining.splice(companyIdx, 1);
      }
      if (!fields.personName && remaining.length) {
        fields.personName = remaining.shift();
      }
      if (!fields.companyName && remaining.length) {
        fields.companyName = remaining.shift();
      }
      leftover.push(...remaining);
    }

    if (leftover.length) {
      fields.address = leftover.join(', ');
    }

    // Very rough city guess: word right before the state name, or before the PIN
    if (fields.state) {
      const stateLine = lines.find(l => l.toLowerCase().includes(fields.state.toLowerCase()));
      if (stateLine) {
        const parts = stateLine.split(',').map(clean).filter(Boolean);
        const idx = parts.findIndex(p => p.toLowerCase().includes(fields.state.toLowerCase()));
        if (idx > 0) fields.city = parts[idx - 1].replace(RE_PIN, '').trim();
      }
    }

    const flags = {};
    ['companyName', 'personName', 'mobile', 'email'].forEach(k => {
      if (!fields[k]) flags[k] = true;
    });

    return { fields, flags, rawText };
  }

  return { parse };
})();
