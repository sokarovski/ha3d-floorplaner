"""Package the integration from an allowlist, never from whatever happens to be in the working tree.

Outputs (all under dist/):
- homeplan-<version>.zip: the integration's files at the ZIP root, the layout Marketplace `zip_release`
  installs into custom_components/homeplan/ (also the manual-install download).
- ha3d-release/homeplan.zip: the same bytes under the asset name hacs.json `filename` names.
- ha3d/: the exact content of the generated public Marketplace repository.
"""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT_PATH = "custom_components/homeplan"
COMPONENT = ROOT / COMPONENT_PATH
TEMPLATE = ROOT / "packaging/ha3d"
DIST = ROOT / "dist"
# Build outputs that are ignored by Git but must ship (npm run build:ha-viewer).
GENERATED = {
    "frontend/loader.js",
    "frontend/viewer.js",
    "frontend/manifest.json",
    "schemas.json",
    "THIRD_PARTY_NOTICES.md",
}
# Committed outputs of npm run brand:build; listed so an uncommitted render is still packaged.
BRAND = {"brand/icon.png", "brand/icon@2x.png", "brand/logo.png", "brand/logo@2x.png"}
ALLOWED_SUFFIXES = {".py", ".json", ".js", ".md", ".png"}
RELEASE = "--release" in sys.argv


def fail(message: str) -> None:
    raise SystemExit("ha:package: " + message)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def json_file(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        fail(f"{path.relative_to(ROOT)} is not a JSON object")
    return value


# One version (BLD-5): package.json is the source; every shipped copy must agree.
version = json_file(ROOT / "package.json")["version"]
if not isinstance(version, str) or re.fullmatch(r"\d+\.\d+\.\d+", version) is None:
    fail("package.json version must be MAJOR.MINOR.PATCH")
constant = re.search(
    r'^VERSION = "([^"]+)"$', (COMPONENT / "const.py").read_text(), re.MULTILINE
)
frontend = (
    json_file(COMPONENT / "frontend/manifest.json")
    if (COMPONENT / "frontend/manifest.json").is_file()
    else {}
)
copies = {
    "manifest.json version": json_file(COMPONENT / "manifest.json").get("version"),
    "const.py VERSION": None if constant is None else constant.group(1),
    "frontend/manifest.json version": frontend.get("version"),
    "frontend/manifest.json minimumIntegrationVersion": frontend.get(
        "minimumIntegrationVersion"
    ),
}
mismatched = [f"{name}={value}" for name, value in copies.items() if value != version]
if mismatched:
    fail(
        f"version {version} from package.json differs: {', '.join(mismatched)}; run npm run build:ha-viewer"
    )

# Allowlist (BLD-6): tracked component files plus the named generated/brand files; anything else fails.
tracked = {
    line.removeprefix(COMPONENT_PATH + "/")
    for line in git("ls-files", "--", COMPONENT_PATH).splitlines()
    if line
}
dirty = git("status", "--porcelain", "--", COMPONENT_PATH).strip()
if dirty and RELEASE:
    fail(
        "tracked component files have uncommitted changes; commit before a release build"
    )
allowed = tracked | GENERATED | BRAND
present: set[str] = set()
for path in COMPONENT.rglob("*"):
    relative = path.relative_to(COMPONENT).as_posix()
    if path.is_symlink():
        fail(f"symlink not allowed: {relative}")
    if not path.is_file() or "__pycache__" in path.parts:
        continue  # Python bytecode caches are local byproducts, never packaged.
    present.add(relative)
strays = sorted(present - allowed)
if strays:
    fail("unexpected files in the component: " + ", ".join(strays))
missing = sorted(allowed - present)
if missing:
    fail(
        "missing "
        + ", ".join(missing)
        + "; run npm run build:ha-viewer and npm run brand:build"
    )
bad_types = sorted(
    name for name in allowed if Path(name).suffix not in ALLOWED_SUFFIXES
)
if bad_types:
    fail("file types outside the package allowlist: " + ", ".join(bad_types))
for entry in frontend.get("files", []):
    data = (COMPONENT / "frontend" / entry["path"]).read_bytes()
    if (
        hashlib.sha256(data).hexdigest() != entry["sha256"]
        or len(data) != entry["byteSize"]
    ):
        fail("frontend bytes differ from their manifest; rebuild before packaging")

# A release must not carry the build machine's paths (bundlers write module paths into comments; a linked or
# out-of-tree node_modules makes them absolute, e.g. /Users/<name>/...).
absolute_path = re.compile(rb"(?:/Users/|/home/|[A-Za-z]:\\\\Users\\\\)[^/\\\s\"']+")
for name in sorted(allowed):
    if Path(name).suffix in (".png",):
        continue
    if absolute_path.search((COMPONENT / name).read_bytes()):
        fail(f"{name} contains an absolute home-directory path; build from a normal checkout")

files = sorted(allowed)
DIST.mkdir(exist_ok=True)
output = DIST / f"homeplan-{version}.zip"
# Fixed timestamps and order: the same inputs give the same archive bytes.
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (COMPONENT / name).read_bytes(), compresslevel=9)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        fail("corrupt archive member")
    names = archive.namelist()
if names != files or "manifest.json" not in names:
    fail("archive inventory differs from the allowlist")
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(f"{digest}  {output.name}\n")
release = DIST / "ha3d-release"
shutil.rmtree(release, ignore_errors=True)
release.mkdir()
shutil.copyfile(output, release / "homeplan.zip")
(release / "homeplan.zip.sha256").write_text(f"{digest}  homeplan.zip\n")

# The generated public Marketplace repository (sokarovski/ha3d): nothing else may be in it.
hacs = json_file(TEMPLATE / "hacs.json")
if hacs.get("zip_release") is not True or hacs.get("filename") != "homeplan.zip":
    fail("packaging/ha3d/hacs.json must use zip_release with filename homeplan.zip")
tree = DIST / "ha3d"
shutil.rmtree(tree, ignore_errors=True)
for name in files:
    target = tree / COMPONENT_PATH / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(COMPONENT / name, target)
shutil.copyfile(TEMPLATE / "hacs.json", tree / "hacs.json")
shutil.copyfile(TEMPLATE / "README.md", tree / "README.md")
shutil.copyfile(ROOT / "LICENSE", tree / "LICENSE")

print(
    f"Integration {version}: {output.relative_to(ROOT)} ({output.stat().st_size} bytes, {len(names)} files)"
)
print(f"SHA-256: {digest}")
print(
    f"Release asset: {(release / 'homeplan.zip').relative_to(ROOT)}; Marketplace repository tree: {tree.relative_to(ROOT)}/"
)
if dirty:
    print(
        "Note: tracked component files have uncommitted changes (a --release build refuses this)."
    )
