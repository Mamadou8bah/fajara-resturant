from pathlib import Path
import re

FILES = [
    Path(r"c:\Users\Mamadou\Downloads\fajara-resturant\client\src\features\menu\api.ts"),
    Path(r"c:\Users\Mamadou\Downloads\fajara-resturant\client\src\features\inventory\api.ts"),
    Path(r"c:\Users\Mamadou\Downloads\fajara-resturant\client\src\features\employees\api.ts"),
    Path(r"c:\Users\Mamadou\Downloads\fajara-resturant\client\src\features\settings\api.ts"),
]

ONLINE_ONLY = ("/auth/",)


def transform_call(full: str) -> str:
    if any(x in full for x in ONLINE_ONLY):
        return full
    if "method:" not in full and not re.search(r"\{\s*body", full):
        return full
    inner = re.sub(r"\bapi(<[^>]*(?:<[^>]*>[^>]*)*>)?\(", r"staffMutate\1(", full, count=1)
    if "method:" not in inner and re.search(r"\{\s*body", inner):
        inner = re.sub(r"\{\s*body\b", "{ method: 'POST', body", inner, count=1)
    if "scope:" not in inner:
        inner = re.sub(r"\}\s*\)$", ", scope: 'MUTATION' })", inner.strip())
        if not inner.endswith(");"):
            # ensure trailing );
            if inner.endswith("}"):
                inner = inner + ");"
            elif inner.endswith("})"):
                inner = inner + ";"
    # settings tables use SESSION scope
    if "/tables" in full and "scope: 'MUTATION'" in inner:
        inner = inner.replace("scope: 'MUTATION'", "scope: 'SESSION'")
    if "/settings/" in full and "scope:" in inner:
        inner = inner.replace("scope: 'SESSION'", "scope: 'MUTATION'")
    return inner


def process(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "staffMutate" not in text:
        text = text.replace(
            "import { api } from '@/lib/api';",
            "import { api } from '@/lib/api';\nimport { staffMutate } from '@/lib/staffMutate';",
        )
    pattern = re.compile(r"return api(?:<[^;]+?>)?\([^;]*?\);", re.DOTALL)
    count = 0

    def sub(m: re.Match[str]) -> str:
        nonlocal count
        before = m.group(0)
        after = transform_call(before)
        if after != before:
            count += 1
        return after

    new_text = pattern.sub(sub, text)

    # Explicit onlineOnly for pin/password
    new_text = new_text.replace(
        "return api('/auth/pin', { method: 'PATCH', body });",
        "return api('/auth/pin', { method: 'PATCH', body }); // online-only",
    )

    path.write_text(new_text, encoding="utf-8")
    print(f"{path.name}: wrapped {count}")


for f in FILES:
    process(f)
