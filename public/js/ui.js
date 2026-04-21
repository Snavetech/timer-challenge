/* ═══════════════════════════════════════════════════════════════
   UI Module — DOM Manipulation & Animations
   ═══════════════════════════════════════════════════════════════ */

const UI = (() => {
  // ─── View Management ───
  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) {
      view.classList.add('active');
      // Re-trigger animation
      view.style.animation = 'none';
      view.offsetHeight; // force reflow
      view.style.animation = '';
    }
  }

  // ─── Toast Notifications ───
  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ─── Player Cards Rendering ───
  function renderPlayerList(container, players, hostId) {
    container.innerHTML = '';
    players.forEach(player => {
      const card = document.createElement('div');
      card.className = 'player-card';
      const initials = player.name.substring(0, 2).toUpperCase();
      card.innerHTML = `
        <div class="player-avatar" style="background: ${player.color}">${initials}</div>
        <div>
          <div class="player-name">${escapeHtml(player.name)}</div>
          ${player.id === hostId ? '<span class="player-host-badge">Host</span>' : ''}
        </div>
      `;
      if (!player.connected) card.style.opacity = '0.4';
      container.appendChild(card);
    });
  }

  // ─── Game Player Status Dots ───
  function renderPlayerStatusDots(container, players, submittedIds = []) {
    container.innerHTML = '';
    players.forEach(player => {
      if (!player.connected) return;
      const dot = document.createElement('div');
      dot.className = 'player-status-dot';
      if (submittedIds.includes(player.id)) dot.classList.add('submitted');
      dot.style.background = player.color;
      dot.title = player.name;
      dot.textContent = player.name.substring(0, 1).toUpperCase();
      container.appendChild(dot);
    });
  }

  // ─── Results Table ───
  function renderResultsTable(tbody, results, mode) {
    tbody.innerHTML = '';
    
    // Update header if mode is tap
    const table = tbody.closest('table');
    if (table) {
      const timeHeader = table.querySelector('th:nth-child(3)');
      const diffHeader = table.querySelector('th:nth-child(4)');
      if (mode === 'tap') {
        if (timeHeader) timeHeader.textContent = 'Count';
        if (diffHeader) diffHeader.textContent = 'Outcome';
      } else {
        if (timeHeader) timeHeader.textContent = 'Time';
        if (diffHeader) diffHeader.textContent = 'Diff';
      }
    }

    results.forEach((r, i) => {
      const rank = i + 1;
      const tr = document.createElement('tr');
      tr.className = rank <= 3 ? `rank-${rank}` : '';

      if (mode === 'tap') {
        tr.innerHTML = `
          <td class="rank-cell">${rank}</td>
          <td class="player-cell">${escapeHtml(r.playerName)}</td>
          <td class="time-cell">${r.taps} taps</td>
          <td class="diff-cell">—</td>
          <td class="score-cell">${r.score}</td>
        `;
      } else {
        let diffClass = '';
        if (r.diff !== null) {
          if (r.diff <= 0.1) diffClass = 'diff-perfect';
          else if (r.diff <= 1.0) diffClass = 'diff-close';
          else diffClass = 'diff-far';
        }

        tr.innerHTML = `
          <td class="rank-cell">${rank}</td>
          <td class="player-cell">${escapeHtml(r.playerName)}</td>
          <td class="time-cell">${r.elapsed !== null ? r.elapsed.toFixed(2) + 's' : 'DNF'}</td>
          <td class="diff-cell ${diffClass}">${r.diff !== null ? (r.diff === 0 ? 'PERFECT!' : '±' + r.diff.toFixed(2) + 's') : '—'}</td>
          <td class="score-cell">${r.score}</td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  // ─── Standings List ───
  function renderStandings(container, standings) {
    container.innerHTML = '';
    const maxScore = standings[0]?.totalScore || 1;

    standings.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'standing-row';
      row.style.animationDelay = `${0.1 + i * 0.08}s`;

      const rankClass = i < 3 ? `standing-rank-${i + 1}` : '';

      row.innerHTML = `
        <div class="standing-rank ${rankClass}">#${i + 1}</div>
        <div class="player-avatar" style="background: ${s.color}; width: 28px; height: 28px; font-size: 0.7rem;">${s.name.substring(0, 2).toUpperCase()}</div>
        <div class="standing-name">${escapeHtml(s.name)}</div>
        <div class="standing-score">${s.totalScore}</div>
      `;
      container.appendChild(row);
    });
  }

  // ─── Final Standings ───
  function renderFinalStandings(container, standings) {
    container.innerHTML = '';
    standings.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = `final-standing-row ${i === 0 ? 'winner-row' : ''}`;
      row.style.animationDelay = `${0.2 + i * 0.12}s`;

      const rankClass = i < 3 ? `final-rank-${i + 1}` : '';
      const medals = ['🥇', '🥈', '🥉'];

      row.innerHTML = `
        <div class="final-rank ${rankClass}">${i < 3 ? medals[i] : '#' + (i + 1)}</div>
        <div class="player-avatar" style="background: ${s.color}">${s.name.substring(0, 2).toUpperCase()}</div>
        <div class="final-player-name">${escapeHtml(s.name)}</div>
        <div class="final-player-score">${s.totalScore} pts</div>
      `;
      container.appendChild(row);
    });
  }

  // ─── Confetti Effect ───
  function spawnConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';
    const colors = ['#ffd700', '#ff1744', '#00e5ff', '#7c4dff', '#00e676', '#ffab00', '#ff6d00'];

    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.width = (Math.random() * 8 + 5) + 'px';
      piece.style.height = (Math.random() * 8 + 5) + 'px';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 1.5) + 's';
      container.appendChild(piece);
    }

    // Clean up after animation
    setTimeout(() => { container.innerHTML = ''; }, 5000);
  }

  // ─── Utility ───
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Link copied to clipboard!', 'success');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('Link copied to clipboard!', 'success');
  }

  // ─── Grid Reveal Board ───
  function renderGridReveal(container, trapCells, runnerResults, players) {
    const cells = container.querySelectorAll('.grid-cell-reveal');
    cells.forEach((cell, i) => {
      // Reset
      cell.className = 'grid-cell-reveal';
      cell.innerHTML = '';
      cell.style.animationDelay = `${i * 0.08}s`;

      const isTrapped = trapCells.includes(i);
      cell.classList.add(isTrapped ? 'cell-trapped' : 'cell-safe');
      cell.textContent = isTrapped ? '💀' : '✅';

      // Add runner markers
      runnerResults.forEach(r => {
        if (r.cells && r.cells.includes(i)) {
          const marker = document.createElement('div');
          marker.className = 'runner-marker';
          const player = players.find(p => p.id === r.playerId);
          marker.style.background = player?.color || 'var(--accent)';
          marker.textContent = r.playerName.substring(0, 1).toUpperCase();
          marker.title = r.playerName;
          cell.appendChild(marker);
        }
      });
    });
  }

  // ─── Grid Outcomes List ───
  function renderGridOutcomes(container, runnerResults) {
    container.innerHTML = '';
    runnerResults.forEach((r, i) => {
      const row = document.createElement('div');
      const hasHits = r.hits > 0;
      row.className = `grid-outcome-row ${hasHits ? 'outcome-caught' : 'outcome-safe'}`;
      row.style.animationDelay = `${0.3 + i * 0.1}s`;

      const scoreSign = r.score > 0 ? '+' : '';
      row.innerHTML = `
        <span class="grid-outcome-icon">${hasHits ? '💥' : '🛡️'}</span>
        <span class="grid-outcome-name">${escapeHtml(r.playerName)}${r.dnf ? ' (DNF)' : ''}</span>
        <span class="grid-outcome-status ${hasHits ? 'status-caught' : 'status-safe'}">${r.hits} HITS | ${r.safe} SAFE</span>
        <span class="grid-outcome-score">${scoreSign}${r.score}</span>
      `;
      container.appendChild(row);
    });
  }

  // ─── Grid Trapper Score ───
  function renderGridTrapperScore(container, trapperName, trapperScore, caughtCount, totalRunners) {
    container.innerHTML = `
      <span>🪤</span>
      <span class="trapper-name">${escapeHtml(trapperName)}</span>
      <span style="color: var(--text-muted)">caught ${caughtCount}/${totalRunners}</span>
      <span class="trapper-pts">+${trapperScore} pts</span>
    `;
  }

  // ─── Whot Mode Rendering ───
  function getShapeIcon(shape) {
    const icons = { 'circle': '⭕', 'triangle': '🔺', 'cross': '➕', 'square': '🟦', 'star': '⭐', 'whot': '🃏' };
    return icons[shape] || '❓';
  }

  function createWhotCardDOM(card, interactable = false) {
    const el = document.createElement('div');
    if (!card) return el;
    el.className = `whot-card ${card.isSpecial ? 'special-card' : ''} ${card.number === 20 ? 'whot-20' : ''}`;
    el.dataset.id = card.id;
    
    // Add text format inside the card
    const displayNum = card.number === 20 ? '20' : card.number;
    const icon = getShapeIcon(card.shape);

    el.innerHTML = `
      <div class="top-left">${displayNum}</div>
      <div class="center-shape">${icon}</div>
      <div class="bottom-right">${displayNum}</div>
    `;

    return el;
  }

  function renderWhotHand(container, hand, onCardClick) {
    container.innerHTML = '';
    hand.forEach(card => {
      const cardEl = createWhotCardDOM(card, true);
      cardEl.addEventListener('click', () => onCardClick(card));
      container.appendChild(cardEl);
    });
  }

  function renderWhotTopCard(container, card) {
    container.innerHTML = '';
    const cardEl = createWhotCardDOM(card);
    // Slight random rotation for natural feel
    const rot = (Math.random() * 10) - 5; 
    cardEl.style.transform = `rotate(${rot}deg)`;
    container.appendChild(cardEl);
  }

  function renderWhotOpponents(container, handsCounts, turnIndex, playerIds, playersList) {
    container.innerHTML = '';
    handsCounts.forEach(hc => {
      const p = playersList.find(pl => pl.id === hc.id);
      if(!p) return;
      const turnActive = playerIds[turnIndex] === hc.id;
      
      const el = document.createElement('div');
      el.className = `whot-opponent ${turnActive ? 'active-turn' : ''}`;
      el.innerHTML = `
        <span style="font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px;">${escapeHtml(p.name)}</span>
        <span style="font-size: 1.5rem; margin-top: 5px;">${hc.count} 🃏</span>
      `;
      container.appendChild(el);
    });
  }

  return {
    showView,
    showToast,
    renderPlayerList,
    renderPlayerStatusDots,
    renderResultsTable,
    renderStandings,
    renderFinalStandings,
    spawnConfetti,
    copyToClipboard,
    escapeHtml,
    renderGridReveal,
    renderGridOutcomes,
    renderGridTrapperScore,
    renderWhotHand,
    renderWhotTopCard,
    renderWhotOpponents
  };
})();
