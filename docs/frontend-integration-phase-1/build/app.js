(function(){
  "use strict";
  var DATA = JSON.parse(document.getElementById('steps-data').textContent);
  var STEPS = DATA.steps;
  var ERRORS = DATA.errors;
  var DEMO = DATA.demo;

  var LS_KEY = "cmhp-phase1-checklist-v1";
  var LS_CONN_KEY = "cmhp-phase1-connection-v1";

  function esc(s){
    if(s===null||s===undefined) return '';
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fmtJSON(obj){ return obj===null||obj===undefined ? null : JSON.stringify(obj, null, 2); }

  function loadState(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch(e){ return {}; }
  }
  function saveState(state){
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){ /* private mode etc - degrade silently */ }
  }
  var checklist = loadState();

  function loadConn(){
    try {
      var raw = localStorage.getItem(LS_CONN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch(e){ return {}; }
  }
  function saveConn(conn){
    try { localStorage.setItem(LS_CONN_KEY, JSON.stringify(conn)); } catch(e){}
  }
  var conn = loadConn();

  /* ---------- Connection form persistence ---------- */
  document.querySelectorAll('[data-conn-field]').forEach(function(input){
    var key = input.dataset.connField;
    if(conn[key]) input.value = conn[key];
    input.addEventListener('input', function(){
      conn[key] = input.value;
      saveConn(conn);
      var st = document.getElementById('connection-save-status');
      if(st){ st.textContent = 'Saved locally as you type.'; }
    });
  });

  /* ---------- Step card rendering ---------- */
  var SECTION_CONTAINER = {
    login: "steps-login", workspace: "steps-workspace", lookups: "steps-lookups",
    create: "steps-create", "list-detail": "steps-list-detail", edit: "steps-edit"
  };

  function fieldRow(label, value){
    if(value===null || value===undefined || value==='') return '';
    return '<tr><td style="white-space:nowrap;color:#7a8399;font-size:11px;text-transform:uppercase">'+esc(label)+'</td><td>'+value+'</td></tr>';
  }

  function renderRequest(req){
    var parts = [];
    if(req.headers) parts.push('<p><strong>Headers:</strong> <span class="mono">'+esc(req.headers)+'</span></p>');
    if(req.query) parts.push('<p><strong>Query parameters:</strong> '+esc(req.query)+'</p>');
    if(req.body!==null && req.body!==undefined){
      parts.push('<p><strong>Body (copyable synthetic JSON):</strong></p><pre class="code">'+esc(fmtJSON(req.body))+'</pre>');
    } else if(req.body===null && req.headers){
      parts.push('<p style="color:#8b93a8">No request body.</p>');
    }
    return parts.join('');
  }
  function renderResponse(res){
    if(!res) return '<p style="color:#8b93a8">No new response — see the note above.</p>';
    var html = '<p><strong>Status:</strong> '+res.status+'</p>';
    if(res.body!==null && res.body!==undefined){
      html += '<pre class="code">'+esc(fmtJSON(res.body))+'<span class="illustrative-tag">Illustrative synthetic example — not a captured live response.</span></pre>';
    } else {
      html += '<p style="color:#8b93a8">Empty body.</p>';
    }
    if(res.note) html += '<p style="font-size:12.5px;color:var(--ink-soft)">'+esc(res.note)+'</p>';
    return html;
  }
  function statesHtml(states){
    if(!states) return '';
    var order = ['loading','empty','success','error'];
    var lis = order.filter(function(k){ return states[k]; }).map(function(k){
      return '<li><b>'+k.charAt(0).toUpperCase()+k.slice(1)+':</b> '+esc(states[k])+'</li>';
    });
    return '<ul class="state-list">'+lis.join('')+'</ul>';
  }

  function statusWidgetHtml(id){
    var s = checklist[id] || {status:'not_started', note:''};
    var opts = ['not_started','in_progress','blocked','verified'].map(function(v){
      var labels = {not_started:'Not started', in_progress:'In progress', blocked:'Blocked', verified:'Verified in browser'};
      return '<option value="'+v+'"'+(s.status===v?' selected':'')+'>'+labels[v]+'</option>';
    }).join('');
    return '<div class="status-widget" data-step-widget="'+id+'">'+
      '<span class="status-pill '+s.status+'" data-status-pill="'+id+'">'+
        ({not_started:'Not started', in_progress:'In progress', blocked:'Blocked', verified:'Verified in browser'})[s.status]+
      '</span>'+
      '<select data-status-select="'+id+'" aria-label="Status for this step">'+opts+'</select>'+
      '<input type="text" data-status-note="'+id+'" placeholder="Optional blocker/evidence note..." value="'+esc(s.note||'')+'">'+
      '</div>';
  }

  STEPS.forEach(function(step){
    var container = document.getElementById(SECTION_CONTAINER[step.section]);
    if(!container) return;
    var card = document.createElement('div');
    card.className = 'step-card';
    card.id = step.id;
    var methodBadge = step.method && step.method !== 'n/a' ? '<span class="badge '+step.method+'">'+step.method+'</span>' : '';
    var endpointLine = step.method && step.method !== 'n/a'
      ? '<div class="endpoint-line">'+methodBadge+' '+esc(step.path)+'</div>'
      : '<p style="font-size:12.5px;color:#8b93a8">'+esc(step.path)+'</p>';

    var body = '';
    body += '<h5>What the user does</h5><p>'+esc(step.user_does)+'</p>';
    body += '<div class="who-grid">'+
      '<div class="who-box junior"><b>The junior implements</b>'+esc(step.junior)+'</div>'+
      '<div class="who-box you"><b>You / backend supply</b>'+esc(step.you_supply)+'</div>'+
      '</div>';
    body += '<h5>Endpoint</h5>'+endpointLine;
    if(step.prereq && step.prereq.length){
      body += '<h5>Prerequisite data &amp; permissions</h5><ul style="font-size:12.5px;margin:4px 0 0 18px">'+
        step.prereq.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join('')+'</ul>';
    }
    body += '<h5>Request</h5>'+renderRequest(step.request);
    body += '<h5>Representative response</h5>'+renderResponse(step.response);
    body += '<h5>What the frontend stores, and where</h5><p>'+esc(step.stored)+'</p>';
    body += '<h5>What this triggers next</h5><p>'+esc(step.triggers)+'</p>';
    body += '<h5>Loading / empty / success / error behavior</h5>'+statesHtml(step.states);
    if(step.done_when && step.done_when.length){
      body += '<div class="done-when"><strong>Done when…</strong><ul>'+
        step.done_when.map(function(d){ return '<li>'+esc(d)+'</li>'; }).join('')+'</ul></div>';
    }
    if(step.source_files && step.source_files.length){
      body += '<h5>Backend source files</h5><p class="src-files">'+step.source_files.map(esc).join('<br>')+'</p>';
    }

    card.innerHTML =
      '<div class="step-head"><div class="num">'+step.num+'</div><div class="htxt"><h3>'+esc(step.title)+'</h3><div class="screen">'+esc(step.screen)+'</div></div></div>'+
      '<div class="step-body">'+body+'</div>'+
      statusWidgetHtml(step.id);
    container.appendChild(card);
  });

  /* ---------- Checklist status wiring ---------- */
  var LABELS = {not_started:'Not started', in_progress:'In progress', blocked:'Blocked', verified:'Verified in browser'};

  function setStatus(id, status){
    if(!checklist[id]) checklist[id] = {status:'not_started', note:''};
    checklist[id].status = status;
    saveState(checklist);
    var pill = document.querySelector('[data-status-pill="'+id+'"]');
    if(pill){ pill.className = 'status-pill '+status; pill.textContent = LABELS[status]; }
    renderProgressSummary();
  }
  function setNote(id, note){
    if(!checklist[id]) checklist[id] = {status:'not_started', note:''};
    checklist[id].note = note;
    saveState(checklist);
  }
  document.addEventListener('change', function(e){
    var t = e.target;
    if(t.matches('[data-status-select]')){
      setStatus(t.dataset.statusSelect, t.value);
    }
  });
  document.addEventListener('input', function(e){
    var t = e.target;
    if(t.matches('[data-status-note]')){
      setNote(t.dataset.statusNote, t.value);
    }
  });

  /* ---------- Progress summary + table ---------- */
  function renderProgressSummary(){
    var counts = {not_started:0, in_progress:0, blocked:0, verified:0};
    STEPS.forEach(function(s){
      var st = (checklist[s.id] && checklist[s.id].status) || 'not_started';
      counts[st]++;
    });
    var el = document.getElementById('progress-summary');
    if(el){
      el.innerHTML = Object.keys(counts).map(function(k){
        return '<span class="progress-chip status-pill '+k+'">'+LABELS[k]+': '+counts[k]+' / '+STEPS.length+'</span>';
      }).join('');
    }
    var tbody = document.querySelector('#progress-table tbody');
    if(tbody){
      tbody.innerHTML = STEPS.map(function(s){
        var entry = checklist[s.id] || {status:'not_started', note:''};
        return '<tr><td>'+esc(s.section)+'</td><td><a href="#'+s.id+'">'+esc(s.title)+'</a></td>'+
          '<td><span class="status-pill '+entry.status+'">'+LABELS[entry.status]+'</span></td>'+
          '<td>'+esc(entry.note||'')+'</td></tr>';
      }).join('');
    }
  }

  /* ---------- Export / Import ---------- */
  document.getElementById('btn-export').addEventListener('click', function(){
    var payload = {
      format: "cmhp-phase1-checklist",
      version: 1,
      exported_at: new Date().toISOString(),
      checklist: checklist,
      connection: conn,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = "cmhp-phase1-progress-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import-trigger').addEventListener('click', function(){
    document.getElementById('file-import').click();
  });
  document.getElementById('file-import').addEventListener('change', function(e){
    var file = e.target.files[0];
    var statusEl = document.getElementById('import-status');
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var parsed = JSON.parse(reader.result);
        if(parsed.format !== "cmhp-phase1-checklist" || typeof parsed.checklist !== "object" || parsed.checklist === null){
          throw new Error("Not a recognized progress-export file (missing format/checklist).");
        }
        var validIds = {};
        STEPS.forEach(function(s){ validIds[s.id] = true; });
        var cleaned = {};
        Object.keys(parsed.checklist).forEach(function(id){
          if(!validIds[id]) return; // ignore unknown step ids rather than crashing
          var entry = parsed.checklist[id] || {};
          var status = ['not_started','in_progress','blocked','verified'].indexOf(entry.status) >= 0 ? entry.status : 'not_started';
          cleaned[id] = {status: status, note: typeof entry.note === 'string' ? entry.note.slice(0, 500) : ''};
        });
        checklist = cleaned;
        saveState(checklist);
        if(parsed.connection && typeof parsed.connection === 'object'){
          conn = parsed.connection;
          saveConn(conn);
          document.querySelectorAll('[data-conn-field]').forEach(function(input){
            input.value = conn[input.dataset.connField] || '';
          });
        }
        // Re-render every widget
        STEPS.forEach(function(s){
          var entry = checklist[s.id] || {status:'not_started', note:''};
          var select = document.querySelector('[data-status-select="'+s.id+'"]');
          var note = document.querySelector('[data-status-note="'+s.id+'"]');
          var pill = document.querySelector('[data-status-pill="'+s.id+'"]');
          if(select) select.value = entry.status;
          if(note) note.value = entry.note;
          if(pill){ pill.className = 'status-pill '+entry.status; pill.textContent = LABELS[entry.status]; }
        });
        renderProgressSummary();
        statusEl.className = 'import-status ok';
        statusEl.textContent = 'Imported ' + Object.keys(cleaned).length + ' step statuses successfully.';
      } catch(err){
        statusEl.className = 'import-status err';
        statusEl.textContent = 'Import failed: ' + err.message + ' — no changes were made.';
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-reset').addEventListener('click', function(){
    if(!confirm('Reset all progress in this browser? This cannot be undone (export first if you want a backup).')) return;
    checklist = {};
    saveState(checklist);
    STEPS.forEach(function(s){
      var select = document.querySelector('[data-status-select="'+s.id+'"]');
      var note = document.querySelector('[data-status-note="'+s.id+'"]');
      var pill = document.querySelector('[data-status-pill="'+s.id+'"]');
      if(select) select.value = 'not_started';
      if(note) note.value = '';
      if(pill){ pill.className = 'status-pill not_started'; pill.textContent = 'Not started'; }
    });
    renderProgressSummary();
    document.getElementById('import-status').textContent = '';
  });

  renderProgressSummary();

  /* ---------- Error table ---------- */
  var errTable = document.getElementById('error-table');
  if(errTable){
    errTable.innerHTML = '<thead><tr><th>Scenario</th><th>What the user sees</th><th>What the junior checks</th><th>What you/backend check</th></tr></thead><tbody>'+
      ERRORS.map(function(e){
        return '<tr><td><strong>'+esc(e.scenario)+'</strong></td><td>'+esc(e.user_sees)+'</td><td>'+esc(e.junior_checks)+'</td><td>'+esc(e.you_check)+'</td></tr>';
      }).join('')+
      '</tbody>';
  }

  /* ---------- Demo script ---------- */
  var demoOl = document.getElementById('demo-script');
  if(demoOl){
    demoOl.innerHTML = DEMO.map(function(d){
      return '<li><h4>'+esc(d.title)+'</h4><p class="expect"><strong>Expected result:</strong> '+esc(d.expect)+'</p></li>';
    }).join('');
  }

  /* ---------- Scrollspy ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.sidebar a[data-nav]'));
  var sections = navLinks.map(function(a){ return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  function onScroll(){
    var y = window.scrollY + 80;
    var current = null;
    sections.forEach(function(sec){ if(sec.offsetTop <= y) current = sec; });
    navLinks.forEach(function(a){ a.classList.remove('active'); });
    if(current){
      var match = navLinks.find(function(a){ return a.getAttribute('href')==='#'+current.id; });
      if(match) match.classList.add('active');
    }
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
})();
