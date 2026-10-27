(() => {
  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const svg = $("svg");
  const KEY = "onestroke-v1";

  // ---------- 저장 ----------
  let save = { cleared: [] };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.cleared) save = s; } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };

  // ---------- 상태 ----------
  let li = 0, path = [], ids = [], used = new Set(), demo = false, timers = [], hintNode = -1, hintTimer = 0;
  let L, adj;

  // 남은 선으로 start에서 시작하는 오일러 경로 계산 (없으면 null)
  function solveFrom(start, usedSet) {
    const a = L.nodes.map(() => []);
    let rem = 0;
    L.edges.forEach(([p, q], i) => { if (!usedSet.has(i)) { a[p].push([q, i]); a[q].push([p, i]); rem++; } });
    if (!rem) return [start];
    const odd = a.map((x, i) => (x.length % 2 ? i : -1)).filter(i => i >= 0);
    if (odd.length > 2 || (odd.length === 2 && !odd.includes(start))) return null;
    const ptr = L.nodes.map(() => 0), seen = new Set(), stack = [start], out = [];
    while (stack.length) {
      const v = stack[stack.length - 1];
      let moved = false;
      while (ptr[v] < a[v].length) {
        const [w, i] = a[v][ptr[v]++];
        if (!seen.has(i)) { seen.add(i); stack.push(w); moved = true; break; }
      }
      if (!moved) out.push(stack.pop());
    }
    out.reverse();
    return out.length === rem + 1 ? out : null;
  }
  function fullSolution() {
    const a = L.nodes.map(() => 0);
    L.edges.forEach(([p, q]) => { a[p]++; a[q]++; });
    const s = a.findIndex(d => d % 2);
    return solveFrom(s < 0 ? 0 : s, new Set());
  }

  // ---------- 화면 ----------
  function showMenu() {
    stopDemo(); $("game").hidden = true; $("win").hidden = true; $("menu").hidden = false;
    const g = $("grid"); g.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const done = save.cleared.includes(i), open = i === 0 || save.cleared.includes(i - 1);
      const b = document.createElement("button");
      b.className = "lv" + (done ? " done" : ""); b.disabled = !open;
      b.innerHTML = (open ? i + 1 : "🔒") + `<small>${open ? lv.name : "잠김"}</small>`;
      b.onclick = () => start(i);
      g.appendChild(b);
    });
  }

  function start(i) {
    stopDemo(); li = i; L = LEVELS[i];
    if (!fullSolution()) console.warn("풀 수 없는 레벨:", i + 1);
    adj = L.nodes.map(() => []);
    L.edges.forEach(([p, q], k) => { adj[p].push([q, k]); adj[q].push([p, k]); });
    $("menu").hidden = true; $("win").hidden = true; $("game").hidden = false;
    $("lvTitle").textContent = `레벨 ${i + 1} · ${L.name}`;
    svg.innerHTML = "";
    L.edges.forEach(([p, q]) => {
      const e = document.createElementNS(NS, "line");
      e.setAttribute("class", "e");
      e.setAttribute("x1", L.nodes[p][0]); e.setAttribute("y1", L.nodes[p][1]);
      e.setAttribute("x2", L.nodes[q][0]); e.setAttribute("y2", L.nodes[q][1]);
      svg.appendChild(e);
    });
    L.nodes.forEach(([x, y]) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("class", "n"); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 4.6);
      svg.appendChild(c);
    });
    reset();
  }

  function reset() {
    path = []; ids = []; used = new Set(); hintNode = -1;
    svg.querySelectorAll("text").forEach(t => t.remove());
    say("점을 눌러 시작하세요. 드래그하거나 차례로 탭해도 돼요.");
    draw();
  }

  function say(t) { $("msg").textContent = t; }

  function draw() {
    const es = svg.querySelectorAll(".e"), ns = svg.querySelectorAll(".n");
    es.forEach((e, i) => e.classList.toggle("u", used.has(i)));
    const cur = path.length ? path[path.length - 1] : -1;
    const nb = new Set(cur >= 0 ? adj[cur].filter(([, k]) => !used.has(k)).map(([w]) => w) : []);
    ns.forEach((n, i) => {
      n.classList.toggle("cur", i === cur);
      n.classList.toggle("nb", nb.has(i));
      n.classList.toggle("hint", i === hintNode);
    });
    $("count").textContent = `선 ${used.size} / ${L.edges.length}`;
    $("btnUndo").disabled = demo || !path.length;
    $("btnReset").disabled = demo; $("btnHint").disabled = demo; $("btnSol").disabled = demo;
  }

  // ---------- 이동 ----------
  function begin(n) { path = [n]; hintNode = -1; say("좋아요! 이어서 선을 따라가 보세요."); draw(); }

  function move(n) {
    const cur = path[path.length - 1];
    const hit = adj[cur].find(([w, k]) => w === n && !used.has(k));
    if (!hit) return false;
    used.add(hit[1]); ids.push(hit[1]); path.push(n); hintNode = -1;
    if (demo) {
      const [x1, y1] = L.nodes[cur], [x2, y2] = L.nodes[n];
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", "num"); t.setAttribute("x", (x1 + x2) / 2); t.setAttribute("y", (y1 + y2) / 2);
      t.textContent = ids.length; svg.appendChild(t);
    }
    draw();
    if (!demo && used.size === L.edges.length) win();
    else if (!demo && !adj[n].some(([, k]) => !used.has(k))) say("막다른 길이에요. 되돌리기를 눌러보세요.");
    else if (!demo) say("");
    return true;
  }

  function nearest(ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = -1, bd = 11;
    L.nodes.forEach(([x, y], i) => { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function onPointer(ev) {
    if (demo || !L) return;
    ev.preventDefault();
    const n = nearest(ev);
    if (n < 0) return;
    if (!path.length) { begin(n); return; }
    if (n !== path[path.length - 1]) move(n);
  }
  svg.addEventListener("pointerdown", ev => { try { svg.setPointerCapture(ev.pointerId); } catch (e) {} onPointer(ev); });
  svg.addEventListener("pointermove", ev => { if (ev.buttons || ev.pointerType === "touch") onPointer(ev); });

  // ---------- 버튼 ----------
  $("btnUndo").onclick = () => {
    if (!path.length) return;
    if (ids.length) used.delete(ids.pop());
    path.pop(); hintNode = -1; say(""); draw();
  };
  $("btnReset").onclick = reset;
  $("btnMenu").onclick = showMenu;
  $("btnWinMenu").onclick = showMenu;
  $("btnNext").onclick = () => start(li + 1);

  $("btnHint").onclick = () => {
    clearTimeout(hintTimer);
    let r;
    if (!path.length) { r = fullSolution(); hintNode = r[0]; say("주황색 점에서 시작해 보세요."); }
    else {
      r = solveFrom(path[path.length - 1], used);
      if (r && r.length > 1) { hintNode = r[1]; say("주황색 점으로 이동해 보세요."); }
      else { hintNode = -1; say("이 길로는 풀 수 없어요. 되돌리기를 눌러보세요."); }
    }
    draw();
    hintTimer = setTimeout(() => { hintNode = -1; draw(); }, 2500);
  };

  $("btnSol").onclick = () => {
    if (!confirm("정답을 볼까요?\n경로가 순서대로 그려지고, 끝나면 처음부터 다시 도전할 수 있어요.")) return;
    reset(); demo = true;
    const r = fullSolution();
    say("정답 경로예요. 번호 순서대로 따라가 보세요.");
    begin(r[0]); draw();
    r.slice(1).forEach((n, i) => timers.push(setTimeout(() => move(n), 700 * (i + 1))));
    timers.push(setTimeout(() => {
      demo = false; say("이제 직접 풀어보세요!");
      draw();
      timers.push(setTimeout(() => { if (!demo) reset(); }, 2500));
    }, 700 * r.length + 600));
  };
  function stopDemo() { timers.forEach(clearTimeout); timers = []; demo = false; }

  function win() {
    if (!save.cleared.includes(li)) { save.cleared.push(li); persist(); }
    const last = li === LEVELS.length - 1;
    $("winTitle").textContent = last ? "모두 클리어! 🎉" : "클리어! 🎉";
    $("winText").textContent = last ? "모든 레벨을 완성했어요. 대단해요!" : `레벨 ${li + 1}을 완성했어요.`;
    $("btnNext").hidden = last;
    setTimeout(() => { $("win").hidden = false; }, 450);
  }

  showMenu();
})();
