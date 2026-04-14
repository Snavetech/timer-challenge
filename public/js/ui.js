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
  function renderResultsTable(tbody, results) {
    tbody.innerHTML = '';
    results.forEach((r, i) => {
      const rank = i + 1;
      const tr = document.createElement('tr');
      tr.className = rank <= 3 ? `rank-${rank}` : '';

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
    escapeHtml
  };
})();
