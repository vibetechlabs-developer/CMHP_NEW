# -*- coding: utf-8 -*-
"""Injects api-data.json into index_template.html -> index.html."""
import json

with open("../api-data.json", encoding="utf-8") as f:
    data = json.load(f)

# Compact (no indent) for the embedded copy to keep index.html leaner;
# api-data.json itself (already written by build.py) stays pretty-printed
# for human readability when reused separately.
compact = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
# Defend against a "</script>" sequence appearing inside any string value,
# which would prematurely close the embedding <script> tag.
compact = compact.replace("</", "<\\/")

with open("index_template.html", encoding="utf-8") as f:
    template = f.read()

assert "__API_DATA_JSON__" in template
out = template.replace("__API_DATA_JSON__", compact)

with open("../index.html", "w", encoding="utf-8") as f:
    f.write(out)

print("Wrote index.html:", len(out), "bytes")
