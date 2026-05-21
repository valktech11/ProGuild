'use client'
import { useEffect } from 'react'

export default function SATVaultPage() {
  useEffect(() => {
    // Pre-fill the Google API key
    const tryFill = () => {
      const input = document.getElementById('api-key-input') as HTMLInputElement
      if (input && !input.value) {
        input.value = 'AIzaSyDxW8wFQHbT2VkK55L4IlxfUuGAeV12wAE'
        try { localStorage.setItem('sat_key_gemini', 'AIzaSyDxW8wFQHbT2VkK55L4IlxfUuGAeV12wAE') } catch(e) {}
        // Trigger the save
        const btn = document.querySelector('.api-save-btn') as HTMLButtonElement
        if (btn) btn.click()
      }
    }
    const t = setTimeout(tryFill, 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
/* ═══ THEME TOKENS ═══════════════════════════════════════════════ */
[data-theme="dark"] {
  --bg:#071418;--bg2:#0c1e24;--bg3:#122830;--bg4:#1a333d;
  --card:#0f2028;--card-hover:#142630;
  --border:#1e3d48;--border2:#2a5262;
  --text:#d8f5f0;--text2:#7db8b0;--text3:#3d7a74;
  --accent:#2dd4bf;--accent-soft:rgba(45,212,191,.14);--accent-glow:rgba(45,212,191,.32);
  --green:#34d399;--green-soft:rgba(52,211,153,.12);
  --red:#fb7185;--red-soft:rgba(251,113,133,.12);
  --yellow:#fcd34d;--yellow-soft:rgba(252,211,77,.12);
  --blue:#67e8f9;--blue-soft:rgba(103,232,249,.12);
  --easy-c:#34d399;--med-c:#fcd34d;--hard-c:#fb7185;
  --shadow:0 4px 28px rgba(0,0,0,.5);--shadow-sm:0 2px 10px rgba(0,0,0,.35);
  --topbar-bg:rgba(7,20,24,.93);--scrollbar:#1e3d48;
}
[data-theme="light"] {
  --bg:#fafaf8;--bg2:#f4f4f0;--bg3:#eaeae4;--bg4:#deded6;
  --card:#ffffff;--card-hover:#fefefe;
  --border:#e0e0d8;--border2:#c8c8be;
  --text:#1a2e2b;--text2:#3d6b64;--text3:#7a9e98;
  --accent:#0d9488;--accent-soft:rgba(13,148,136,.1);--accent-glow:rgba(13,148,136,.2);
  --green:#059669;--green-soft:rgba(5,150,105,.09);
  --red:#dc2626;--red-soft:rgba(220,38,38,.08);
  --yellow:#b45309;--yellow-soft:rgba(180,83,9,.09);
  --blue:#0891b2;--blue-soft:rgba(8,145,178,.09);
  --easy-c:#059669;--med-c:#b45309;--hard-c:#dc2626;
  --shadow:0 4px 20px rgba(0,0,0,.08);--shadow-sm:0 2px 8px rgba(0,0,0,.06);
  --topbar-bg:rgba(250,250,248,.97);--scrollbar:#deded6;
}
/* ═══ RESET ═══════════════════════════════════════════════════════ */
#sat-vault *,#sat-vault *::before,#sat-vault *::after{box-sizing:border-box;margin:0;padding:0;}
#sat-vault{font-family:'Nunito',sans-serif;color:var(--text);font-size:15px;line-height:1.5;height:100vh;display:flex;flex-direction:column;overflow:hidden;transition:background .3s,color .3s;}
[data-theme="dark"] #sat-vault{background:radial-gradient(ellipse 70% 50% at 8% 15%,rgba(45,212,191,.08) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 92% 80%,rgba(103,232,249,.07) 0%,transparent 55%),#071418;}
[data-theme="light"] #sat-vault{background:#fafaf8;}
#sat-vault ::-webkit-scrollbar{width:5px;height:5px;}
#sat-vault ::-webkit-scrollbar-track{background:transparent;}
#sat-vault ::-webkit-scrollbar-thumb{background:var(--scrollbar);border-radius:10px;}
/* ═══ TOPBAR ══════════════════════════════════════════════════════ */
#sat-vault .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;height:60px;background:var(--topbar-bg);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);flex-shrink:0;z-index:10;transition:background .3s,border-color .3s;}
#sat-vault .brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;}
#sat-vault .brand-icon{width:34px;height:34px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px var(--accent-glow);flex-shrink:0;}
#sat-vault .brand-text span{color:var(--accent);}
#sat-vault .brand-inf{font-size:13px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-left:2px;vertical-align:middle;}
#sat-vault .topbar-right{display:flex;align-items:center;gap:10px;}
#sat-vault .stats-group{display:flex;gap:6px;}
#sat-vault .spill{display:flex;flex-direction:column;align-items:center;padding:4px 13px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;min-width:60px;transition:background .3s,border-color .3s;}
#sat-vault .spill .sv{font-size:18px;font-weight:800;color:var(--accent);line-height:1.1;font-variant-numeric:tabular-nums;}
#sat-vault .spill .sl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);}
#sat-vault .theme-toggle{width:40px;height:40px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .2s;flex-shrink:0;}
#sat-vault .theme-toggle:hover{background:var(--bg4);border-color:var(--accent);transform:scale(1.05);}
#sat-vault .pbar-wrap{height:3px;background:var(--border);flex-shrink:0;transition:background .3s;}
#sat-vault .pbar-fill{height:100%;background:linear-gradient(90deg,#2dd4bf,#67e8f9,#34d399);background-size:200% 100%;animation:sat-shimmer 3s linear infinite;transition:width .5s ease;width:0%;}
@keyframes sat-shimmer{0%{background-position:0% 0%}100%{background-position:200% 0%}}
/* ═══ API STRIP ═══════════════════════════════════════════════════ */
#sat-vault .api-strip{display:flex;align-items:center;gap:10px;padding:8px 24px;background:var(--blue-soft);border-bottom:1px solid rgba(103,232,249,.2);flex-shrink:0;flex-wrap:wrap;transition:background .3s;}
#sat-vault .api-strip.has-key{background:var(--green-soft);border-color:rgba(52,211,153,.2);}
#sat-vault .api-strip-label{font-size:12px;font-weight:700;color:var(--blue);white-space:nowrap;display:flex;align-items:center;gap:5px;}
#sat-vault .api-strip.has-key .api-strip-label{color:var(--green);}
#sat-vault .api-strip-input{flex:1;min-width:200px;max-width:380px;padding:6px 12px;background:var(--card);border:1.5px solid var(--border2);border-radius:8px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;outline:none;transition:border-color .15s,background .3s;}
#sat-vault .api-strip-input:focus{border-color:var(--accent);}
#sat-vault .api-save-btn{padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:opacity .15s;white-space:nowrap;}
#sat-vault .api-save-btn:hover{opacity:.85;}
#sat-vault .api-strip-hint{font-size:11px;color:var(--text3);}
#sat-vault .api-strip-hint a{color:var(--blue);text-decoration:none;}
#sat-vault .api-strip-hint a:hover{text-decoration:underline;}
#sat-vault .api-status{font-size:11px;font-family:'JetBrains Mono',monospace;font-weight:600;}
#sat-vault .api-status.ok{color:var(--green);}
#sat-vault .api-status.err{color:var(--red);}
/* ═══ LAYOUT ══════════════════════════════════════════════════════ */
#sat-vault .body{display:flex;flex:1;overflow:hidden;}
/* ═══ SIDEBAR ═════════════════════════════════════════════════════ */
#sat-vault .sidebar{width:290px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--bg2);transition:background .3s,border-color .3s;overflow:hidden;}
#sat-vault .sidebar-controls{padding:16px;display:flex;flex-direction:column;gap:14px;border-bottom:1px solid var(--border);overflow-y:auto;flex-shrink:0;}
#sat-vault .ctrl-group{display:flex;flex-direction:column;gap:7px;}
#sat-vault .ctrl-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3);font-weight:700;}
#sat-vault .prov-tabs{display:flex;gap:5px;}
#sat-vault .ptab{flex:1;padding:7px 4px;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text3);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;line-height:1.3;}
#sat-vault .ptab:hover{border-color:var(--accent);color:var(--accent);}
#sat-vault .ptab.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
#sat-vault .cheap-tag{display:inline-block;font-size:8px;padding:1px 4px;border-radius:4px;background:var(--yellow-soft);color:var(--yellow);margin-left:2px;font-weight:700;}
#sat-vault .topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
#sat-vault .tpbtn{padding:8px 6px;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;line-height:1.3;}
#sat-vault .tpbtn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft);}
#sat-vault .tpbtn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
#sat-vault .diff-pills{display:flex;gap:5px;}
#sat-vault .dpill{flex:1;padding:8px 0;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;}
#sat-vault .dpill.on[data-diff="all"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
#sat-vault .dpill.on[data-diff="easy"]{background:var(--green-soft);border-color:var(--easy-c);color:var(--easy-c);}
#sat-vault .dpill.on[data-diff="medium"]{background:var(--yellow-soft);border-color:var(--med-c);color:var(--med-c);}
#sat-vault .dpill.on[data-diff="hard"]{background:var(--red-soft);border-color:var(--hard-c);color:var(--hard-c);}
#sat-vault .batch-pills{display:flex;gap:5px;}
#sat-vault .bpill{flex:1;padding:8px 0;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;}
#sat-vault .bpill:hover{border-color:var(--accent);color:var(--accent);}
#sat-vault .bpill.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
#sat-vault .gen-btn{width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px var(--accent-glow);letter-spacing:.2px;}
#sat-vault .gen-btn:hover:not(:disabled){opacity:.9;transform:translateY(-2px);box-shadow:0 6px 22px var(--accent-glow);}
#sat-vault .gen-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
#sat-vault .cost-note{text-align:center;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;}
#sat-vault .cost-note b{color:var(--green);}
/* ═══ Q LIST ══════════════════════════════════════════════════════ */
#sat-vault .q-list{flex:1;overflow-y:auto;}
#sat-vault .qrow{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;position:relative;}
#sat-vault .qrow:hover{background:var(--card-hover);}
#sat-vault .qrow.active{background:var(--card);border-left:3px solid var(--accent);padding-left:13px;box-shadow:inset 4px 0 0 var(--accent-soft);}
#sat-vault .qrow-left{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:28px;padding-top:2px;flex-shrink:0;}
#sat-vault .qrow-num{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text3);font-weight:500;}
#sat-vault .diff-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
#sat-vault .diff-dot.easy{background:var(--easy-c);}
#sat-vault .diff-dot.medium{background:var(--med-c);}
#sat-vault .diff-dot.hard{background:var(--hard-c);}
#sat-vault .qrow-body{flex:1;min-width:0;}
#sat-vault .qrow-topic-line{font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;}
#sat-vault .qrow-preview{font-size:12.5px;color:var(--text);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:500;}
#sat-vault .qrow-check{font-size:15px;flex-shrink:0;padding-top:2px;}
#sat-vault .list-empty{padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;line-height:2;}
#sat-vault .list-empty .ei{font-size:36px;margin-bottom:8px;display:block;}
/* ═══ DETAIL ══════════════════════════════════════════════════════ */
#sat-vault .detail{flex:1;overflow-y:auto;background:var(--bg);transition:background .3s;}
#sat-vault .welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:48px 32px;text-align:center;gap:20px;}
#sat-vault .welcome-emoji{font-size:60px;line-height:1;}
#sat-vault .welcome h1{font-size:30px;font-weight:900;line-height:1.2;letter-spacing:-.5px;}
#sat-vault .welcome h1 em{color:var(--accent);font-style:normal;}
#sat-vault .welcome p{color:var(--text2);font-size:15px;max-width:400px;line-height:1.7;}
#sat-vault .how-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:520px;width:100%;margin-top:8px;}
#sat-vault .hstep{background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:18px 14px;text-align:center;transition:background .3s,border-color .3s;}
#sat-vault .hstep-num{width:36px;height:36px;border-radius:50%;background:var(--accent-soft);border:2px solid var(--accent);color:var(--accent);font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;}
#sat-vault .hstep-text{font-size:12px;color:var(--text2);line-height:1.6;font-weight:600;}
#sat-vault .qview{padding:32px 40px;max-width:760px;animation:sat-slideUp .3s ease;}
@keyframes sat-slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#sat-vault .qview-chips{display:flex;align-items:center;gap:8px;margin-bottom:22px;flex-wrap:wrap;}
#sat-vault .chip{padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid;letter-spacing:.3px;}
#sat-vault .chip-id{color:var(--text3);border-color:var(--border);background:transparent;font-family:'JetBrains Mono',monospace;}
#sat-vault .chip-topic{color:var(--accent);border-color:var(--accent);background:var(--accent-soft);}
#sat-vault .chip-easy{color:var(--easy-c);border-color:var(--easy-c);background:var(--green-soft);}
#sat-vault .chip-medium{color:var(--med-c);border-color:var(--med-c);background:var(--yellow-soft);}
#sat-vault .chip-hard{color:var(--hard-c);border-color:var(--hard-c);background:var(--red-soft);}
#sat-vault .chip-type{color:var(--text3);border-color:var(--border);background:var(--bg3);font-size:10px;}
#sat-vault .q-progress-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
#sat-vault .q-nav-arrows{display:flex;gap:6px;}
#sat-vault .q-arrow{width:32px;height:32px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}
#sat-vault .q-arrow:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
#sat-vault .qtext{font-size:17px;line-height:1.85;font-weight:500;color:var(--text);margin-bottom:24px;white-space:pre-wrap;}
#sat-vault .math-given{background:var(--bg3);border:1.5px solid var(--border);border-left:4px solid var(--accent);border-radius:0 12px 12px 0;padding:14px 18px;font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--yellow);line-height:2;white-space:pre-wrap;margin-bottom:22px;transition:background .3s,border-color .3s;}
#sat-vault .opts{display:flex;flex-direction:column;gap:10px;margin-bottom:24px;}
#sat-vault .opt{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border:1.5px solid var(--border);border-radius:12px;cursor:pointer;background:var(--card);transition:all .18s;user-select:none;}
#sat-vault .opt:hover:not(.done){border-color:var(--accent);background:var(--accent-soft);transform:translateX(3px);}
#sat-vault .opt.cor{border-color:var(--green);background:var(--green-soft);transform:none;cursor:default;}
#sat-vault .opt.wrg{border-color:var(--red);background:var(--red-soft);transform:none;cursor:default;}
#sat-vault .opt.done{cursor:default;}
#sat-vault .opt.neutral-done{cursor:default;opacity:.6;}
#sat-vault .opt-badge{width:30px;height:30px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;transition:all .15s;}
#sat-vault .opt.cor .opt-badge{background:var(--green);border-color:var(--green);color:#fff;}
#sat-vault .opt.wrg .opt-badge{background:var(--red);border-color:var(--red);color:#fff;}
#sat-vault .opt-txt{font-size:15px;line-height:1.6;font-weight:500;padding-top:2px;flex:1;}
#sat-vault .spr-section{margin-bottom:24px;}
#sat-vault .spr-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3);font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
#sat-vault .spr-input{background:var(--card);border:2px solid var(--border);border-radius:12px;padding:13px 20px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:500;width:220px;outline:none;transition:border-color .15s,background .3s;}
#sat-vault .spr-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
#sat-vault .spr-input.cor{border-color:var(--green);box-shadow:0 0 0 3px var(--green-soft);}
#sat-vault .spr-input.wrg{border-color:var(--red);box-shadow:0 0 0 3px var(--red-soft);}
#sat-vault .act-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:24px;}
#sat-vault .btn-primary{padding:11px 28px;background:var(--accent);color:#fff;border:none;border-radius:11px;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;box-shadow:0 3px 12px var(--accent-glow);}
#sat-vault .btn-primary:hover{opacity:.88;transform:translateY(-1px);}
#sat-vault .btn-outline{padding:11px 20px;background:transparent;color:var(--text2);border:1.5px solid var(--border);border-radius:11px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;}
#sat-vault .btn-outline:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft);}
#sat-vault .result-banner{padding:14px 18px;border-radius:12px;font-size:15px;font-weight:700;margin-bottom:20px;border:1.5px solid;display:none;align-items:center;gap:10px;}
#sat-vault .result-banner.show{display:flex;animation:sat-slideUp .2s ease;}
#sat-vault .result-banner.cor{background:var(--green-soft);color:var(--green);border-color:var(--green);}
#sat-vault .result-banner.wrg{background:var(--red-soft);color:var(--red);border-color:var(--red);}
#sat-vault .result-icon{font-size:20px;}
#sat-vault .exp-card{background:var(--card);border:1.5px solid var(--border);border-radius:16px;overflow:hidden;display:none;transition:background .3s,border-color .3s;}
#sat-vault .exp-card.show{display:block;animation:sat-slideUp .25s ease;}
#sat-vault .exp-card-header{display:flex;align-items:center;gap:10px;padding:14px 20px;background:var(--bg3);border-bottom:1px solid var(--border);}
#sat-vault .exp-card-header-icon{font-size:18px;}
#sat-vault .exp-card-title{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;color:var(--accent);}
#sat-vault .exp-card-body{padding:18px 20px;}
#sat-vault .exp-text{font-size:14px;line-height:1.85;color:var(--text);margin-bottom:14px;font-weight:500;}
#sat-vault .exp-math-block{background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:14px 18px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--yellow);white-space:pre-wrap;line-height:2;transition:background .3s;}
/* ═══ OVERLAY ═════════════════════════════════════════════════════ */
#sat-vault .overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:999;}
#sat-vault .overlay.show{display:flex;}
#sat-vault .loader-card{background:var(--card);border:1.5px solid var(--border);border-radius:20px;padding:36px 48px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:var(--shadow);min-width:280px;}
#sat-vault .spin-ring{width:48px;height:48px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:sat-spin .75s linear infinite;}
@keyframes sat-spin{to{transform:rotate(360deg)}}
#sat-vault .loader-title{font-size:17px;font-weight:800;color:var(--text);}
#sat-vault .loader-sub{font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;}
#sat-vault .loader-cost{font-size:12px;font-family:'JetBrains Mono',monospace;padding:5px 14px;background:var(--green-soft);border:1px solid var(--green);border-radius:20px;color:var(--green);font-weight:700;}
/* ═══ RESPONSIVE ══════════════════════════════════════════════════ */
@media(max-width:700px){
  #sat-vault{height:auto;min-height:100vh;overflow:auto;}
  #sat-vault .body{flex-direction:column;overflow:visible;}
  #sat-vault .sidebar{width:100%;border-right:none;border-bottom:1px solid var(--border);}
  #sat-vault .sidebar-controls{max-height:380px;overflow-y:auto;}
  #sat-vault .q-list{max-height:240px;}
  #sat-vault .detail{overflow:visible;}
  #sat-vault .qview{padding:20px 18px;}
  #sat-vault .stats-group{display:none;}
  #sat-vault .how-steps{grid-template-columns:1fr;max-width:300px;}
}
      `}</style>

      <link
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div id="sat-vault" data-theme="dark">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="brand">
            <div className="brand-icon">🏆</div>
            <div className="brand-text">SAT Math <span>Vault</span><span className="brand-inf"> ∞</span></div>
          </div>
          <div className="topbar-right">
            <div className="stats-group">
              <div className="spill"><div className="sv" id="s-gen">0</div><div className="sl">Generated</div></div>
              <div className="spill"><div className="sv" id="s-att">0</div><div className="sl">Attempted</div></div>
              <div className="spill"><div className="sv" id="s-cor">0</div><div className="sl">Correct</div></div>
              <div className="spill"><div className="sv" id="s-pct">—</div><div className="sl">Accuracy</div></div>
            </div>
            <button className="theme-toggle" id="theme-btn" title="Toggle light/dark">🌙</button>
          </div>
        </div>
        <div className="pbar-wrap"><div className="pbar-fill" id="pbar"></div></div>

        {/* API STRIP */}
        <div className="api-strip" id="api-strip">
          <span className="api-strip-label" id="api-label">🔑 Gemini API Key</span>
          <input className="api-strip-input" id="api-key-input" type="password" placeholder="Paste your API key here…" />
          <button className="api-save-btn">Save Key</button>
          <span className="api-strip-hint">
            Free key at <a href="https://aistudio.google.com/apikey" target="_blank" id="key-link">aistudio.google.com</a> · Stored in your browser only
          </span>
          <span className="api-status" id="api-status"></span>
        </div>

        {/* BODY */}
        <div className="body">
          <div className="sidebar">
            <div className="sidebar-controls">
              <div className="ctrl-group">
                <div className="ctrl-label">AI Provider</div>
                <div className="prov-tabs">
                  <button className="ptab on" data-pv="gemini">Google Gemini<br /><span className="cheap-tag">cheapest</span></button>
                  <button className="ptab" data-pv="openai">OpenAI<br />GPT-4o mini</button>
                </div>
              </div>
              <div className="ctrl-group">
                <div className="ctrl-label">Topic</div>
                <div className="topic-grid">
                  <button className="tpbtn on" data-topic="all">All Topics</button>
                  <button className="tpbtn" data-topic="Algebra">Algebra</button>
                  <button className="tpbtn" data-topic="Advanced Math">Advanced Math</button>
                  <button className="tpbtn" data-topic="Problem Solving">Data &amp; Stats</button>
                  <button className="tpbtn" data-topic="Geometry">Geometry</button>
                  <button className="tpbtn" data-topic="Trigonometry">Trigonometry</button>
                </div>
              </div>
              <div className="ctrl-group">
                <div className="ctrl-label">Difficulty</div>
                <div className="diff-pills">
                  <button className="dpill on" data-diff="all">All</button>
                  <button className="dpill" data-diff="easy">Easy</button>
                  <button className="dpill" data-diff="medium">Med</button>
                  <button className="dpill" data-diff="hard">Hard</button>
                </div>
              </div>
              <div className="ctrl-group">
                <div className="ctrl-label">Questions per Batch</div>
                <div className="batch-pills">
                  <button className="bpill on" data-b="5">5</button>
                  <button className="bpill" data-b="10">10</button>
                  <button className="bpill" data-b="20">20</button>
                  <button className="bpill" data-b="30">30</button>
                </div>
              </div>
              <button className="gen-btn" id="gen-btn">
                <span id="gen-icon">⚡</span>
                <span id="gen-lbl">Generate Questions</span>
              </button>
              <div className="cost-note">Est. cost per batch: <b id="cost-val">~$0.0003</b></div>
            </div>
            <div className="q-list" id="q-list">
              <div className="list-empty"><span className="ei">📚</span>Hit <b style={{color:'var(--accent)'}}>Generate Questions</b> to create your first batch.</div>
            </div>
          </div>

          <div className="detail" id="detail">
            <div className="welcome">
              <div className="welcome-emoji">🏆</div>
              <h1>Infinite SAT Math<br /><em>Practice Engine</em></h1>
              <p>AI-generated SAT-style questions, forever. Pick a topic and difficulty, then hit Generate to start practising.</p>
              <div className="how-steps">
                <div className="hstep"><div className="hstep-num">1</div><div className="hstep-text">API key is pre-loaded — just hit Generate</div></div>
                <div className="hstep"><div className="hstep-num">2</div><div className="hstep-text">Choose topic, difficulty &amp; batch size</div></div>
                <div className="hstep"><div className="hstep-num">3</div><div className="hstep-text">Generate → answer → review → repeat</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* OVERLAY */}
        <div className="overlay" id="overlay">
          <div className="loader-card">
            <div className="spin-ring"></div>
            <div className="loader-title" id="ov-title">Generating questions…</div>
            <div className="loader-sub" id="ov-sub">Crafting SAT-style problems</div>
            <div className="loader-cost" id="ov-cost">Estimated cost: &lt;$0.001</div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
(function() {
  const GOOGLE_KEY = 'AIzaSyDxW8wFQHbT2VkK55L4IlxfUuGAeV12wAE';
  const root = document.getElementById('sat-vault');
  if (!root) return;

  // ── STATE ──
  let questions=[], attempted={}, correct={}, currentId=null;
  let qCounter=0, isBusy=false;
  let provider='gemini', apiKey=GOOGLE_KEY;
  let topicF='all', diffF='all', batchN=5;
  const COSTS={gemini:{per10:0.0006},openai:{per10:0.002}};

  // ── INIT KEY ──
  function initKey() {
    try { localStorage.setItem('sat_key_gemini', GOOGLE_KEY); } catch(e){}
    const inp = root.querySelector('#api-key-input');
    if (inp) inp.value = GOOGLE_KEY;
    root.querySelector('#api-strip')?.classList.add('has-key');
    setStatus('✓ Key ready', true);
  }

  // ── THEME ──
  function initTheme() {
    let t = 'dark';
    try { t = localStorage.getItem('sat_theme') || 'dark'; } catch(e){}
    root.setAttribute('data-theme', t);
    root.querySelector('#theme-btn').textContent = t === 'dark' ? '🌙' : '☀️';
  }
  root.querySelector('#theme-btn').addEventListener('click', () => {
    const cur = root.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    root.querySelector('#theme-btn').textContent = next === 'dark' ? '🌙' : '☀️';
    try { localStorage.setItem('sat_theme', next); } catch(e){}
  });

  // ── STORAGE ──
  async function persist() {
    try { await window.storage?.set('satv3', JSON.stringify({attempted,correct,qCounter})); } catch(e){}
  }
  async function hydrate() {
    try {
      const r = await window.storage?.get('satv3');
      if (r) { const d=JSON.parse(r.value); attempted=d.attempted||{}; correct=d.correct||{}; qCounter=d.qCounter||0; }
    } catch(e){}
    updateStats();
  }

  // ── SAVE KEY btn ──
  root.querySelector('.api-save-btn').addEventListener('click', () => {
    const v = root.querySelector('#api-key-input').value.trim();
    if (!v) return;
    apiKey = v;
    try { localStorage.setItem('sat_key_'+provider, v); } catch(e){}
    root.querySelector('#api-strip').classList.add('has-key');
    setStatus('✓ Key saved', true);
  });
  root.querySelector('#api-key-input').addEventListener('input', () => {
    root.querySelector('#api-status').textContent = '';
  });

  function setStatus(msg, ok) {
    const el = root.querySelector('#api-status');
    el.textContent = msg;
    el.className = 'api-status ' + (ok ? 'ok' : 'err');
    if (ok) setTimeout(() => { if(el.textContent===msg) el.textContent=''; }, 3000);
  }

  // ── PROVIDER TABS ──
  root.querySelectorAll('.ptab').forEach(btn => {
    btn.addEventListener('click', () => {
      provider = btn.dataset.pv;
      root.querySelectorAll('.ptab').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      updateCost();
    });
  });

  // ── TOPIC ──
  root.querySelectorAll('[data-topic]').forEach(btn => {
    btn.addEventListener('click', () => {
      topicF = btn.dataset.topic;
      root.querySelectorAll('[data-topic]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      renderList();
    });
  });

  // ── DIFF ──
  root.querySelectorAll('.dpill').forEach(btn => {
    btn.addEventListener('click', () => {
      diffF = btn.dataset.diff;
      root.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      renderList();
    });
  });

  // ── BATCH ──
  root.querySelectorAll('.bpill').forEach(btn => {
    btn.addEventListener('click', () => {
      batchN = parseInt(btn.dataset.b);
      root.querySelectorAll('.bpill').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      updateCost();
    });
  });

  function updateCost() {
    const est = (COSTS[provider].per10 * batchN / 10).toFixed(4);
    root.querySelector('#cost-val').textContent = '~$' + est;
  }

  function filtered() {
    return questions.filter(q =>
      (topicF==='all' || q.topic===topicF) &&
      (diffF==='all'  || q.diff===diffF)
    );
  }

  // ── GENERATE ──
  root.querySelector('#gen-btn').addEventListener('click', generateBatch);
  async function generateBatch() {
    if (isBusy) return;
    if (!apiKey) { setStatus('⚠ No API key', false); return; }
    isBusy = true;
    const btn = root.querySelector('#gen-btn');
    btn.disabled = true;
    root.querySelector('#gen-lbl').textContent = 'Generating…';
    root.querySelector('#gen-icon').textContent = '⏳';
    root.querySelector('#overlay').classList.add('show');
    const est = (COSTS[provider].per10 * batchN / 10).toFixed(4);
    root.querySelector('#ov-cost').textContent = 'Estimated cost: ~$' + est;

    const topicStr = topicF==='all' ? 'a varied mix of Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry, Trigonometry' : topicF;
    const diffStr  = diffF==='all'  ? 'a mix of easy, medium, and hard' : diffF;

    const msgs=[['Writing question stems…','Designing SAT scenarios'],['Building answer choices…','Crafting distractors'],['Writing solutions…','Step-by-step answers'],['Almost done…','Final check']];
    let mi=0;
    const tick=setInterval(()=>{
      mi=(mi+1)%msgs.length;
      root.querySelector('#ov-title').textContent=msgs[mi][0];
      root.querySelector('#ov-sub').textContent=msgs[mi][1];
    },2000);

    const prompt = \`You are an expert SAT Math question writer. Generate exactly \${batchN} original SAT-style math questions.
Requirements:
- Topic: \${topicStr}
- Difficulty: \${diffStr}
- Mix of type "mc" (4 choices) and type "spr" (single numeric answer)
- Authentic SAT language, realistic contexts, strong distractors
- Complete worked solution and plain-English explanation per question
Return ONLY a raw JSON array — no markdown, no fences, no extra text.
Schema: {"topic":"Algebra"|"Advanced Math"|"Problem Solving"|"Geometry"|"Trigonometry","diff":"easy"|"medium"|"hard","type":"mc"|"spr","q":"Full question","given":"Optional equation or empty string","opts":["A","B","C","D"],"ans":0,"exp":"Explanation","math":"Step-by-step solution"}
For mc: opts has 4 strings, ans is 0-3. For spr: opts is [], ans is a string like "7".\`;

    try {
      let raw='';
      if (provider==='gemini') {
        const url='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+apiKey;
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.92,maxOutputTokens:8192}})});
        const d=await res.json();
        if(d.error) throw new Error(d.error.message);
        raw=d.candidates?.[0]?.content?.parts?.[0]?.text||'';
      } else {
        const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body:JSON.stringify({model:'gpt-4o-mini',max_tokens:8192,temperature:0.92,messages:[{role:'user',content:prompt}]})});
        const d=await res.json();
        if(d.error) throw new Error(d.error.message);
        raw=d.choices?.[0]?.message?.content||'';
      }
      const clean=raw.replace(/^\`\`\`(?:json)?\\s*/m,'').replace(/\\s*\`\`\`\\s*$/m,'').trim();
      const parsed=JSON.parse(clean);
      parsed.forEach(q=>{ qCounter++; q.id='Q'+String(qCounter).padStart(4,'0'); if(!q.opts)q.opts=[]; if(!q.given)q.given=''; questions.push(q); });
      renderList(); updateStats(); persist();
      if(parsed.length) selectQ(parsed[0].id);
      setStatus('✓ '+parsed.length+' questions added', true);
    } catch(err) {
      console.error(err);
      setStatus('✗ '+err.message, false);
    } finally {
      clearInterval(tick);
      root.querySelector('#overlay').classList.remove('show');
      btn.disabled=false;
      root.querySelector('#gen-lbl').textContent='Generate Questions';
      root.querySelector('#gen-icon').textContent='⚡';
      isBusy=false;
    }
  }

  // ── LIST ──
  function renderList() {
    const el=root.querySelector('#q-list');
    const vis=filtered();
    if(!vis.length){
      el.innerHTML=questions.length
        ? '<div class="list-empty"><span class="ei">🔍</span>No questions match this filter.</div>'
        : '<div class="list-empty"><span class="ei">📚</span>Hit <b style="color:var(--accent)">Generate Questions</b> to start.</div>';
      return;
    }
    el.innerHTML=vis.map((q,i)=>{
      const done=attempted[q.id]!==undefined;
      const ok=correct[q.id];
      const short={'Problem Solving':'Data','Advanced Math':'Adv Math'}[q.topic]||q.topic;
      return '<div class="qrow'+(done?' done':'')+(currentId===q.id?' active':'')+'" data-id="'+q.id+'">'
        +'<div class="qrow-left"><span class="qrow-num">'+String(i+1).padStart(2,'0')+'</span><span class="diff-dot '+q.diff+'"></span></div>'
        +'<div class="qrow-body"><div class="qrow-topic-line">'+short+' · '+q.diff+'</div><div class="qrow-preview">'+q.q.replace(/\\n/g,' ')+'</div></div>'
        +(done?'<span class="qrow-check">'+(ok?'✅':'❌')+'</span>':'')
        +'</div>';
    }).join('');
    el.querySelectorAll('.qrow').forEach(row=>row.addEventListener('click',()=>selectQ(row.dataset.id)));
  }

  // ── DETAIL ──
  function selectQ(id) {
    currentId=id; renderList(); renderDetail();
    root.querySelector('.qrow.active')?.scrollIntoView({block:'nearest'});
  }

  function renderDetail() {
    const q=questions.find(x=>x.id===currentId);
    if(!q) return;
    const detail=root.querySelector('#detail');
    const done=attempted[q.id]!==undefined;
    const ok=correct[q.id];
    const vis=filtered();
    const idx=vis.findIndex(x=>x.id===currentId);

    const chips='<div class="qview-chips">'
      +'<span class="chip chip-id">'+q.id+'</span>'
      +'<span class="chip chip-topic">'+q.topic+'</span>'
      +'<span class="chip chip-'+q.diff+'">'+q.diff+'</span>'
      +'<span class="chip chip-type">'+(q.type==='spr'?'Open Response':'Multiple Choice')+'</span>'
      +'</div>';

    const nav='<div class="q-progress-row">'
      +'<span style="font-size:13px;color:var(--text3);font-weight:700">Question '+(idx+1)+' of '+vis.length+'</span>'
      +'<div class="q-nav-arrows"><button class="q-arrow" id="nav-prev">←</button><button class="q-arrow" id="nav-next">→</button></div>'
      +'</div>';

    let inputHtml='';
    if(q.type==='mc'){
      inputHtml='<div class="opts">'+q.opts.map((o,i)=>{
        let cls=done?'done':'';
        if(done){ if(i===Number(q.ans))cls+=' cor'; else if(attempted[q.id]===i)cls+=' wrg'; else cls+=' neutral-done'; }
        return '<div class="opt '+cls+'" data-i="'+i+'">'
          +'<div class="opt-badge">'+'ABCD'[i]+'</div>'
          +'<div class="opt-txt">'+o+'</div>'
          +(done&&i===Number(q.ans)?'<span style="margin-left:auto;font-size:16px">✓</span>':'')
          +'</div>';
      }).join('')+'</div>';
    } else {
      const ic=done?(ok?'cor':'wrg'):'';
      inputHtml='<div class="spr-section">'
        +'<div class="spr-label">📝 Enter Your Answer</div>'
        +'<input class="spr-input '+ic+'" id="spr-in" type="text" placeholder="Type answer here…"'
        +(done?' value="'+q.ans+'" disabled':'')+'>'
        +'</div>';
    }

    const banner=done?'<div class="result-banner show '+(ok?'cor':'wrg')+'">'
      +'<span class="result-icon">'+(ok?'🎉':'❌')+'</span>'
      +'<span>'+(ok?'Correct! Great work.':'Not quite — correct answer: <strong>'+(q.type==='mc'?(q.opts[Number(q.ans)]||q.ans):q.ans)+'</strong>')+'</span>'
      +'</div>':'';

    let acts='';
    if(done){acts='<div class="act-row"><button class="btn-primary" id="btn-next">Next Question →</button><button class="btn-outline" id="btn-retry">↺ Retry</button></div>';}
    else if(q.type==='spr'){acts='<div class="act-row"><button class="btn-primary" id="btn-submit">Submit Answer</button><button class="btn-outline" id="btn-skip">Skip →</button></div>';}

    const exp=done?'<div class="exp-card show">'
      +'<div class="exp-card-header"><span class="exp-card-header-icon">💡</span><span class="exp-card-title">Full Solution &amp; Explanation</span></div>'
      +'<div class="exp-card-body"><div class="exp-text">'+q.exp+'</div><div class="exp-math-block">'+q.math+'</div></div>'
      +'</div>':'';

    detail.innerHTML='<div class="qview">'+chips+nav
      +'<div class="qtext">'+q.q+'</div>'
      +(q.given?'<div class="math-given">'+q.given+'</div>':'')
      +inputHtml+banner+acts+exp+'</div>';

    detail.querySelector('#nav-prev')?.addEventListener('click',()=>goRel(-1));
    detail.querySelector('#nav-next')?.addEventListener('click',()=>goRel(1));
    detail.querySelector('#btn-next')?.addEventListener('click',()=>goRel(1));
    detail.querySelector('#btn-retry')?.addEventListener('click',retryQ);
    detail.querySelector('#btn-submit')?.addEventListener('click',submitSPR);
    detail.querySelector('#btn-skip')?.addEventListener('click',()=>goRel(1));
    detail.querySelectorAll('.opt:not(.done)').forEach(opt=>{
      opt.addEventListener('click',()=>pick(parseInt(opt.dataset.i)));
    });
    const sprIn=detail.querySelector('#spr-in');
    sprIn?.addEventListener('keydown',e=>{if(e.key==='Enter')submitSPR();});
  }

  function pick(i){
    const q=questions.find(x=>x.id===currentId);
    if(!q||attempted[q.id]!==undefined) return;
    attempted[q.id]=i; correct[q.id]=(i===Number(q.ans));
    updateStats(); persist(); renderList(); renderDetail();
  }
  function submitSPR(){
    const q=questions.find(x=>x.id===currentId);
    if(!q) return;
    const v=(root.querySelector('#spr-in')?.value||'').trim();
    if(!v) return;
    attempted[q.id]=v;
    correct[q.id]=v===String(q.ans)||(!isNaN(parseFloat(q.ans))&&parseFloat(v)===parseFloat(q.ans));
    updateStats(); persist(); renderList(); renderDetail();
  }
  function goRel(dir){
    const vis=filtered();
    const idx=vis.findIndex(q=>q.id===currentId);
    const next=vis[idx+dir];
    if(next) selectQ(next.id);
  }
  function retryQ(){
    const q=questions.find(x=>x.id===currentId);
    if(!q) return;
    delete attempted[q.id]; delete correct[q.id];
    updateStats(); persist(); renderList(); renderDetail();
  }

  function updateStats(){
    const a=Object.keys(attempted).length;
    const c=Object.values(correct).filter(Boolean).length;
    const pct=a>0?Math.round(c/a*100):null;
    root.querySelector('#s-gen').textContent=questions.length;
    root.querySelector('#s-att').textContent=a;
    root.querySelector('#s-cor').textContent=c;
    root.querySelector('#s-pct').textContent=pct!==null?pct+'%':'—';
    root.querySelector('#pbar').style.width=(pct||0)+'%';
  }

  // ── BOOT ──
  initTheme();
  initKey();
  hydrate();
  updateCost();
})();
      `}} />
    </>
  )
}
