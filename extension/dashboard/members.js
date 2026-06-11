(function () {
  const {
    DEFAULT_TEAM,
    getSelectedMembers, setSelectedMembers, getSeenMembers,
  } = window.SegApi;

  const state = {
    selected: new Set(),
    seen: [],
    keyword: "",
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function setStatus(text, isError) {
    const el = document.getElementById("statusText");
    el.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  function avatarHtml(m) {
    const fallback = (m.displayName || m.realName || "?").trim().slice(0, 1);
    if (m.avatar) {
      return `<img class="member-avatar" src="${escapeHtml(m.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'member-avatar',textContent:'${escapeHtml(fallback)}'}))" />`;
    }
    return `<div class="member-avatar">${escapeHtml(fallback)}</div>`;
  }

  function render() {
    const grid = document.getElementById("membersGrid");
    const kw = state.keyword.trim().toLowerCase();
    const filtered = state.seen.filter((m) => {
      if (!kw) return true;
      return (
        (m.displayName || "").toLowerCase().includes(kw) ||
        (m.realName || "").toLowerCase().includes(kw) ||
        (m.nickName || "").toLowerCase().includes(kw)
      );
    });

    const seenKeys = new Set(state.seen.map((m) => m.displayName || m.realName || m.identifier));
    const ghosts = [...state.selected]
      .filter((name) => !seenKeys.has(name))
      .filter((name) => !kw || name.toLowerCase().includes(kw))
      .map((name) => ({ displayName: name, realName: "", _ghost: true }));

    const all = [...filtered, ...ghosts];

    if (all.length === 0) {
      grid.innerHTML = "";
      document.getElementById("emptyHint").style.display = "block";
    } else {
      document.getElementById("emptyHint").style.display = "none";
      grid.innerHTML = all
        .map((m) => {
          const name = m.displayName || m.realName || m.identifier || "";
          const sub = [m.realName && m.realName !== m.displayName ? m.realName : null, m.nickName].filter(Boolean).join(" · ");
          const checked = state.selected.has(name);
          const ghost = m._ghost ? '<span class="badge neutral" style="margin-left:6px;font-size:11px">未在数据中出现</span>' : "";
          return `
            <label class="member-card${checked ? " selected" : ""}" data-name="${escapeHtml(name)}">
              <input type="checkbox" ${checked ? "checked" : ""} />
              ${avatarHtml(m)}
              <div class="member-info">
                <div class="member-name">${escapeHtml(name)}${ghost}</div>
                <div class="member-sub">${escapeHtml(sub)}</div>
              </div>
            </label>
          `;
        })
        .join("");
    }

    document.getElementById("selectedCount").textContent = `已选 ${state.selected.size} 人 · 已知 ${state.seen.length} 人`;
  }

  function bind() {
    document.getElementById("searchInput").addEventListener("input", (e) => {
      state.keyword = e.target.value || "";
      render();
    });

    document.getElementById("membersGrid").addEventListener("click", (e) => {
      const label = e.target.closest(".member-card");
      if (!label) return;
      const name = label.dataset.name;
      if (state.selected.has(name)) state.selected.delete(name);
      else state.selected.add(name);
      render();
    });

    document.getElementById("selectAllBtn").addEventListener("click", () => {
      state.seen.forEach((m) => {
        const n = m.displayName || m.realName || m.identifier;
        if (n) state.selected.add(n);
      });
      render();
    });

    document.getElementById("invertBtn").addEventListener("click", () => {
      const all = new Set(state.seen.map((m) => m.displayName || m.realName || m.identifier).filter(Boolean));
      const next = new Set();
      for (const n of all) if (!state.selected.has(n)) next.add(n);
      state.selected = next;
      render();
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
      state.selected.clear();
      render();
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      state.selected = new Set(DEFAULT_TEAM);
      render();
    });

    document.getElementById("saveBtn").addEventListener("click", async () => {
      try {
        await setSelectedMembers([...state.selected]);
        setStatus(`已保存 · ${state.selected.size} 人`);
      } catch (e) {
        setStatus(e.message || String(e), true);
      }
    });
  }

  async function init() {
    bind();
    const [selected, seen] = await Promise.all([
      getSelectedMembers(),
      getSeenMembers(),
    ]);
    state.selected = new Set(selected);
    state.seen = seen
      .slice()
      .sort((a, b) =>
        (a.displayName || a.realName || "").localeCompare(b.displayName || b.realName || "", "zh-CN")
      );
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
