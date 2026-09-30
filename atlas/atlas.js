/* ============================================================
   SELEQT ATLAS: the family preparedness file, filled in the browser.
   Everything happens on this device. The form is built from atlas/schema.json (made
   from the ATLAS PDF by scripts/build_atlas_schema.py). On download, the answers are
   written onto atlas/template.pdf at the same positions with the self-hosted pdf-lib,
   and they travel inside the PDF as an attachment so the file can be loaded back here
   to continue. Nothing is ever sent anywhere: the page's Content Security Policy leaves
   it nowhere to send to.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SESSION_KEY = 'seleqt_atlas_session', DRAFT_KEY = 'seleqt_atlas_draft', KEEP_KEY = 'seleqt_atlas_keep';
  var DATA = {}, INDEX = {}, NAV = [], seq = 0, setSeq = 0, dirty = false, saveTimer = null, warmTimer = null, SCHEMA = null;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FIRST_ROWS = 2; // table rows shown before "Add a row"

  // ---- Local storage only; wrapped because private windows can refuse it ----
  function box(kind) { try { return window[kind] || null; } catch (e) { return null; } }
  function readJSON(kind, key) { try { var s = box(kind), v = s && s.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeJSON(kind, key, val) { try { var s = box(kind); if (s) s.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function drop(kind, key) { try { var s = box(kind); if (s) s.removeItem(key); } catch (e) {} }
  function keepOn() { try { return box('localStorage').getItem(KEEP_KEY) === '1'; } catch (e) { return false; } }
  function snapshot() { return { saved: new Date().toISOString(), data: DATA }; }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      writeJSON('sessionStorage', SESSION_KEY, snapshot()); // survives a reload, gone when the tab closes
      if (keepOn()) writeJSON('localStorage', DRAFT_KEY, snapshot());
    }, 300);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Section titles carry an italic phrase from the printed page; only <em> is let through.
  function safeTitle(p) { return esc(p.titleHtml || p.title).replace(/&lt;(\/?)em&gt;/g, '<$1em>'); }
  function today() { var d = new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function niceDate(iso) { var d = new Date(iso); return isNaN(d) ? 'earlier' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function toast(text) {
    var t = $('atToast'); t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 7000);
  }
  function msg(text) { var m = $('atResumeMsg'); m.textContent = text; m.hidden = !text; }

  // Keyboard hints taken from the printed label. The file asks for the last four digits
  // only wherever an account or card number appears, so those boxes take four digits.
  function attrsFor(label) {
    var a = ' autocomplete="off"', l = String(label).trim();
    if (/last 4/i.test(l)) return a + ' inputmode="numeric" maxlength="4" data-digits="4" placeholder="Last 4 digits only"';
    if (/^PAN$/.test(l)) return a + ' maxlength="10" autocapitalize="characters" spellcheck="false" data-upper="1"';
    if (/^e-?mail$/i.test(l)) return a + ' inputmode="email" spellcheck="false"';
    if (/^(mobile|alternate mobile|phone|direct line|branch phone)$/i.test(l)) return a + ' inputmode="tel"';
    return a;
  }

  function reg(item, kind) {
    var id = 'at' + (++seq);
    INDEX[item.id] = { item: item, kind: kind, el: id };
    return id;
  }

  function renderBlock(b, ids) {
    if (b.type === 'heading') return '<h3 class="at-h3">' + esc(b.text) + '</h3>';
    if (b.type === 'note') return '<div class="at-note"><p>' + (b.lead ? '<strong>' + esc(b.lead) + '</strong> ' : '') + esc(b.text) + '</p></div>';
    if (b.type === 'fields') {
      var inner = b.fields.map(function (f) {
        var id = reg(f, 'field'); ids.push(f.id);
        return '<label class="at-field' + (f.half ? '' : ' is-wide') + '" for="' + id + '"><span>' + esc(f.label) + '</span>' +
          '<input type="text" id="' + id + '" data-key="' + esc(f.id) + '"' + attrsFor(f.label) + ' /></label>';
      }).join('');
      return '<div class="at-card">' + (b.group ? '<p class="at-card-title">' + esc(b.group) + '</p>' : '') +
        '<div class="at-grid">' + inner + '</div>' + (b.note ? '<p class="at-card-note">' + esc(b.note) + '</p>' : '') + '</div>';
    }
    if (b.type === 'table') {
      var head = b.cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('');
      var rows = b.rows.map(function (r, ri) {
        return '<tr' + (ri >= FIRST_ROWS ? ' hidden' : '') + '><th scope="row" class="at-rowno">' + (ri + 1) + '</th>' + r.map(function (c, ci) {
          var id = reg(c, 'cell'); ids.push(c.id);
          return '<td data-label="' + esc(b.cols[ci]) + '"><input type="text" id="' + id + '" data-key="' + esc(c.id) + '" aria-label="' +
            esc(b.cols[ci] + ', row ' + (ri + 1)) + '"' + attrsFor(b.cols[ci]) + ' /></td>';
        }).join('') + '</tr>';
      }).join('');
      return (b.title ? '<h3 class="at-h3">' + esc(b.title) + '</h3>' : '') +
        '<div class="at-table-wrap"><table class="at-table" data-table="' + esc(b.id) + '"><thead><tr><th class="at-rowno"><span class="at-sr">Row</span></th>' + head +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (b.rows.length > FIRST_ROWS ? '<button type="button" class="at-add" data-addrow="' + esc(b.id) + '"><span class="at-add-plus" aria-hidden="true">+</span> Add a row</button>' : '');
    }
    if (b.type === 'checks') {
      return (b.title ? '<h3 class="at-h3">' + esc(b.title) + '</h3>' : '') + '<ul class="at-checks">' + b.items.map(function (it) {
        var id = reg(it, 'check'); ids.push(it.id);
        return '<li><label for="' + id + '"><input type="checkbox" id="' + id + '" data-key="' + esc(it.id) + '" /><span>' + esc(it.label) + '</span></label></li>';
      }).join('') + '</ul>';
    }
    if (b.type === 'lines') {
      var lid = reg(b, 'lines'); ids.push(b.id);
      return '<label class="at-field is-wide at-wishes" for="' + lid + '"><span>In your own words</span><textarea id="' + lid + '" data-key="' + esc(b.id) +
        '" rows="11"></textarea><em class="at-hint">About ' + b.lines.length + ' lines fit on the printed page. Anything longer continues on an extra page.</em></label>';
    }
    return '';
  }

  // Repeated groups (Account 1 to 4, Loan 1 and 2...) show the first; the rest open one
  // at a time, so the page starts short. The PDF keeps every slot either way.
  function baseOf(group) { return /\b\d+\b/.test(group || '') ? group.replace(/\s*\b\d+\b\s*/, ' # ').replace(/\s+/g, ' ').trim() : null; }
  function nounOf(base) {
    var n = base.replace(/\s*#\s*/, ' ').replace(/\s+/g, ' ').trim();
    return /^[A-Z][a-z]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
  }
  function renderBlocks(blocks, ids) {
    var out = [], i = 0;
    while (i < blocks.length) {
      var b = blocks[i], base = b.type === 'fields' ? baseOf(b.group) : null, run = [b];
      while (base && i + run.length < blocks.length && blocks[i + run.length].type === 'fields' && baseOf(blocks[i + run.length].group) === base) run.push(blocks[i + run.length]);
      if (run.length > 1) {
        var sid = 'set' + (++setSeq);
        out.push(renderBlock(run[0], ids));
        run.slice(1).forEach(function (rb) { out.push('<div class="at-extra" data-set="' + sid + '" hidden>' + renderBlock(rb, ids) + '</div>'); });
        out.push('<button type="button" class="at-add" data-add="' + sid + '"><span class="at-add-plus" aria-hidden="true">+</span> Add another ' + esc(nounOf(base)) + '</button>');
      } else {
        out.push(renderBlock(b, ids));
      }
      i += run.length;
    }
    return out.join('');
  }

  function build(schema) {
    var html = [], navHtml = [];
    schema.parts.forEach(function (p) {
      if (p.kind === 'guide') return; // shown as the Before you begin panel
      var ids = [];
      var head = p.kind === 'cover'
        ? '<p class="at-sec">Cover</p><h2 class="at-part-title">Whose file <em>this is</em></h2><p class="at-intro">The front page of your ATLAS. The dates fill themselves in when you download.</p>'
        : '<p class="at-sec">Section ' + esc(p.section) + (p.continued ? ' continued' : '') + '</p><h2 class="at-part-title">' + safeTitle(p) + '</h2>' +
          (p.intro ? '<p class="at-intro">' + esc(p.intro) + '</p>' : '');
      html.push('<section class="at-part" id="' + p.id + '">' + head + renderBlocks(p.blocks, ids) + '</section>');
      NAV.push({ id: p.id, ids: ids });
      navHtml.push('<li class="at-nav-item' + (p.continued ? ' is-sub' : '') + '" data-nav="' + p.id + '"><a href="#' + p.id + '">' +
        '<span class="at-nav-num">' + (p.kind === 'cover' || p.continued ? '' : esc(p.section)) + '</span>' +
        '<span class="at-nav-title">' + esc(p.kind === 'cover' ? 'Cover' : p.title) + '<span class="at-sr at-nav-state"></span></span>' +
        '<span class="at-nav-dot" aria-hidden="true"></span></a></li>');
    });
    $('atParts').innerHTML = html.join('');
    $('atParts').setAttribute('aria-busy', 'false');
    $('atNavList').innerHTML = navHtml.join('');
    NAV.forEach(function (n) {
      n.li = document.querySelector('[data-nav="' + n.id + '"]');
      n.state = n.li.querySelector('.at-nav-state');
    });
  }

  function hasData(el) { return [].some.call(el.querySelectorAll('[data-key]'), function (i) { return DATA[i.getAttribute('data-key')]; }); }
  function hiddenIn(list) { return list.filter(function (x) { return x.hidden; }); }
  // Open anything that holds an answer (and everything before it), so nothing saved is hidden.
  function syncDisclosure(collapse) {
    var sets = {};
    [].forEach.call(document.querySelectorAll('.at-extra'), function (x) { (sets[x.dataset.set] = sets[x.dataset.set] || []).push(x); });
    Object.keys(sets).forEach(function (sid) {
      var list = sets[sid], last = -1;
      list.forEach(function (x, i) { if (hasData(x)) last = i; });
      list.forEach(function (x, i) { if (i <= last) x.hidden = false; else if (collapse) x.hidden = true; });
      var btn = document.querySelector('[data-add="' + sid + '"]');
      if (btn) btn.hidden = !hiddenIn(list).length;
    });
    [].forEach.call(document.querySelectorAll('.at-table[data-table]'), function (t) {
      var rows = [].slice.call(t.tBodies[0].rows), last = FIRST_ROWS - 1;
      rows.forEach(function (r, i) { if (hasData(r)) last = Math.max(last, i); });
      rows.forEach(function (r, i) { if (i <= last) r.hidden = false; else if (collapse) r.hidden = true; });
      var btn = document.querySelector('[data-addrow="' + t.dataset.table + '"]');
      if (btn) btn.hidden = !hiddenIn(rows).length;
    });
  }
  function focusFirst(el) { var i = el.querySelector('input, textarea'); if (i) i.focus(); }

  function fillForm() {
    Object.keys(INDEX).forEach(function (key) {
      var e = $(INDEX[key].el); if (!e) return;
      if (e.type === 'checkbox') e.checked = !!DATA[key];
      else e.value = DATA[key] || '';
    });
  }

  function progress() {
    var started = 0;
    NAV.forEach(function (n) {
      var c = n.ids.filter(function (k) { return DATA[k]; }).length;
      n.li.classList.toggle('is-started', c > 0);
      n.state.textContent = c ? ', started' : '';
      if (c) started++;
    });
    $('atProgress').textContent = started + ' of ' + NAV.length + ' sections started';
    $('atProgressDock').textContent = started + ' of ' + NAV.length + ' started';
  }

  function onEdit(e) {
    var el = e.target, key = el.getAttribute && el.getAttribute('data-key');
    if (!key) return;
    if (el.type === 'checkbox') {
      if (el.checked) DATA[key] = true; else delete DATA[key];
    } else {
      if (el.getAttribute('data-upper') && el.value !== el.value.toUpperCase()) {
        var at = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(at, at); } catch (x) {}
      }
      if (el.getAttribute('data-digits') && /\D/.test(el.value)) el.value = el.value.replace(/\D/g, '').slice(0, 4);
      if (el.value.trim()) DATA[key] = el.value; else delete DATA[key];
    }
    dirty = true;
    saveSoon();
    progress();
    // Fetch the PDF tools quietly once someone starts, so the first download is quick.
    if (!warmTimer) warmTimer = setTimeout(function () { warm().catch(function () {}); }, 2500);
  }

  function fieldByLabel(partId, label, groupRx) {
    var part = SCHEMA.parts.filter(function (p) { return p.id === partId; })[0], hit = null;
    (part ? part.blocks : []).forEach(function (b) {
      if (b.type !== 'fields' || (groupRx && !groupRx.test(b.group || ''))) return;
      b.fields.forEach(function (f) { if (!hit && f.label === label) hit = f.id; });
    });
    return hit;
  }

  function setValue(key, val) {
    if (!key || !INDEX[key]) return;
    if (val) DATA[key] = val; else delete DATA[key];
    var e = $(INDEX[key].el); if (e) e.value = val || '';
  }

  // ============ Making the PDF (on this device) ============
  var loaded = {}, warmed = null;
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { delete loaded[src]; bad(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function bytes(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }); }
  function warm() {
    if (!warmed) warmed = Promise.all([loadScript('vendor/pdf-lib.min.js'), loadScript('vendor/fontkit.umd.min.js')])
      .then(function () { return Promise.all([bytes('atlas/template.pdf'), bytes('atlas/Poppins-Regular.ttf')]); })
      .catch(function (e) { warmed = null; throw e; });
    return warmed;
  }

  function makePdf(tplBuf, fontBuf) {
    var L = window.PDFLib;
    return L.PDFDocument.load(tplBuf).then(function (pdf) {
      pdf.registerFontkit(window.fontkit);
      return pdf.embedFont(fontBuf, { subset: true }).then(function (font) {
        var pages = pdf.getPages(), H = pages[0].getHeight(), W = pages[0].getWidth();
        var ink = L.rgb(0.04, 0.10, 0.21), white = L.rgb(1, 1, 1), rule = L.rgb(0.78, 0.80, 0.84), gold = L.rgb(0.725, 0.576, 0.349);
        var chars = new Set(font.getCharacterSet()), short = [], odd = [];
        var ELL = chars.has(0x2026) ? '…' : '...';
        var widthOf = function (t, s) { return font.widthOfTextAtSize(t, s); };

        function clean(s, item) { // characters the font cannot draw become '?', and the field is noted
          var src = String(s).replace(/[\u0000-\u001f]+/g, ' ');
          var out = Array.from(src).map(function (ch) { return chars.has(ch.codePointAt(0)) ? ch : '?'; }).join('');
          if (out !== src && item && odd.indexOf(item) < 0) odd.push(item);
          return out;
        }
        function breakLong(word, w, size) { // a word wider than the space is split by characters
          var parts = [], cur = '';
          Array.from(word).forEach(function (ch) { if (cur && widthOf(cur + ch, size) > w) { parts.push(cur); cur = ch; } else cur += ch; });
          if (cur) parts.push(cur);
          return parts;
        }
        function wrap(text, w, size) {
          var lines = [], cur = '';
          text.split(' ').forEach(function (word) {
            if (!word) return;
            (widthOf(word, size) > w ? breakLong(word, w, size) : [word]).forEach(function (pc) {
              var t = cur ? cur + ' ' + pc : pc;
              if (widthOf(t, size) <= w) cur = t; else { if (cur) lines.push(cur); cur = pc; }
            });
          });
          if (cur) lines.push(cur);
          return lines;
        }
        // Shrink to fit; then two lines at the smallest size; then shorten with an ellipsis.
        function fit(text, w, size, min, maxLines) {
          var s = size;
          while (s > min && widthOf(text, s) > w) s = Math.round((s - 0.25) * 100) / 100;
          if (widthOf(text, s) <= w) return { lines: [text], size: s, cut: false };
          var lines = wrap(text, w, min), cut = lines.length > maxLines;
          lines = lines.slice(0, maxLines);
          if (cut) {
            var last = lines.length - 1;
            while (lines[last].length > 1 && widthOf(lines[last] + ELL, min) > w) lines[last] = lines[last].slice(0, -1);
            lines[last] = lines[last].replace(/\s+$/, '') + ELL;
          }
          return { lines: lines, size: min, cut: cut };
        }

        Object.keys(DATA).forEach(function (key) {
          var ent = INDEX[key], val = DATA[key];
          if (!ent || !val) return;
          var it = ent.item;
          if (ent.kind === 'field') {
            var r = fit(clean(String(val).replace(/\s+/g, ' ').trim(), it), it.x1 - it.x0, it.light ? 10 : 8.5, 6, 2), lh = r.size + 1.3;
            if (r.cut) short.push(it);
            r.lines.forEach(function (ln, i) { // the last line sits on the rule, any earlier one just above it
              pages[it.page].drawText(ln, { x: it.x0, y: H - it.y + (r.lines.length - 1 - i) * lh, size: r.size, font: font, color: it.light ? white : ink });
            });
          } else if (ent.kind === 'cell') {
            var c = fit(clean(String(val).replace(/\s+/g, ' ').trim(), it), it.x1 - it.x0, 8, 6, 2), clh = c.size + 1.3;
            if (c.cut) short.push(it);
            var top = it.y0 + ((it.y1 - it.y0) - c.lines.length * clh) / 2;
            c.lines.forEach(function (ln, i) {
              pages[it.page].drawText(ln, { x: it.x0, y: H - (top + (i + 1) * clh - 1.7), size: c.size, font: font, color: ink });
            });
          } else if (ent.kind === 'check') {
            var b = it.box, pg = pages[it.page];
            var p1 = { x: b[0] + 1.4, y: H - (b[1] + 3.9) }, p2 = { x: b[0] + 3.1, y: H - (b[3] - 1.4) }, p3 = { x: b[2] - 1.1, y: H - (b[1] + 1.3) };
            pg.drawLine({ start: p1, end: p2, thickness: 1.1, color: ink });
            pg.drawLine({ start: p2, end: p3, thickness: 1.1, color: ink });
          }
        });

        // Personal wishes: onto the ruled lines, then onto extra pages if it runs long.
        Object.keys(INDEX).forEach(function (key) {
          var ent = INDEX[key];
          if (ent.kind !== 'lines' || !DATA[key]) return;
          var blk = ent.item, size = 9, w = blk.lines[0].x1 - blk.lines[0].x0, lines = [];
          String(DATA[key]).replace(/\r/g, '').split('\n').forEach(function (para) {
            var t = clean(para.replace(/\s+/g, ' ').trim(), blk);
            if (!t) { lines.push(''); return; }
            wrap(t, w, size).forEach(function (l) { lines.push(l); });
          });
          while (lines.length && !lines[lines.length - 1]) lines.pop();
          lines.slice(0, blk.lines.length).forEach(function (ln, i) {
            if (ln) pages[blk.page].drawText(ln, { x: blk.lines[i].x0, y: H - blk.lines[i].y, size: size, font: font, color: ink });
          });
          var rest = lines.slice(blk.lines.length), at = blk.page + 1, per = 22;
          for (var k = 0; rest.length; k++) {
            var np = pdf.insertPage(at + k, [W, H]), chunk = rest.splice(0, per);
            np.drawText('PERSONAL WISHES, CONTINUED', { x: 50.7, y: H - 60, size: 7, font: font, color: gold });
            np.drawRectangle({ x: 50.7, y: H - 80, width: W - 101.4, height: 0.6, color: L.rgb(0.86, 0.87, 0.90) });
            chunk.forEach(function (ln, i) {
              var base = 110 + i * 26.5;
              np.drawRectangle({ x: 50.7, y: H - base - 4, width: W - 101.4, height: 0.55, color: rule });
              if (ln) np.drawText(ln, { x: 52.7, y: H - base, size: size, font: font, color: ink });
            });
            np.drawText('SELEQT  ·  ATLAS', { x: 50.7, y: 50, size: 6.5, font: font, color: ink });
          }
        });

        var name = (DATA['cover.prepared-for'] || '').trim();
        pdf.setTitle('SELEQT ATLAS' + (name ? ', prepared for ' + clean(name) : ''), { showInWindowTitleBar: true });
        pdf.setSubject('Family preparedness file');
        pdf.setCreator('SELEQT ATLAS, filled in on the owner’s device');
        pdf.setProducer('SELEQT ATLAS');
        pdf.setKeywords(['SELEQT', 'ATLAS', 'family preparedness']);
        // The answers ride along inside the PDF, so it can be loaded back here to edit.
        var payload = new TextEncoder().encode(JSON.stringify({ app: 'seleqt-atlas', v: 1, saved: new Date().toISOString(), data: DATA }));
        return pdf.attach(payload, 'atlas-data.json', {
          mimeType: 'application/json',
          description: 'Your ATLAS answers. Load this PDF back into the ATLAS page to continue editing.',
          creationDate: new Date(), modificationDate: new Date()
        }).then(function () { return pdf.save(); }).then(function (out) { return { bytes: out, short: short, odd: odd }; });
      });
    });
  }

  function fileName() {
    var who = (DATA['cover.prepared-for'] || '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().replace(/\s+/g, '-');
    var d = new Date(), iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return 'SELEQT-ATLAS' + (who ? '-' + who : '') + '-' + iso + '.pdf';
  }
  function saveFile(data, name) {
    var url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function busy(on) {
    [].forEach.call(document.querySelectorAll('[data-at-download]'), function (b) {
      if (on) { b.dataset.label = b.textContent; b.textContent = 'Making PDF...'; } else if (b.dataset.label) b.textContent = b.dataset.label;
      b.disabled = on;
    });
  }

  function download() {
    // The cover dates keep themselves current.
    if (!DATA['cover.date-created']) setValue('cover.date-created', today());
    setValue('cover.last-updated', today());
    saveSoon(); progress();
    busy(true);
    warm()
      .then(function (b) { return makePdf(b[0].slice(0), b[1].slice(0)); }) // copies, so the cached files stay untouched
      .then(function (res) {
        saveFile(res.bytes, fileName());
        dirty = false;
        var notes = [];
        if (res.short.length) notes.push(res.short.length + (res.short.length === 1 ? ' answer was' : ' answers were') + ' too long for the printed space and ' + (res.short.length === 1 ? 'is' : 'are') + ' shortened on the page (the full text is kept inside the PDF)');
        if (res.odd.length) notes.push('some characters outside English letters print as ?');
        toast('Your ATLAS PDF is downloading.' + (notes.length ? ' Note: ' + notes.join('; ') + '.' : ' Store it the way you would store a will.'));
      })
      .catch(function (err) {
        toast('The PDF could not be made on this device. Please try again, or try a recent Chrome, Safari, Edge, or Firefox.');
        if (window.console) console.error(err);
      })
      .then(function () { busy(false); });
  }

  // ============ Continuing from a saved ATLAS PDF ============
  function resume(file) {
    msg('Opening your ATLAS on this device...');
    loadScript('vendor/pdf.min.js').then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    }).then(function (doc) { return doc.getAttachments(); }).then(function (att) {
      var hit = att ? Object.keys(att).map(function (k) { return att[k]; }).filter(function (a) { return /atlas-data\.json$/i.test(a.filename || ''); })[0] : null;
      if (!hit) throw new Error('none');
      var saved = JSON.parse(new TextDecoder().decode(hit.content));
      if (!saved || saved.app !== 'seleqt-atlas' || !saved.data) throw new Error('none');
      if (Object.keys(DATA).length && !window.confirm('Replace the answers on this page with the ones in that PDF?')) { msg(''); return; }
      DATA = {};
      Object.keys(saved.data).forEach(function (k) { if (INDEX[k] && saved.data[k]) DATA[k] = saved.data[k]; });
      fillForm(); syncDisclosure(true); progress(); saveSoon(); dirty = false;
      msg('Loaded your ATLAS saved on ' + niceDate(saved.saved) + '. Pick up where you left off, then download a fresh copy.');
      $('atStart').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (e) {
      msg(e && e.message === 'none'
        ? 'That PDF has no saved answers in it. Choose an ATLAS PDF you downloaded from this page.'
        : 'That file could not be opened. Choose an ATLAS PDF you downloaded from this page.');
    });
  }

  // ============ Start ============
  function start(schema) {
    SCHEMA = schema;
    build(schema);
    var snap = (keepOn() && readJSON('localStorage', DRAFT_KEY)) || readJSON('sessionStorage', SESSION_KEY);
    if (snap && snap.data) Object.keys(snap.data).forEach(function (k) { if (INDEX[k]) DATA[k] = snap.data[k]; });
    if (snap && keepOn() && Object.keys(DATA).length) msg('Your draft from ' + niceDate(snap.saved) + ' is back. It stays on this device until you clear it.');
    // An adviser can share a link that names them: ?adviser=Name
    var adv = (new URLSearchParams(location.search).get('adviser') || '').trim().slice(0, 60);
    if (adv) {
      if (!DATA['cover.seleqt-adviser']) DATA['cover.seleqt-adviser'] = adv;
      var rm = fieldByLabel('p04', 'Name', /relationship manager/i);
      if (rm && !DATA[rm]) DATA[rm] = adv;
    }
    fillForm();
    syncDisclosure();
    progress();

    $('atParts').addEventListener('input', onEdit);
    $('atParts').addEventListener('change', onEdit);
    $('atParts').addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]'), addRow = e.target.closest('[data-addrow]'), next, rest;
      if (add) {
        rest = [].slice.call(document.querySelectorAll('.at-extra[data-set="' + add.dataset.add + '"]'));
        next = hiddenIn(rest)[0];
      } else if (addRow) {
        var t = document.querySelector('.at-table[data-table="' + addRow.dataset.addrow + '"]');
        rest = t ? [].slice.call(t.tBodies[0].rows) : [];
        next = hiddenIn(rest)[0];
      } else return;
      if (next) { next.hidden = false; focusFirst(next); }
      if (!hiddenIn(rest).length) (add || addRow).hidden = true;
    });
    [].forEach.call(document.querySelectorAll('[data-at-download]'), function (b) { b.addEventListener('click', download); });

    // Section highlighting while scrolling
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          NAV.forEach(function (n) { n.li.classList.toggle('is-current', n.id === en.target.id); });
        });
      }, { rootMargin: '-35% 0px -60% 0px' });
      NAV.forEach(function (n) { io.observe($(n.id)); });
    }
  }

  // Inside apps' built-in browsers (Instagram, Facebook, Android web views) downloads often fail.
  if (/FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(navigator.userAgent || '')) $('atInApp').hidden = false;

  // Sections panel on phones
  function navOpen(on, keepFocus) {
    document.body.classList.toggle('at-nav-open', on);
    $('atNavOpen').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (keepFocus) return;
    if (on) $('atNavClose').focus(); else $('atNavOpen').focus();
  }
  $('atNavOpen').addEventListener('click', function () { navOpen(true); });
  $('atNavClose').addEventListener('click', function () { navOpen(false); });
  $('atNavList').addEventListener('click', function (e) { if (e.target.closest('a') && document.body.classList.contains('at-nav-open')) navOpen(false, true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('at-nav-open')) navOpen(false); });

  $('atResume').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) resume(f); this.value = ''; });

  $('atKeep').checked = keepOn();
  $('atKeep').addEventListener('change', function () {
    try {
      if (this.checked) {
        box('localStorage').setItem(KEEP_KEY, '1');
        writeJSON('localStorage', DRAFT_KEY, snapshot());
        toast('Your draft will stay on this device until you clear it.');
      } else {
        box('localStorage').removeItem(KEEP_KEY);
        drop('localStorage', DRAFT_KEY);
        toast('Draft removed from this device. Your answers now last until this tab closes.');
      }
    } catch (e) { this.checked = false; toast('This browser is not allowing anything to be kept on the device.'); }
  });

  $('atClear').addEventListener('click', function () {
    if (!window.confirm('Clear every answer on this page? Download your PDF first if you want to keep them.')) return;
    DATA = {};
    drop('sessionStorage', SESSION_KEY); drop('localStorage', DRAFT_KEY);
    fillForm(); syncDisclosure(true); progress(); dirty = false; msg('');
    toast('Cleared. Nothing from this page is kept on this device.');
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty && !keepOn() && Object.keys(DATA).length) { e.preventDefault(); e.returnValue = ''; }
  });

  fetch('atlas/schema.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(start).catch(function () {
    $('atParts').innerHTML = '<p class="at-loading">This page could not load. Please refresh, or try a recent Chrome, Safari, Edge, or Firefox.</p>';
  });
})();
