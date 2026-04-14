// ===============================================================
// PEOPLE MODULE
// ===============================================================
function renderPeopleSidebar() {
  const sb = $('sidebar');
  let html = '<div class="sb-search"><input type="text" placeholder="Search people…" value="' + (state.peopleSearch||'') + '" oninput="setState(\'peopleSearch\',this.value)"/></div>';
  html += '<div class="filter-bar">';
  ['team','region','tier','all'].forEach(g => {
    html += `<div class="filter-pill${state.peopleGroup===g?' active':''}" onclick="setState('peopleGroup','${g}')">${g.charAt(0).toUpperCase()+g.slice(1)}</div>`;
  });
  html += '</div>';
  html += '<div class="sb-section">';

  const search = (state.peopleSearch||'').toLowerCase();
  const people = Object.entries(DATA.people).filter(([id,p]) => !search || p.n.toLowerCase().includes(search) || p.role.toLowerCase().includes(search) || p.team.toLowerCase().includes(search));

  if (state.peopleGroup==='all') {
    people.forEach(([id,p]) => {
      const act = state.selectedPerson===id ? ' act':'';
      const tierDot = p.tier === 'executive' ? ' style="background:var(--yl)"' : p.tier === 'leadership' ? ' style="background:var(--or)"' : '';
      html += `<div class="nav-i${act}" onclick="selectPerson('${id}')"><span class="dot"${tierDot || ` style="background:${p.colour}"`}></span><span class="sb-label">${p.n}</span></div>`;
    });
  } else {
    const groups = {};
    people.forEach(([id,p]) => {
      const key = state.peopleGroup==='team' ? p.team : state.peopleGroup==='tier' ? (p.tier || 'other').charAt(0).toUpperCase() + (p.tier || 'other').slice(1) : p.region;
      if (!groups[key]) groups[key] = [];
      groups[key].push([id,p]);
    });
    Object.keys(groups).sort().forEach(g => {
      html += `<div class="sb-section-title">${g}</div>`;
      groups[g].forEach(([id,p]) => {
        const act = state.selectedPerson===id ? ' act':'';
        html += `<div class="nav-i${act}" onclick="selectPerson('${id}')"><span class="dot" style="background:${p.colour}"></span><span class="sb-label">${p.n}</span></div>`;
      });
    });
  }
  html += '</div>';
  sb.innerHTML = html;
}

