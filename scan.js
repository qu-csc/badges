/* أدوات المحطات المشتركة (المدخل + الجهة)
 *  Scan.attach(input, onCode)  : التقاط جهاز السحب (يكتب الرقم ثم Enter) والإدخال اليدوي
 *  Scan.camera(onCode)         : المسح بكاميرا الجوال (QR أو باركود) — يبقى مفتوحًا للزائر التالي
 *  Scan.beep(kind)             : أصوات: ok / dup / bad / saved
 *  Scan.queue(key)             : طابور المسحات دون إنترنت
 */
(function () {
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  /* ---------- الأصوات ---------- */
  var ctx = null, muted = LS.get('st_muted') === '1';
  function unlock() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  function tone(freq, start, dur, type, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.35, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function beep(kind) {
    try { navigator.vibrate && navigator.vibrate(kind === 'bad' ? [80, 60, 80] : kind === 'ok' ? 60 : 30); } catch (e) {}
    if (muted) return;
    unlock();
    if (!ctx) return;
    try {
      if (kind === 'ok') { tone(880, 0, 0.12); tone(1320, 0.11, 0.18); }
      else if (kind === 'dup') { tone(660, 0, 0.16); tone(660, 0.2, 0.16); }
      else if (kind === 'saved') { tone(740, 0, 0.14, 'triangle'); }
      else { tone(220, 0, 0.35, 'square', 0.18); }
    } catch (e) {}
  }

  /* ---------- جهاز السحب والإدخال اليدوي ---------- */
  function attach(input, onCode, opt) {
    opt = opt || {};
    var times = [];
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        var raw = input.value;
        input.value = '';
        // جهاز السحب يكتب بسرعة كبيرة (أقل من 40 ملي ثانية بين الأرقام)
        var fast = times.length >= 4 && (times[times.length - 1] - times[0]) / (times.length - 1) < 40;
        times = [];
        var code = window.Badge.normalize(raw);
        if (code) onCode(code, fast ? 'scanner' : 'manual');
        return;
      }
    });
    // توقيت كل حرف يصل للخانة (يعمل مع أي لغة للوحة المفاتيح)
    input.addEventListener('input', function () {
      if (!input.value) { times = []; return; }
      times.push(performance.now());
    });
    // إبقاء خانة الإدخال جاهزة دائمًا على الكمبيوتر (لا نفعل ذلك على الجوال حتى لا تظهر لوحة المفاتيح)
    if (!TOUCH) {
      var refocus = function () {
        if (opt.paused && opt.paused()) return;
        var a = document.activeElement;
        if (a && a !== input && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
        if (a !== input) input.focus({ preventScroll: true });
      };
      setInterval(refocus, 700);
      document.addEventListener('click', function () { setTimeout(refocus, 50); });
      input.focus();
    }
  }

  /* ---------- الكاميرا ---------- */
  var libP = null, cam = null, camOn = false, lastCam = { code: '', t: 0 };
  function loadLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (!libP) libP = new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = 'html5-qrcode.min.js'; s.async = true;
      s.onload = ok; s.onerror = function () { libP = null; bad(new Error('lib')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function overlay() {
    var o = document.getElementById('camOverlay');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'camOverlay';
    o.innerHTML = '<div class="cam-top"><b>امسح الباجة بالكاميرا</b><button type="button" id="camClose" aria-label="إغلاق">✕</button></div>' +
      '<div id="camReader"></div><div class="cam-hint" id="camHint">وجّه الكاميرا نحو رمز QR أو الباركود في الباجة</div>';
    document.body.appendChild(o);
    document.getElementById('camClose').onclick = closeCamera;
    return o;
  }
  function closeCamera() {
    camOn = false;
    var o = document.getElementById('camOverlay');
    var done = function () { if (o) o.hidden = true; };
    try { if (cam && cam.isScanning) cam.stop().then(done, done); else done(); } catch (e) { done(); }
  }
  function camera(onCode) {
    var o = overlay();
    o.hidden = false;
    document.getElementById('camHint').textContent = 'جارٍ تشغيل الكاميرا…';
    loadLib().then(function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
      if (!cam) cam = new window.Html5Qrcode('camReader', {
        verbose: false,
        formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE, window.Html5QrcodeSupportedFormats.CODE_128],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      camOn = true;
      return cam.start({ facingMode: 'environment' },
        { fps: 15, qrbox: function (w, h) { var s = Math.floor(Math.min(w, h) * 0.8); return { width: s, height: Math.floor(s * 0.75) }; } },
        function (text) {
          var code = window.Badge.normalize(text), now = Date.now();
          if (!code || (code === lastCam.code && now - lastCam.t < 3000)) return; // نفس الباجة أمام الكاميرا
          lastCam = { code: code, t: now };
          onCode(code, 'camera');
        }, function () {});
    }).then(function () {
      document.getElementById('camHint').textContent = 'وجّه الكاميرا نحو رمز QR أو الباركود في الباجة';
    }).catch(function () {
      camOn = false;
      document.getElementById('camHint').textContent = 'تعذر تشغيل الكاميرا — اسمح للمتصفح باستخدامها من إعدادات الموقع';
    });
  }

  /* ---------- طابور دون إنترنت ---------- */
  function queue(key) {
    var read = function () { try { return JSON.parse(LS.get(key) || '[]'); } catch (e) { return []; } };
    return {
      all: read,
      size: function () { return read().length; },
      push: function (item) { var q = read(); q.push(item); LS.set(key, JSON.stringify(q)); },
      remove: function (sid) { LS.set(key, JSON.stringify(read().filter(function (x) { return x.sid !== sid; }))); },
      has: function (code) { return read().some(function (x) { return x.code === code; }); }
    };
  }

  function sid() { return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  window.Scan = {
    attach: attach, camera: camera, closeCamera: closeCamera, beep: beep, queue: queue, sid: sid, LS: LS, touch: TOUCH,
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; LS.set('st_muted', muted ? '1' : '0'); return muted; }
  };
})();
