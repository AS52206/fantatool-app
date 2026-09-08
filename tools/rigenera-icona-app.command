#!/bin/zsh
# Ricostruisce "Fantatool.app" (Desktop e ~/Applications) con l'icona da
# app/static/icon.svg. Doppio click se il Finder mostra l'icona sbagliata
# (es. quella di una cartella) o dopo aver cambiato icon.svg.
set -e
cd "$(dirname "$0")/.."
SRC="app/static/icon.svg"
TMP="$(mktemp -d)"

qlmanage -t -s 1024 -o "$TMP" "$SRC" >/dev/null 2>&1
mv "$TMP/icon.svg.png" "$TMP/base.png"
i="$TMP/Fantatool.iconset"; mkdir "$i"
for s in 16 32 64 128 256 512 1024; do sips -z $s $s "$TMP/base.png" --out "$TMP/r$s.png" >/dev/null; done
cp "$TMP/r16.png"  "$i/icon_16x16.png";     cp "$TMP/r32.png"  "$i/icon_16x16@2x.png"
cp "$TMP/r32.png"  "$i/icon_32x32.png";     cp "$TMP/r64.png"  "$i/icon_32x32@2x.png"
cp "$TMP/r128.png" "$i/icon_128x128.png";   cp "$TMP/r256.png" "$i/icon_128x128@2x.png"
cp "$TMP/r256.png" "$i/icon_256x256.png";   cp "$TMP/r512.png" "$i/icon_256x256@2x.png"
cp "$TMP/r512.png" "$i/icon_512x512.png";   cp "$TMP/r1024.png" "$i/icon_512x512@2x.png"
iconutil -c icns "$i" -o "app/Fantatool.icns"

make_app() {
	APP="$1"
	rm -rf "$APP"
	mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
	cp "app/Fantatool.icns" "$APP/Contents/Resources/Fantatool.icns"
	cp "app/Fantatool.Info.plist" "$APP/Contents/Info.plist"
	printf 'APPL????' > "$APP/Contents/PkgInfo"
	cat > "$APP/Contents/MacOS/Fantatool" <<'EX'
#!/bin/zsh
LAUNCH="$HOME/Desktop/Fantatool-App/app/asta-stabile.command"
[[ -x "$LAUNCH" ]] && open -a Terminal "$LAUNCH" || osascript -e 'display alert "Fantatool: manca asta-stabile.command" as critical'
EX
	chmod +x "$APP/Contents/MacOS/Fantatool"
	SetFile -a C "$APP" 2>/dev/null || true   # bit "icona personalizzata"
	touch "$APP"
}
make_app "$HOME/Desktop/Fantatool.app"
make_app "$HOME/Applications/Fantatool.app"

LS=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LS" -f "$HOME/Desktop/Fantatool.app" "$HOME/Applications/Fantatool.app" 2>/dev/null || true
rm -rf "$HOME/Library/Caches/com.apple.iconservices"* 2>/dev/null || true
qlmanage -r cache >/dev/null 2>&1 || true
killall Finder Dock 2>/dev/null || true
rm -rf "$TMP"
echo "OK — Fantatool.app ricreata su Desktop e in ~/Applications."
echo "Se l'icona è ancora sbagliata: logout/login."
