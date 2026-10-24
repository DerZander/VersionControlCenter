# Version Control Center

## Ziel
Version Control Center ist eine Desktop-Anwendung zur übersichtlichen Verwaltung von Git-Repositories. Die Bedienung und Änderungsansicht sollen sich an der Git-Integration von IntelliJ orientieren.

Die Anwendung soll zunächst für Windows entwickelt werden.

## Technologie
- Electron als Desktop-Framework.
- React und TypeScript für die Benutzeroberfläche.
- Git-Aktionen werden über die installierte Git-Kommandozeile ausgeführt.

## Workspaces und Repositories
- Beim Start kann ein vorhandener Workspace ausgewählt oder ein neuer erstellt werden.
- Auf dem Startbildschirm werden bis zu acht zuletzt geöffnete Workspaces angezeigt.
- Das Workspace-Dropdown in der Sidebar zeigt alle bekannten, noch vorhandenen Workspaces ohne Begrenzung auf acht an. Dort lassen sich Workspaces wechseln, öffnen und erstellen. Unbekannte Workspace-Dateien müssen einmal geöffnet werden, damit sie in der Liste erscheinen.
- Workspaces können auch nach dem Start erstellt werden.
- „Workspace bearbeiten“ im Workspace-Dropdown erlaubt das Umbenennen sowie Hinzufügen, rekursive Suchen und Entfernen von Repositories. Änderungen werden erst mit „Speichern“ übernommen; „Abbrechen“ verwirft sie. Entfernen löscht keine Ordner oder Git-Daten. Der Workspace-Dateiname bleibt beim Umbenennen unverändert.
- Workspaces werden als Datei an einem frei wählbaren Speicherort gespeichert.
- Repositories können einem Workspace hinzugefügt werden.
- Beim Hinzufügen eines Ordners sucht die Anwendung rekursiv in dessen Unterordnern nach Git-Repositories und erkennt diese automatisch.
- Mehrere Repositories eines Workspaces können gemeinsam überblickt und verwaltet werden.

## Einstellungen
- Das Zahnrad öffnet die Einstellungen auf dem Startbildschirm und neben dem Workspace-Dropdown in der Sidebar. Die Einstellungen sind in die Tabs „Workspace“, „Darstellung“, „Sprache“ und „GitHub“ aufgeteilt.
- Die GitHub-Verbindung wird im Tab „GitHub“ per Browser oder Token eingerichtet und verwaltet. Der Status erscheint unten in der Statusleiste des geöffneten Workspaces (ein gespeicherter Token gilt als verbunden; eine laufende Online-Prüfung findet nicht statt). Die bisherigen GitHub- und „Lokaler Workspace“-Bereiche unten in der Sidebar entfallen.
- Als Standard-Workspace kann der aktuelle Workspace, ein zuletzt geöffneter Workspace oder eine andere Workspace-Datei ausgewählt werden. Er wird beim nächsten Start automatisch geöffnet.
- Ohne Standard-Workspace erscheint weiterhin der Startbildschirm mit den zuletzt geöffneten Workspaces. Ist der Standard nicht mehr verfügbar, wird dort eine Fehlermeldung angezeigt; ein anderer Workspace kann geöffnet oder der Standard geändert werden.
- Helle und dunkle Darstellung sowie getrennte Schriftgrößen für Oberfläche (12–18 px Basisschriftgröße) und Codeansicht (10–24 px) sind einstellbar.
- Im Tab „Darstellung“ lässt sich außerdem die Standardansicht der lokalen Änderungen festlegen: direkte Dateiliste oder hierarchischer Modulbaum. Die Vorgabe wird beim Start angewendet; der Augen-Button erlaubt weiterhin temporäres Umschalten, ohne den Standard zu ändern.
- Im Tab „Sprache“ stehen Deutsch und Englisch zur Auswahl. Die Standardsprache ist Englisch; eine bereits gespeicherte Sprachwahl bleibt erhalten. Oberfläche, Tooltips, Dialoge, anwendungseigene Meldungen und Datumsformatierung richten sich nach der gespeicherten Sprache. Dateiinhalte, Commit-Nachrichten und externe Git-/System-/GitHub-Fehlermeldungen bleiben unverändert.
- Darstellung, Standardansicht, Sprache und Schriftgrößen werden beim Speichern angewendet. Alle Einstellungen werden lokal im Electron-Benutzerdatenverzeichnis in `settings.json` gespeichert und beim nächsten Start wiederhergestellt. Ohne gespeicherte Sprache oder Standardansicht gelten Englisch und der Modulbaum; bereits gespeicherte Auswahlen bleiben erhalten.

