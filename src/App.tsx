import "./styles/global.css";
import { useCallback, useEffect, useState } from "react";
import { TrayIcon } from "@tauri-apps/api/tray";
import { api, type Group } from "./services/tauri";
import { TitleBar } from "./components/TitleBar";
import { SearchToggle } from "./components/SearchToggle";
import { Sidebar, PAGE_TITLES, type Page } from "./components/Sidebar";
import { StatusBar, type Notice, type Notify } from "./components/StatusBar";
import { GroupEditor } from "./components/GroupEditor";
import { useSnapshot } from "./hooks/useSnapshot";
import { useUpdater } from "./hooks/useUpdater";
import { useShortcuts } from "./hooks/useShortcuts";
import Running from "./pages/Running";
import Groups from "./pages/Groups";
import Startup from "./pages/Startup";
import Settings from "./pages/Settings";

function App() {
  const [page, setPage] = useState<Page>("running");
  const [query, setQuery] = useState("");
  const [searchSignal, setSearchSignal] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<Group | null>(null);
  const [refreshSeconds, setRefreshSeconds] = useState(2);
  const { snapshot, error, refresh } = useSnapshot(refreshSeconds * 1000);
  const updater = useUpdater();

  const loadSettings = useCallback(() => {
    api.getSettings().then((s) => setRefreshSeconds(s.refreshSeconds || 2)).catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
    if (localStorage.getItem("muffle.showTrayIcon") === "false") {
      TrayIcon.getById("main")
        .then((tray) => tray?.setVisible(false))
        .catch(() => {});
    }
  }, [loadSettings]);

  const notify: Notify = useCallback((text, tone = "info") => setNotice({ text, tone }), []);

  // Notices fade after a while; errors stay a little longer.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === "error" ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const navigate = useCallback((to: Page) => {
    setPage(to);
    setSearchSignal(0);
  }, []);

  // Off while the group editor is open: it has its own search and focus.
  useShortcuts(
    editing
      ? {}
      : {
          "1": () => navigate("running"),
          "2": () => navigate("groups"),
          "3": () => navigate("startup"),
          ",": () => navigate("settings"),
          f: () => {
            setPage("running");
            setSearchSignal((n) => n + 1);
          },
          n: () => setEditing({ id: "", name: "", mode: "stop", units: [] }),
          r: refresh,
        },
  );

  const pageProps = { snapshot, refresh, notify, onEditGroup: setEditing };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden rounded-xl bg-bg ring-1 ring-line">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          page={page}
          onNavigate={navigate}
          counts={{ running: snapshot?.units.length, groups: snapshot?.groups.length }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TitleBar title={PAGE_TITLES[page]}>
            {page === "running" && <SearchToggle value={query} onChange={setQuery} focusSignal={searchSignal} />}
          </TitleBar>

          <main className="flex min-h-0 flex-1 flex-col">
            {page === "running" && <Running {...pageProps} query={query} />}
            {page === "groups" && <Groups {...pageProps} />}
            {page === "startup" && <Startup notify={notify} />}
            {page === "settings" && <Settings notify={notify} onSettingsChanged={loadSettings} updater={updater} />}
          </main>
        </div>
      </div>

      <StatusBar
        snapshot={snapshot}
        error={error}
        notice={notice}
        update={updater.status}
        onOpenUpdate={() => navigate("settings")}
      />

      {editing && (
        <GroupEditor
          group={editing}
          units={snapshot?.units ?? []}
          onClose={() => setEditing(null)}
          onSaved={refresh}
          onError={(m) => notify(m, "error")}
        />
      )}
    </div>
  );
}

export default App;
