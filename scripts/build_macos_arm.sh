#!/bin/bash
# AutoClip Desktop macOS Apple Silicon build
# Bundles a portable python-build-standalone Python runtime + backend source
# so end users can double-click to run without installing Python.
#
# Platform-neutral steps (portable Python, pip, backend copy, dependency check,
# frontend) live in scripts/lib/desktop_build_common.sh and are shared with
# scripts/build_windows_x64.sh. Only the macOS-specific parts are here.

set -e

echo "==> AutoClip Desktop build (macOS arm64)"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PBS_TRIPLE="aarch64-apple-darwin"
PORTABLE_PY_REL="bin/python3"
# shellcheck source=lib/desktop_build_common.sh
source "$PROJECT_ROOT/scripts/lib/desktop_build_common.sh"

check_build_tools
prepare_portable_python
install_backend_deps
copy_backend_source
verify_backend_deps

# ---- ffmpeg ----
# We bundle STATIC, self-contained ffmpeg + ffprobe (arm64). Do NOT copy the
# homebrew binary from PATH: it is dynamically linked against ~57 dylibs under
# /opt/homebrew and is unusable on any machine without homebrew installed.
echo "==> Bundling static ffmpeg + ffprobe (arm64)"
mkdir -p "$RESOURCES_DIR/ffmpeg"
FFMPEG_CACHE="build/ffmpeg-cache"
# Static arm64 builds from osxexperts.net (zero non-system dylib deps).
FFMPEG_MIN_BYTES=15000000  # static binaries are ~48MB; zips ~20MB
declare -a FF_NAMES=("ffmpeg" "ffprobe")
declare -a FF_URLS=(
    "https://www.osxexperts.net/ffmpeg711arm.zip"
    "https://www.osxexperts.net/ffprobe711arm.zip"
)
for i in 0 1; do
    name="${FF_NAMES[$i]}"
    zip_cache="$FFMPEG_CACHE/${name}.zip"
    download_with_mirrors "$zip_cache" "$FFMPEG_MIN_BYTES" "${FF_URLS[$i]}"
    # Extract just the binary, then ditto it into place (ditto strips xattrs that trip Tauri's scanner)
    tmp_bin="$FFMPEG_CACHE/extract-$name/$name"
    rm -rf "$FFMPEG_CACHE/extract-$name"
    extract_from_zip "$zip_cache" "$name" "$tmp_bin"
    ditto --noacl --noextattr "$tmp_bin" "$RESOURCES_DIR/ffmpeg/$name"
    chmod 755 "$RESOURCES_DIR/ffmpeg/$name"
    rm -rf "$FFMPEG_CACHE/extract-$name"
done
# Sanity: bundled binaries must have no homebrew dylib deps
for name in ffmpeg ffprobe; do
    hb=$(otool -L "$RESOURCES_DIR/ffmpeg/$name" 2>/dev/null | grep -c homebrew || true)
    if [ "$hb" -ne 0 ]; then
        echo "ERROR: bundled $name still has $hb homebrew dylib deps — not self-contained"; exit 1
    fi
done
echo "OK (ffmpeg $(ls -lh "$RESOURCES_DIR/ffmpeg/ffmpeg" | awk '{print $5}'), ffprobe $(ls -lh "$RESOURCES_DIR/ffmpeg/ffprobe" | awk '{print $5}'))"

build_frontend

# ---- Tauri build ----
echo "==> Building Tauri application (this takes a few minutes)"
cd src-tauri
# Skip the bundler-driven dmg step (it's flaky on macOS 26); we'll create the dmg ourselves
cargo tauri build --bundles app
cd ..

APP_PATH="src-tauri/target/release/bundle/macos/AutoClip Desktop.app"
if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: app bundle not built at $APP_PATH"; exit 1
fi
echo "OK"