## Geplante Git-Funktionen
- Änderungen pro Repository in einer Gegenüberstellung anzeigen: vorheriger Stand links, aktueller Stand rechts.
- Eine gemeinsame horizontale Scrollleiste unter dem Vergleich verschiebt beide Seiten und alle Änderungsblöcke synchron. Lange Zeilen werden nicht mehr mit Auslassungspunkten abgeschnitten; Zeilennummern bleiben stehen.
- „Änderungen verwerfen“ (Zurück-Pfeil an jeder Datei) setzt nach Bestätigung die gesamte Datei einschließlich vorgemerkter Änderungen auf den letzten Commit zurück. Neue Dateien werden in den Papierkorb verschoben und aus dem Index entfernt. Andere Dateien und die Commit-Historie bleiben unverändert. Die Aktion ist in der Dateiliste und im Modulbaum verfügbar; Verzeichnisse und Submodule werden nicht rekursiv verworfen.
- Zum Committen Dateien mit dem Plus vormerken, eine Commit-Nachricht eingeben und „Commit“ wählen. Der Refresh-Button neben dem Branch entfällt; „Änderungen aktualisieren“ über der Dateiliste bleibt verfügbar.
- Die lokalen Änderungen des ausgewählten Repositories können als flache Dateiliste oder als IDE-artiger Verzeichnisbaum angezeigt werden. In der Modulansicht bildet das Repository die Wurzel; Unterordner werden hierarchisch eingerückt und lassen sich einzeln ein- und ausklappen. Dateien liegen unter ihrem jeweiligen Ordner, Stammdateien direkt unter der Wurzel. Ordner stehen alphabetisch vor Dateien; nur Pfade mit Änderungen werden angezeigt. Eine Gruppierung über mehrere Repositories ist nicht vorgesehen.
- Dateizeilen zeigen nur den Dateinamen. Der vollständige relative Pfad erscheint als Tooltip.
- Der Augen-Button über der Dateiliste öffnet die Ansichtsauswahl (direkte Dateiliste oder Gruppierung nach Modulen).
- Die Breite von Dateiliste und Änderungsansicht ist über den Trenner dazwischen anpassbar. Ziehen oder fokussieren und Pfeiltasten verwenden (mit Umschalt größere Schritte); Pos1/Ende wählen die Mindest-/Maximalbreite. Doppelklick stellt die Standardaufteilung wieder her.
- Repository hinzufügen und Ordner rekursiv durchsuchen sind oben neben „Repositories“ erreichbar; die doppelten Aktionen unten in der Sidebar entfallen.
- Die Dateiliste lädt unabhängig von den übrigen Repositories; die Commit-Historie wird erst beim Öffnen des Git-Logs abgerufen.
- Dateien und einzelne Änderungsblöcke (Hunks) für einen Commit auswählen.
- Commits direkt in der Anwendung erstellen.
- Git-Log und Commit-Historie anzeigen.
- In Git log und „Ungepushte Commits“ öffnet ein Klick auf einen Commit dessen Dateiliste. Die Dateiauswahl zeigt den schreibgeschützten Vorher-/Nachher-Vergleich mit synchroner horizontaler Scrollleiste. Verglichen wird mit dem ersten Eltern-Commit (bei Merge-Commits ebenfalls), beim initialen Commit mit einem leeren Stand. Neue, gelöschte und umbenannte Dateien werden berücksichtigt; Binärdateien zeigen die Git-Diff-Meldung. Arbeitsdateien und Git-Index bleiben unverändert.
- Zwischen Changes und Git log zeigt „Ungepushte Commits“ die Anzahl und alle Commits des aktuellen Branches, die im Upstream fehlen (ohne das 30-Commit-Limit des Git-Logs). Angezeigt werden Commit-Nachricht, Autor, Datum und Kurz-Hash. Ohne Upstream werden stattdessen Commits angezeigt, die in keinem lokal bekannten Remote-Branch enthalten sind; ein Hinweis erklärt diesen Vergleichsmodus. Ohne bekannte Remote-Branches sind dies alle Commits des Branches. Der Vergleich nutzt ausschließlich lokale Remote-Informationen; „Fetch“ aktualisiert sie. Nach Commit, Fetch, Pull und Push aktualisiert sich die Anzeige. Bei Detached HEAD wird zum Auschecken eines Branches aufgefordert. Die Anzeige selbst führt keinen Fetch oder Push aus und richtet keinen Upstream ein.
- Branches aus bestehenden Branches erstellen und automatisch auf den neuen Branch wechseln. Bei nicht committeten Änderungen werden diese automatisch gestasht, nach dem Wechsel wiederhergestellt und der Benutzer darüber informiert.
- Fetch, Pull und Push einzeln pro Repository oder gesammelt für alle Repositories im Workspace ausführen.
- Die Repository-Aktionen Fetch, Pull, Push, Branch und Pull Request stehen rechts neben Ahead/Behind in derselben Zeile wie die Tabs Changes und Git log. Bei wenig Platz ist diese Zeile horizontal scrollbar; eine vertikale Scrollbar wird dort nicht angezeigt.
- Fehlt der Upstream, ordnet Pull einen eindeutig vorhandenen gleichnamigen Remote-Branch zu. Ein manueller Push setzt den Upstream und kann bei nur einem Remote einen neuen Branch veröffentlichen. Mehrdeutige Zuordnungen werden mit einer Anleitung abgelehnt; Pull veröffentlicht niemals einen Branch.
- Pull Requests über GitHub erstellen.
- Der GitHub-Button neben Explorer und Git Bash öffnet das `origin`-Repository im Standardbrowser. HTTPS- und SSH-Remotes auf `github.com` werden unterstützt; fehlt `origin` oder zeigt es auf einen anderen Dienst, erscheint eine Fehlermeldung. Eine GitHub-Anmeldung in der Anwendung ist dafür nicht erforderlich.
- Für einen Pull Request muss der Branch zuvor manuell gepusht werden; die Anwendung pusht nicht automatisch.
- GitHub-Konten per Browser-Anmeldung oder persönlichem Zugriffstoken (PAT) verbinden.
  - Die Browser-Anmeldung verwendet den GitHub Device Flow. Dafür wird eine GitHub OAuth App mit aktiviertem Device Flow und deren Client ID benötigt.
  - Zugriffstoken werden lokal mit der sicheren Windows-Speicherung verschlüsselt abgelegt.
  - Unter „Einstellungen → GitHub“ startet „Verbinden“ mit einem eingetragenen Token die Token-Verbindung; ohne Token wird die Browser-Anmeldung mit der Client ID gestartet. Das Verbinden wird unabhängig vom Speichern der allgemeinen Einstellungen ausgeführt.