function renderPeopleMain() {
  const el = $('main');
  if (state.selectedPerson && DATA.people[state.selectedPerson]) {
    const pid = state.selectedPerson;
    const p = DATA.people[pid];
    const tierColors = {executive:'var(--yl)',leadership:'var(--or)',core:'var(--ac)',finance:'var(--gn)',tech:'var(--cy)',regional:'var(--pu)',support:'var(--tx3)'};
    const tierCol = tierColors[p.tier] || 'var(--tx3)';
    let html = `<div class="card"><div class="card-h"><h2>${p.n}</h2><div style="display:flex;gap:6px">${p.tier?`<span class="tag" style="background:${tierCol}22;color:${tierCol}">${(p.tier||'').toUpperCase()}</span>`:''}<span class="tag info">${p.region}</span></div></div><div class="card-b">`;
    html += `<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px"><div class="avatar" style="background:${p.colour}33;color:${p.colour}">${p.initials}</div>`;
    html += `<div><strong>${p.role}</strong><br><span style="color:var(--tx3)">${p.team} · ${p.region}</span>`;
    if (p.scope) html += `<br><span style="color:var(--tx2);font-size:var(--f-sm)">${p.scope}</span>`;
    html += '</div></div>';

    // Contact buttons
    html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
    if (p.email) html += `<a class="btn btn-outlook" href="mailto:${p.email}" style="text-decoration:none">Email</a>`;
    if (p.slackId) html += `<button class="btn btn-slack" onclick="openSlackDM('${p.slackId}','${p.n.replace(/'/g,"\\'")}')">Slack DM</button>`;
    html += '</div>';

    // Related threads
    const relatedTopics = Object.entries(DATA.comms.threads || {}).filter(([id,th]) => th.peopleLinks && th.peopleLinks.includes(pid));
    if (relatedTopics.length) {
      html += '<strong style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">Related Comms</strong><div style="margin-top:8px">';
      relatedTopics.forEach(([id,th]) => {
        const dotCls = th.priority==='critical'?'rd':th.priority==='action'?'or':'bl';
        const tagCls = th.priority==='critical'?'crit':th.priority==='action'?'act':'info';
        const tagLabel = th.priority.charAt(0).toUpperCase()+th.priority.slice(1);
        html += `<div class="nav-i" onclick="navToComm('${id}')" style="margin:0"><span class="dot ${dotCls}"></span><span class="sb-label">${th.subject}</span><span class="tag ${tagCls}" style="margin-left:auto">${tagLabel}</span></div>`;
      });
      html += '</div>';
    }

    // Related projects
    const relatedProjects = Object.entries(DATA.projects).filter(([id,proj]) => proj.people && proj.people.includes(pid));
    if (relatedProjects.length) {
      html += '<strong style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;display:block;margin-top:16px">Related Projects</strong><div style="margin-top:8px">';
      relatedProjects.forEach(([id,proj]) => {
        html += `<div class="nav-i" onclick="navToProject('${id}')" style="margin:0"><span class="dot" style="background:${proj.colour}"></span><span class="sb-label">${proj.title}</span></div>`;
      });
      html += '</div>';
    }
    html += '</div></div>';
    el.innerHTML = html;
  } else {
    // Directory grid
    const search = (state.peopleSearch||'').toLowerCase();
    const people = Object.entries(DATA.people).filter(([id,p]) => !search || p.n.toLowerCase().includes(search) || p.role.toLowerCase().includes(search));
    let html = '';

    // Org insight banner (from email intelligence)
    if (!search) {
      html += '<div class="org-insight"><h4>Org Intelligence</h4><p>Beanz sits outside Phil McKnight\'s Specialty Coffee BU — regions interpret Beanz support as selective FTBP moments, not year-round brand narrative. Beanz has no separate budget line — relies on Breville regional budgets. Beanz is "arguably the first leg" of the moat Cliff is building (machines, beans service, premium experience).</p></div>';
    }

    html += '<div class="people-grid">';
    people.forEach(([id,p]) => {
      const tierColors = {executive:'var(--yl)',leadership:'var(--or)',core:'var(--ac)',finance:'var(--gn)',tech:'var(--cy)',regional:'var(--pu)',support:'var(--tx3)'};
      const tierCol = tierColors[p.tier] || 'var(--tx3)';
      html += `<div class="person-card" onclick="selectPerson('${id}')">`;
      html += `<div class="avatar" style="background:${p.colour}33;color:${p.colour}">${p.initials}</div>`;
      html += `<h4>${p.n}</h4><div class="role">${p.role}</div>`;
      if (p.tier) html += `<div style="margin:4px 0"><span class="tag" style="background:${tierCol}22;color:${tierCol};font-size:8px">${p.tier.toUpperCase()}</span></div>`;
      if (p.scope) html += `<div style="font-size:10px;color:var(--tx3);margin-top:4px;line-height:1.3;max-height:30px;overflow:hidden">${p.scope}</div>`;
      html += '<div class="person-actions">';
      if (p.email) html += `<button class="btn btn-sm btn-g" onclick="event.stopPropagation();window.open('mailto:${p.email}')">Email</button>`;
      if (p.slackId) html += `<button class="btn btn-sm btn-slack" onclick="event.stopPropagation();openSlackDM('${p.slackId}','${p.n.replace(/'/g,"\\'")}')">Slack</button>`;
      html += '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }
}