# ---- inject resources into .app ----
# We don't declare resources in tauri.conf.json because Tauri's resource
# scanner trips on extended attributes / large binaries on macOS 26.
# Copying them in post-build is reliable. (Windows declares them in
# tauri.windows.conf.json instead, since an installer can't be patched after
# the fact.)
echo "==> Injecting runtime resources into app bundle"
APP_RESOURCES="$APP_PATH/Contents/Resources/resources"
rm -rf "$APP_RESOURCES"
mkdir -p "$APP_RESOURCES"
cp -R "$RESOURCES_DIR/python" "$APP_RESOURCES/"
cp -R "$RESOURCES_DIR/backend" "$APP_RESOURCES/"
cp -R "$RESOURCES_DIR/ffmpeg" "$APP_RESOURCES/"
echo "OK"

# ---- ad-hoc re-sign so macOS will let users open it ----
echo "==> Re-signing app (ad-hoc)"
codesign --force --deep --sign - "$APP_PATH"
echo "OK"

# ---- create DMG manually ----
# Bug real: app ad-hoc signed (sem certificado pago da Apple, sem notarização) baixado da
# internet fica com o atributo de quarentena do macOS, e nessa combinação (ad-hoc + quarentena)
# o Gatekeeper mostra "está danificado e não pode ser aberto" em vez do aviso normal de
# "desenvolvedor não identificado" — "clique direito > Abrir" e permitir nas Preferências do
# Sistema NÃO resolvem esse erro específico (só resolvem o aviso de desenvolvedor não
# identificado). A única solução sem comprar um certificado Apple Developer ($99/ano) é limpar
# o atributo de quarentena manualmente (xattr -cr). Como quase ninguém lê a descrição da
# release no GitHub antes de abrir o .dmg, um README.txt DENTRO do .dmg (visível na hora que a
# pessoa abre a janela) é o lugar que realmente chega no usuário.
echo "==> Creating DMG"
APP_VERSION="$(app_version)"
DMG_STAGING="build/dmg-staging"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"
cp -R "$APP_PATH" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Aplicativos"
cat > "$DMG_STAGING/LEIA-ME antes de abrir.txt" <<'EOF'
AutoClip Desktop — como abrir no Mac
=====================================

Ao tentar abrir o app pela primeira vez, o macOS pode mostrar a mensagem:

    "AutoClip Desktop está danificado e não pode ser aberto.
     Você deve movê-lo para o Lixo."

O app NÃO está danificado. Isso acontece porque ele não foi baixado da
App Store nem tem um certificado pago da Apple — clicar com o botão
direito e escolher "Abrir", ou permitir nas Preferências do Sistema >
Privacidade e Segurança, NÃO resolve esse erro específico.

Como resolver (só precisa fazer uma vez por atualização):

1. Arraste o "AutoClip Desktop" para a pasta "Aplicativos" (atalho ao lado).
2. Abra o Terminal (Spotlight: Cmd+Espaço, digite "Terminal", Enter).
3. Cole o comando abaixo e aperte Enter:

   xattr -cr "/Applications/AutoClip Desktop.app"

4. Abra o AutoClip Desktop normalmente (Spotlight ou pasta Aplicativos).

Depois disso o app abre normalmente, inclusive em futuras atualizações
(precisa repetir o comando acima só se o aviso voltar a aparecer).
EOF
DMG_PATH="src-tauri/target/release/bundle/macos/AutoClip Desktop_${APP_VERSION}_aarch64.dmg"
rm -f "$DMG_PATH"
hdiutil create -volname "AutoClip Desktop" \
    -srcfolder "$DMG_STAGING" \
    -ov -format UDZO \
    "$DMG_PATH"
echo "OK"

# ---- summary ----
APP_SIZE=$(du -sh "$APP_PATH" | awk '{print $1}')
DMG_SIZE=$(du -sh "$DMG_PATH" | awk '{print $1}')
echo ""
echo "==> Build complete"
echo "    App:  $APP_PATH ($APP_SIZE)"
echo "    DMG:  $DMG_PATH ($DMG_SIZE)"
