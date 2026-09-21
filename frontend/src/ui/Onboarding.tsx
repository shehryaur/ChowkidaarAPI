import { useRef, useState } from "react";
import { api } from "../data/api";
import { refresh } from "../data/source";
import { useStore } from "../lib/store";
import { Icon, Spinner } from "./shared";

// First run: name the workspace, get the API key (shown once), connect a project.
// The same last step is reused for "add a project" later.
export function Onboarding() {
  const workspace = useStore((s) => s.workspace);
  const apiKey = useStore((s) => s.apiKey);
  const repos = useStore((s) => s.repos);
  const adding = useStore((s) => s.addingProject);
  const step = !workspace?.onboarded ? 1 : 2;
  return (
    <div className="onboard">
      <div className="panel onboard-card rise" key={step}>
        <ol className="onboard-steps mono" aria-label="Setup progress">
          <li className={step === 1 ? "is-now" : "is-done"}>1 · Workspace</li>
          <li className={step === 2 ? "is-now" : ""}>2 · API key & project</li>
          <li>3 · Pipeline graph</li>
        </ol>
        {step === 1 ? <CreateWorkspace /> : <ConnectProject apiKey={apiKey} first={repos.length === 0} />}
        {adding && repos.length > 0 && (
          <button className="onboard-close icon-btn" onClick={() => useStore.getState().setAddingProject(false)} title="Back to your projects"><Icon.x /></button>
        )}
      </div>
    </div>
  );
}

function CreateWorkspace() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    api.onboard(name.trim() || "My workspace")
      .then((w) => { useStore.getState().setApiKey(w.api_key ?? null); return refresh(); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} className="onboard-body">
      <h1>APIs that maintain their own integrations</h1>
      <p>Chowkidaar watches the external APIs your code depends on. When one changes, an agent finds the code it reaches, fixes it, proves the fix with your own checks, and opens the pull request.</p>
      <label className="field">
        <span className="eyebrow muted">Name your workspace</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme engineering" autoFocus />
      </label>
      <button className="cta cta-mint" disabled={busy}>
        <span>Create workspace<small>Generates the API key your projects connect with</small></span>
        {busy ? <Spinner /> : <Icon.arrow />}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="copy" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); })}>
      {done ? <Icon.check /> : <Icon.layers />} {done ? "Copied" : label}
    </button>
  );
}

function ConnectProject({ apiKey, first }: { apiKey: string | null; first: boolean }) {
  const workspace = useStore((s) => s.workspace)!;
  const [mode, setMode] = useState<"github" | "local">("github");
  const [githubRepo, setGithubRepo] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [busy, setBusy] = useState<"rotate" | "connect" | "pick" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const command = (workspace.connect_command ?? "").replace("<your API key>", apiKey ?? "<your API key>");
  const target = mode === "github" ? githubRepo : localPath;

  const rotate = () => {
    setBusy("rotate");
    api.rotateKey().then((w) => useStore.getState().setApiKey(w.api_key ?? null)).catch((e: Error) => setError(e.message)).finally(() => setBusy(null));
  };
  const connectTarget = (nextTarget = target) => {
    if (!nextTarget.trim()) return;
    setBusy("connect");
    setError(null);
    api.connectRepo(nextTarget.trim(), mode)
      .then((repo) => { useStore.getState().setAddingProject(false); useStore.getState().openProject(repo.id); return refresh(); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  };
  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    connectTarget();
  };
  const pickLocalRepo = () => {
    setError(null);
    folderInput.current?.click();
  };
  const pickedLocalRepo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] as (File & { path?: string; webkitRelativePath?: string }) | undefined;
    if (!file) return;
    const relative = file.webkitRelativePath || file.name;
    const rootName = relative.split("/")[0] || "that folder";
    if (file.path) {
      const normalizedRelative = relative.replace(/\//g, "\\");
      const path = file.path.endsWith(normalizedRelative)
        ? file.path.slice(0, -normalizedRelative.length).replace(/[\\/]$/, "")
        : file.path;
      setLocalPath(path);
      setError(null);
      connectTarget(path);
    } else {
      setBusy("pick");
      api.resolveLocalFolder(rootName)
        .then(({ path }) => {
          setLocalPath(path);
          setError(null);
          connectTarget(path);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setBusy(null));
    }
    e.target.value = "";
  };

  return (
    <div className="onboard-body">
      <h1>{first ? "Connect your first project" : "Add a project"}</h1>
      {apiKey ? (
        <div className="keybox">
          <span className="eyebrow amber">your API key · shown once</span>
          <code className="mono">{apiKey}</code>
          <Copy text={apiKey} label="Copy key" />
          <p className="hint">Only its hash is stored. Keep it somewhere safe; you can always rotate it.</p>
        </div>
      ) : (
        <p className="note">Your key <code className="mono">{workspace.key_prefix}</code> was shown once and is not stored. <button className="link" onClick={rotate} disabled={!!busy}>{busy === "rotate" ? "Rotating…" : "Rotate it"}</button> to get a new one.</p>
      )}

      <form className="group" onSubmit={connect}>
        <h3>Connect a repository</h3>
        <div className="connect-switch" role="tablist" aria-label="Repository source">
          <button type="button" role="tab" aria-selected={mode === "github"} className={mode === "github" ? "is-on" : ""} onClick={() => { setMode("github"); setError(null); }}>
            <Icon.branch /> GitHub repo
          </button>
          <button type="button" role="tab" aria-selected={mode === "local"} className={mode === "local" ? "is-on" : ""} onClick={() => { setMode("local"); setError(null); }}>
            <Icon.layers /> Local folder
          </button>
        </div>

        {mode === "github" ? (
          <div className="connect-box">
            <label className="field">
              <span className="eyebrow muted">GitHub repository</span>
              <input
                className="mono"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="your github repository link"
                spellCheck={false}
              />
            </label>
            <p className="hint">Chowkidaar clones the repo into its workspace and maps the API pipelines from that copy.</p>
          </div>
        ) : (
          <div className="connect-box">
            <label className="field">
              <span className="eyebrow muted">Local repository path</span>
              <div className="path-picker">
                <input
                  ref={folderInput}
                  className="sr-only"
                  type="file"
                  onChange={pickedLocalRepo}
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                />
                <input
                  className="mono"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="Select your local repo folder"
                  spellCheck={false}
                />
                <button type="button" className="btn" onClick={pickLocalRepo} disabled={!!busy}>
                  {busy === "pick" ? <Spinner /> : <Icon.layers />} Select folder
                </button>
              </div>
            </label>
            <p className="hint">Use this when the code is already on the same machine as the backend. The folder must be a Git checkout.</p>
          </div>
        )}

        <button className="cta cta-mint" disabled={!target.trim() || !!busy}>
          <span>{mode === "github" ? "Connect GitHub repo" : "Connect local repo"}<small>{mode === "github" ? "Accepts owner/repo or a github.com URL" : "Scans the checkout from this computer"}</small></span>
          {busy === "connect" ? <Spinner /> : <Icon.arrow />}
        </button>

        <div className="manual-connect">
          <div>
            <h3>Need live env watching?</h3>
            <p className="hint">Run the connector inside the project when you want credential fingerprints and env changes to keep reporting.</p>
          </div>
          <pre className="command mono">{command}</pre>
          <Copy text={command} label="Copy command" />
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
