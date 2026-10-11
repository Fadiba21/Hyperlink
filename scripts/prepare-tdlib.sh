#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TDLIB="$ROOT/node_modules/react-native-tdlib/android"

if [[ ! -d "$TDLIB" ]]; then
  echo "react-native-tdlib belum terpasang. Jalankan npm ci terlebih dahulu." >&2
  exit 1
fi

JNI_LIBS="$TDLIB/src/main/jniLibs"
if [[ -d "$JNI_LIBS" ]]; then
  [[ -d "$JNI_LIBS/arm64-v8a" ]] || { echo "react-native-tdlib arm64-v8a library is missing." >&2; exit 1; }
  shopt -s nullglob
  for ABI_DIR in "$JNI_LIBS"/*; do
    [[ -d "$ABI_DIR" ]] || continue
    if [[ "${ABI_DIR##*/}" != "arm64-v8a" ]]; then
      rm -rf "$ABI_DIR"
    fi
  done
fi

BUILD_GRADLE="$TDLIB/build.gradle"
if ! grep -q "exclude 'com/reactnativetdlib/MainApplication.java'" "$BUILD_GRADLE"; then
  python3 - "$BUILD_GRADLE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
needle = "            jniLibs.srcDirs = ['src/main/jniLibs']\n"
if needle not in s:
    raise SystemExit('Format react-native-tdlib build.gradle berubah; patch manual diperlukan.')
s = s.replace(needle, needle + "            java { exclude 'com/reactnativetdlib/MainApplication.java' }\n", 1)
p.write_text(s)
PY
fi

mkdir -p "$TDLIB/src/main/res/values"
if [[ ! -f "$TDLIB/src/main/res/values/strings.xml" ]]; then
  cat > "$TDLIB/src/main/res/values/strings.xml" <<'XML'
<resources>
    <string name="app_name">Hyperlink</string>
</resources>
XML
fi

echo "react-native-tdlib native compatibility patch siap."
