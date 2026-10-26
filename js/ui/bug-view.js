// "Report a bug": the student says what's weird; the app adds where they were
// (station, camera, scene, settings, browser). Saved for the Canvas export;
// a copyable report and a prefilled GitHub issue are smaller extras.
// Ported from Mixer Lab's bug button.
import { MAX_TEXT, REPO_IMPROVEMENT_FORM, contextLine, issueUrl, reportText } from "../bugs.js";
import { appVersionNow } from "../app-version.js";

export class BugView {
  // getContext(): { station, title, camera, scene, settings, url }
  constructor(dialog, { bugs, getContext, onSaved }) {
    Object.assign(this, { dialog, bugs, getContext, onSaved });
    dialog.innerHTML = `<div class="bug-inner">
      <header class="bug-head"><h2 id="bug-title">Report a bug</h2>
        <button type="button" class="bug-x" data-close-bug aria-label="Close">✕</button></header>
      <p class="bug-note">Something weird, wrong or confusing? Say what you did and what happened. It's saved with where you were and goes into your Canvas summary (Finish page).</p>
      <p class="bug-where"></p>
      <label class="bug-field">What happened?
        <textarea class="bug-text" rows="4" maxlength="${MAX_TEXT}" placeholder="I set the iris to F4.0 but the Check button said it wasn't…"></textarea></label>
      <button type="button" class="btn btn-start" data-bug-save>Save for my Canvas summary</button>
      <p class="bug-status" role="status" aria-live="polite"></p>
      <p class="bug-extras">Also: <button type="button" class="linkish" data-bug-copy>Copy the report</button> · <a class="linkish" href="${REPO_IMPROVEMENT_FORM}" target="_blank" rel="noopener">Repo Improvement form</a> · <button type="button" class="linkish" data-bug-github>Open a GitHub issue</button> <small>(needs a GitHub account; the issue is public)</small></p>
    </div>`;
    this.$ = (s) => dialog.querySelector(s);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-close-bug]")) dialog.close();
      else if (e.target.closest("[data-bug-save]")) this.save();
      else if (e.target.closest("[data-bug-copy]")) this.copy();
      else if (e.target.closest("[data-bug-github]")) this.github();
    });
  }

  open() {
    this.ctx = this.getContext();
    this.$(".bug-where").textContent = `Where you are: ${contextLine({ ...this.ctx, at: "" }) || "the home page"}`;
    this.$(".bug-text").value = "";
    this.status("");
    if (!this.dialog.open) this.dialog.showModal();
    this.$(".bug-text").focus();
  }

  report() {
    const ctx = this.ctx || this.getContext();
    return { ...ctx, text: this.$(".bug-text").value, at: new Date().toISOString(), browser: browserName(), appVersion: appVersionNow() };
  }

  save() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.");
    this.bugs.add(this.report());
    this.dialog.close();
    this.onSaved?.();
  }

  async copy() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.");
    try {
      await navigator.clipboard.writeText(reportText(this.report()));
      this.status("Report copied.");
    } catch (e) {
      this.status("Couldn't copy automatically.");
    }
  }

  github() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.");
    window.open(issueUrl(this.report()), "_blank", "noopener");
  }

  status(msg) {
    this.$(".bug-status").textContent = msg;
  }
}

function browserName() {
  const ua = navigator.userAgent;
  const m = /(Edg|OPR|Firefox|CriOS|Chrome|Version)\/(\d+)/.exec(ua);
  const name = m ? { Edg: "Edge", OPR: "Opera", CriOS: "Chrome iOS", Version: "Safari" }[m[1]] || m[1] : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Win/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return `${name} ${m ? m[2] : ""}${os ? ` on ${os}` : ""}`.trim();
}
