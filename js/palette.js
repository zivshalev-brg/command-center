// ===============================================================
// COMMAND PALETTE
// ===============================================================
function openPalette() { $('paletteBg').classList.add('show'); $('paletteInput').value=''; $('paletteInput').focus(); searchPalette(''); }
function closePalette() { $('paletteBg').classList.remove('show'); }

function searchPalette(q) {
  const results = [];
  const ql = q.toLowerCase();
  if (!ql) { $('paletteResults').innerHTML=''; return; }

  // Threads (unified inbox) — search subject, preview, and message text
  for (const [id,th] of Object.entries(DATA.comms.threads || {})) {
    const matchSubject = th.subject.toLowerCase().includes(ql);
    const matchPreview = th.preview && th.preview.toLowerCase().includes(ql);
    const matchMessages = th.messages && th.messages.some(m => m.text && m.text.toLowerCase().includes(ql));
    const matchPeople = th.people && th.people.some(p => p.toLowerCase().includes(ql));
    if (matchSubject || matchPreview || matchMessages || matchPeople) {
      const tagLabel = th.priority.charAt(0).toUpperCase()+th.priority.slice(1);
      const isSlack = th.sources && th.sources.includes('slack');
      const sub = tagLabel + (isSlack ? ' \u00B7 Slack' : '') + (th.slackChannelName ? ' ' + th.slackChannelName : '');
      results.push({type:'comms',id,title:th.subject,sub,colour:th.priority==='critical'?'var(--rd)':th.priority==='action'?'var(--or)':isSlack?'var(--pu)':'var(--ac)'});
    }
  }
  // Insights (Daily Summary)
  DATA.dailySummary.insights.forEach(ins => {
    if (ins.title.toLowerCase().includes(ql)) results.push({type:'summary',id:ins.id,title:ins.title,sub:'Insight',colour:'var(--cy)'});
  });
  // Projects
  for (const [id,p] of Object.entries(DATA.projects)) {
    if (p.title.toLowerCase().includes(ql)) results.push({type:'projects',id,title:p.title,sub:p.status,colour:p.colour});
  }
  // People
  for (const [id,p] of Object.entries(DATA.people)) {
    if (p.n.toLowerCase().includes(ql) || p.role.toLowerCase().includes(ql)) results.push({type:'people',id,title:p.n,sub:p.role,colour:p.colour});
  }
  // News articles
  if (DATA.news?.articles) {
    DATA.news.articles.forEach(a => {
      if (a.title.toLowerCase().includes(ql) || (a.summary || '').toLowerCase().includes(ql)) {
        results.push({type:'news',id:a.id,title:a.title,sub:(a.sourceName||a.source)+' \u00B7 '+timeAgo(a.publishedAt),colour:'var(--or)'});
      }
    });
  }
  // Tech news articles
  if (DATA.techNews?.articles) {
    DATA.techNews.articles.forEach(a => {
      if (a.title.toLowerCase().includes(ql) || (a.summary || '').toLowerCase().includes(ql)) {
        results.push({type:'technews',id:a.id,title:a.title,sub:(a.sourceName||a.source)+' \u00B7 '+timeAgo(a.publishedAt),colour:'#8b5cf6'});
      }
    });
  }

  $('paletteResults').innerHTML = results.slice(0,8).map((r,i) =>
    `<div class="palette-item${i===0?' sel':''}" onclick="paletteGo('${r.type}','${r.id}')">` +
    `<div class="pi-icon" style="background:${r.colour}22;color:${r.colour}">${r.type[0].toUpperCase()}</div>` +
    `<div class="pi-text"><div class="pi-title">${r.title}</div><div class="pi-sub">${r.sub||''}</div></div>` +
    `<span class="pi-mod">${r.type}</span></div>`
  ).join('');
}

function paletteGo(type, id) {
  closePalette();
  if (type==='summary') { switchModule('summary'); }
  else if (type==='comms') navToComm(id);
  else if (type==='projects') navToProject(id);
  else if (type==='people') navToPerson(id);
  else if (type==='news') { switchModule('news'); setTimeout(() => openNewsDetail(id), 300); }
  else if (type==='technews') { switchModule('technews'); setTimeout(() => openTechNewsDetail(id), 300); }
}

function paletteKey(e) {
  if (e.key==='Escape') closePalette();
  if (e.key==='Enter') {
    const sel = document.querySelector('.palette-item.sel');
    if (sel) sel.click();
  }
}