## Geplanter Arbeitsablauf
1. Den Standard-Workspace automatisch laden lassen oder beim Start einen Workspace auswählen oder erstellen.
2. Repositories hinzufügen oder einen Ordner nach Repositories durchsuchen lassen.
3. Änderungen in den Repositories prüfen und Dateien oder einzelne Hunks auswählen.
4. Commits erstellen und bei Bedarf Push, Pull oder Fetch ausführen.
5. Branches verwalten, Pull Requests erstellen und die Historie im Git-Log nachvollziehen.

## Anwendung starten
Voraussetzungen: Windows, Node.js (22.19 oder neuer) und Git für Windows.

```sh
npm install
npm run dev
```

Der Entwicklungsmodus überwacht auch Main-Prozess und Preload: Änderungen starten Electron neu beziehungsweise laden das Fenster neu. Nach einer Änderung des `dev`-Skripts muss ein bereits laufender Entwicklungsprozess einmal beendet und mit `npm run dev` neu gestartet werden, damit Oberfläche und Preload-API zusammenpassen.

Für einen Produktionsbuild:

```sh
npm run build
npm run preview
```

Den Windows-Installer (NSIS, x64) erstellst du mit:

```sh
npm run dist:win
```

Das Setup liegt anschließend im Ordner `release/`. Der Installer erlaubt die Wahl des Installationsordners und erstellt Startmenü- und Desktop-Verknüpfungen.

Der Windows-Installer verwendet die bereits unter `node_modules\electron\dist` installierte Electron-Laufzeit. Damit entfallen ein erneuter Electron-Download und das Umbenennen von `release\win-unpacked.tmp` nach `release\win-unpacked`, das unter Windows mit `EPERM` scheitern kann. Vor dem erneuten Paketieren eine direkt aus `release\win-unpacked` gestartete Anwendung schließen; laufende Anwendungen können die Ausgabedateien weiterhin sperren.

Für weitere Downloads durch electron-builder verwendet das Installer-Skript automatisch den Zertifikatsspeicher des Betriebssystems. Die TLS-Prüfung wird nicht deaktiviert.
